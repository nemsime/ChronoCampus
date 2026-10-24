"""Two-week pattern search with stable dated occurrences and independent validation."""

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import timedelta
import random
import time

from ortools.sat.python import cp_model

from app.calendar.rules import (
    as_date,
    audience_leaves,
    lesson_slot,
    minutes,
    resource_rule_matches,
    teaching_dates,
    week_index,
    allowed_slots,
    audiences_overlap,
)
from app.scheduling.validation import placement_errors, validate, validation_context


@dataclass(frozen=True)
class Candidate:
    occurrence_id: int
    component_id: int
    day: str
    slot: int
    starts_at: str
    ends_at: str
    room_id: int
    cancelled: bool
    pinned: bool
    series: str
    pattern: tuple | None
    resources: tuple
    preference_cost: int

    def assignment(self):
        return {
            key: getattr(self, key)
            for key in (
                "occurrence_id",
                "day",
                "slot",
                "starts_at",
                "ends_at",
                "room_id",
                "cancelled",
                "pinned",
            )
        }


def series_weeks(count: int, weeks: list[int]):
    whole, remainder = divmod(count, len(weeks))
    series = [[weeks] for _ in range(whole)]
    if remainder:
        parity_options = [[w for w in weeks if w % 2 == parity] for parity in (0, 1)]
        alternatives = [option for option in parity_options if len(option) == remainder]
        if not alternatives:
            alternatives = [
                [weeks[i * len(weeks) // remainder] for i in range(remainder)]
            ]
        series.append(alternatives)
    return series


def candidates_for(snapshot):
    context = validation_context(snapshot)
    by_occurrence, reasons, weights = {}, {}, {}
    term, config = snapshot["term"], snapshot["calendar"]
    first = as_date(term["starts_on"])
    anchor = first - timedelta(days=first.weekday())
    pins = {p["occurrence_id"]: p for p in snapshot["pins"]}
    disruptions = {d["occurrence_id"]: d for d in snapshot.get("disruptions", [])}
    holidays = {h["day"] for h in snapshot["holidays"]}
    for component in snapshot["workloads"]:
        occurrences = sorted(
            (
                o
                for o in snapshot["occurrences"]
                if o["component_id"] == component["id"]
            ),
            key=lambda o: o["ordinal"],
        )
        leaves = audience_leaves(snapshot, component)
        weights.update(leaves)
        days = teaching_dates(snapshot, component["course_group_id"])
        weeks = sorted({week_index(term["starts_on"], day) for day in days})
        if not weeks or len(weeks) != config["teaching_weeks"]:
            for occurrence in occurrences:
                by_occurrence[occurrence["id"]] = []
                reasons[occurrence["id"]] = [
                    {
                        "code": "teaching_week_count_mismatch",
                        "configured": config["teaching_weeks"],
                        "actual": len(weeks),
                    }
                ]
            continue
        offset = 0
        for series_index, alternatives in enumerate(
            series_weeks(len(occurrences), weeks)
        ):
            for index in range(len(alternatives[0])):
                occurrence = occurrences[offset + index]
                identifier = occurrence["id"]
                found, rejected = [], Counter()
                pinned = pins.get(identifier)
                options = []
                if pinned:
                    options = [(None, pinned)]
                elif identifier in disruptions:
                    day = as_date(disruptions[identifier]["original_day"])
                    for slot in allowed_slots(
                        snapshot, component["course_group_id"], day
                    ):
                        if slot <= config["ordinary_slots"]:
                            continue
                        start, end = lesson_slot(config, slot)
                        for room in snapshot["rooms"]:
                            options.append(
                                (
                                    None,
                                    {
                                        "occurrence_id": identifier,
                                        "day": day.isoformat(),
                                        "slot": slot,
                                        "starts_at": start,
                                        "ends_at": end,
                                        "room_id": room["id"],
                                        "cancelled": False,
                                    },
                                )
                            )
                else:
                    for option_index, sequence in enumerate(alternatives):
                        for weekday in config["weekdays"]:
                            day = anchor + timedelta(
                                weeks=sequence[index], days=weekday
                            )
                            if day not in days:
                                continue
                            for slot in allowed_slots(
                                snapshot, component["course_group_id"], day
                            ):
                                start, end = lesson_slot(config, slot)
                                for room in snapshot["rooms"]:
                                    options.append(
                                        (
                                            (option_index, weekday, slot),
                                            {
                                                "day": day.isoformat(),
                                                "slot": slot,
                                                "starts_at": start,
                                                "ends_at": end,
                                                "room_id": room["id"],
                                                "cancelled": day.isoformat() in holidays
                                                and term["holiday_policy"] == "exempt",
                                            },
                                        )
                                    )
                for pattern, option in options:
                    option = {**option, "occurrence_id": identifier}
                    errors = placement_errors(snapshot, option, component, context)
                    if errors:
                        rejected.update(errors)
                        continue
                    resources = (
                        ()
                        if option.get("cancelled")
                        else (
                            f"teacher:{component['teacher_id']}",
                            f"room:{option['room_id']}",
                            *(f"student:{leaf}" for leaf in leaves),
                        )
                    )
                    preferences = [
                        r
                        for r in snapshot["availability"]
                        if r["kind"] == "preferred"
                        and (
                            r["teacher_id"] == component["teacher_id"]
                            or r["room_id"] == option["room_id"]
                        )
                        and as_date(r["starts_on"])
                        <= as_date(option["day"])
                        <= as_date(r["ends_on"])
                    ]
                    penalty = int(
                        bool(preferences)
                        and not any(
                            resource_rule_matches(
                                r,
                                snapshot,
                                option["day"],
                                option["starts_at"],
                                option["ends_at"],
                            )
                            and minutes(r["from_time"]) <= minutes(option["starts_at"])
                            and minutes(option["ends_at"]) <= minutes(r["until_time"])
                            for r in preferences
                        )
                    )
                    found.append(
                        Candidate(
                            identifier,
                            component["id"],
                            str(option["day"]),
                            option["slot"],
                            str(option["starts_at"])[:5],
                            str(option["ends_at"])[:5],
                            option["room_id"],
                            option.get("cancelled", False),
                            bool(pinned),
                            f"{component['id']}:{series_index}",
                            pattern,
                            resources,
                            penalty,
                        )
                    )
                by_occurrence[identifier] = found
                # Rejection counts establish local restrictions, not a global impossibility proof.
                reasons[identifier] = [
                    {"code": code, "rejected_candidates": count}
                    for code, count in rejected.most_common()
                ]
                if not options and identifier in disruptions:
                    reasons[identifier] = [
                        {"code": "emergency_extra_permission_required"}
                    ]
            offset += len(alternatives[0])
    return by_occurrence, reasons, weights


def metrics(selected, weights, snapshot):
    occupied = defaultdict(set)
    for candidate in selected:
        for resource in candidate.resources:
            occupied[resource, candidate.day].add(candidate.slot)
    student_gaps, teacher_gaps, balance = 0, 0, 0
    weekly_counts = defaultdict(list)
    for (resource, day), slots in occupied.items():
        gap = max(slots) - min(slots) + 1 - len(slots)
        if resource.startswith("student:"):
            weight = weights.get(resource.removeprefix("student:"), 1)
            student_gaps += gap * weight
            weekly_counts[
                resource, week_index(snapshot["term"]["starts_on"], day)
            ].append(len(slots))
        elif resource.startswith("teacher:"):
            teacher_gaps += gap
    for (resource, week), counts in weekly_counts.items():
        counts += [0] * max(0, len(snapshot["calendar"]["weekdays"]) - len(counts))
        balance += (max(counts) - min(counts)) * weights.get(
            resource.removeprefix("student:"), 1
        )
    limits = preferred_limits(snapshot)
    overload = sum(
        max(0, len(slots) - limits[resource])
        for (resource, day), slots in occupied.items()
        if resource in limits
    )
    components = {c["id"]: c for c in snapshot["workloads"]}
    inverted = 0
    if snapshot["calendar"].get("lecture_order") == "same_day":
        for first in selected:
            for second in selected:
                a, b = components[first.component_id], components[second.component_id]
                if (
                    not first.cancelled
                    and not second.cancelled
                    and first.day == second.day
                    and first.slot < second.slot
                    and a["lesson_type"] != "lecture"
                    and b["lesson_type"] == "lecture"
                    and a["subject_id"] == b["subject_id"]
                    and audiences_overlap(a, b)
                ):
                    inverted += 1
    quality = snapshot["calendar"].get("quality_weights", {})
    preference = sum(c.preference_cost for c in selected)
    soft_cost = (
        quality.get("teacher_gaps", 1) * teacher_gaps
        + quality.get("preferences", 1) * preference
        + quality.get("daily_overload", 1) * overload
        + quality.get("lecture_order", 1) * inverted
    )
    return {
        "placed": len(selected),
        "student_gaps": student_gaps,
        "daily_imbalance": balance,
        "teacher_gaps": teacher_gaps,
        "preference_cost": preference,
        "daily_overload": overload,
        "lecture_order_violations": inverted,
        "soft_cost": soft_cost,
    }


def preferred_limits(snapshot):
    result = {}
    for component in snapshot["workloads"]:
        maximum = component.get("preferred_daily_max")
        if maximum:
            for leaf in audience_leaves(snapshot, component):
                resource = "student:" + leaf
                result[resource] = min(maximum, result.get(resource, maximum))
    return result


def compatible(candidate, selected):
    for other in selected:
        if candidate.occurrence_id == other.occurrence_id:
            return False
        if (
            candidate.series == other.series
            and candidate.pattern
            and other.pattern
            and candidate.pattern != other.pattern
        ):
            return False
        if (
            candidate.day == other.day
            and candidate.slot == other.slot
            and set(candidate.resources).intersection(other.resources)
        ):
            return False
    return True


def greedy_search(pools, snapshot, weights, seed, deadline, iterations=200, progress=None):
    if progress:
        progress("constructing", total=len(pools))
    randomizer = random.Random(seed)
    selected = [pool[0] for pool in pools.values() if pool and pool[0].pinned]
    order = sorted(pools, key=lambda identifier: (len(pools[identifier]), identifier))
    for identifier in order:
        if any(c.occurrence_id == identifier for c in selected):
            continue
        options = sorted(
            pools[identifier],
            key=lambda c: (c.preference_cost, c.slot, c.day, c.room_id),
        )
        candidate = next((c for c in options if compatible(c, selected)), None)
        if candidate:
            selected.append(candidate)

    def score(items):
        m = metrics(items, weights, snapshot)
        return (-len(items), m["student_gaps"], m["daily_imbalance"], m["soft_cost"])

    best_score = score(selected)
    if progress:
        progress("improving", placed=len(selected), total=len(pools))
    if not order:
        return selected, "HEURISTIC", []
    # Bounded displacement/reinsertion; pinned placements are never displaced.
    for _ in range(iterations):
        if time.monotonic() >= deadline:
            break
        identifier = randomizer.choice(order)
        if not pools[identifier] or pools[identifier][0].pinned:
            continue
        option = randomizer.choice(pools[identifier])
        trial = [c for c in selected if c.occurrence_id != identifier]
        conflicts = [c for c in trial if not compatible(option, [c])]
        if any(c.pinned for c in conflicts):
            continue
        trial = [c for c in trial if c not in conflicts] + [option]
        for missing in order:
            if not any(c.occurrence_id == missing for c in trial):
                replacement = next(
                    (c for c in pools[missing] if compatible(c, trial)), None
                )
                if replacement:
                    trial.append(replacement)
        value = score(trial)
        if value < best_score:
            selected, best_score = trial, value
            if progress:
                progress("improving", placed=len(selected), total=len(pools))
    return selected, "HEURISTIC", []


def constraint_search(pools, snapshot, weights, seed, deadline, progress=None):
    incumbent, _, _ = greedy_search(
        pools, snapshot, weights, seed, deadline, iterations=0, progress=progress
    )
    if progress:
        progress("building_model", placed=len(incumbent), total=len(pools))
    incumbent_set = set(incumbent)
    model = cp_model.CpModel()
    options, occupancy, patterns = [], defaultdict(list), {}
    for identifier, pool in pools.items():
        choices = []
        for candidate in pool:
            variable = model.new_bool_var(f"x{len(options)}")
            model.add_hint(variable, int(candidate in incumbent_set))
            options.append((candidate, variable))
            choices.append(variable)
            for resource in candidate.resources:
                occupancy[resource, candidate.day, candidate.slot].append(variable)
            if candidate.pattern is not None:
                key = (candidate.series, candidate.pattern)
                if key not in patterns:
                    patterns[key] = model.new_bool_var(f"p{len(patterns)}")
                model.add(variable <= patterns[key])
        if pool and pool[0].pinned:
            model.add(sum(choices) == 1)
        else:
            model.add(sum(choices) <= 1)
    series = defaultdict(list)
    for (key, pattern), variable in patterns.items():
        series[key].append(variable)
    for variables in series.values():
        model.add_at_most_one(variables)
    occupied = {}
    for key, variables in occupancy.items():
        model.add_at_most_one(variables)
        flag = model.new_bool_var(f"o{len(occupied)}")
        model.add(flag == sum(variables))
        occupied[key] = flag
    by_day = defaultdict(dict)
    for (resource, day, slot), variable in occupied.items():
        if not resource.startswith("room:"):
            by_day[resource, day][slot] = variable
    student_gaps, teacher_gaps, overloads = [], [], []
    limits = preferred_limits(snapshot)
    daily_counts = defaultdict(dict)
    for (resource, day), slots in by_day.items():
        low, high = min(slots), max(slots)
        for slot in range(low + 1, high):
            left = model.new_bool_var("left")
            right = model.new_bool_var("right")
            model.add_max_equality(left, [v for k, v in slots.items() if k < slot])
            model.add_max_equality(right, [v for k, v in slots.items() if k > slot])
            gap = model.new_bool_var("gap")
            occupied_here = slots.get(slot, 0)
            model.add(gap >= left + right - occupied_here - 1)
            model.add(gap <= left)
            model.add(gap <= right)
            model.add(gap <= 1 - occupied_here)
            if resource.startswith("student:"):
                student_gaps.append(
                    gap * weights.get(resource.removeprefix("student:"), 1)
                )
            else:
                teacher_gaps.append(gap)
        if resource.startswith("student:"):
            count = model.new_int_var(0, high, "daily")
            model.add(count == sum(slots.values()))
            if resource in limits:
                over = model.new_int_var(0, high, "overload")
                model.add_max_equality(over, [0, count - limits[resource]])
                overloads.append(over)
            daily_counts[resource, week_index(snapshot["term"]["starts_on"], day)][
                as_date(day).weekday()
            ] = count
    balances = []
    for (resource, week), days in daily_counts.items():
        counts = [days.get(day, 0) for day in snapshot["calendar"]["weekdays"]]
        limit = max((c.slot for c, _ in options), default=1)
        high, low = (
            model.new_int_var(0, limit, "high"),
            model.new_int_var(0, limit, "low"),
        )
        model.add_max_equality(high, counts)
        model.add_min_equality(low, counts)
        balances.append(
            (high - low) * weights.get(resource.removeprefix("student:"), 1)
        )
    count = sum(variable for _, variable in options)
    model.add(count >= len(incumbent))
    lecture_order_cost = []
    if snapshot["calendar"].get("lecture_order") == "same_day":
        component_slots = defaultdict(list)
        components = {c["id"]: c for c in snapshot["workloads"]}
        for candidate, variable in options:
            if not candidate.cancelled:
                component_slots[
                    candidate.component_id, candidate.day, candidate.slot
                ].append(variable)
        flags = {}
        for key, variables in component_slots.items():
            flag = model.new_bool_var("component_slot")
            model.add_max_equality(flag, variables)
            flags[key] = flag
        by_date = defaultdict(list)
        for (component_id, day, slot), flag in flags.items():
            by_date[day].append((components[component_id], slot, flag))
        for entries in by_date.values():
            for a, first_slot, first_flag in entries:
                if a["lesson_type"] == "lecture":
                    continue
                for b, second_slot, second_flag in entries:
                    if (
                        b["lesson_type"] != "lecture"
                        or first_slot >= second_slot
                        or a["subject_id"] != b["subject_id"]
                        or not audiences_overlap(a, b)
                    ):
                        continue
                    inversion = model.new_bool_var("lecture_order")
                    model.add(inversion >= first_flag + second_flag - 1)
                    model.add(inversion <= first_flag)
                    model.add(inversion <= second_flag)
                    lecture_order_cost.append(inversion)
    quality = snapshot["calendar"].get("quality_weights", {})
    preferences = (
        sum(c.preference_cost * v for c, v in options) * quality.get("preferences", 1)
        + sum(teacher_gaps) * quality.get("teacher_gaps", 1)
        + sum(overloads) * quality.get("daily_overload", 1)
        + sum(lecture_order_cost) * quality.get("lecture_order", 1)
    )
    objectives = [
        ("coverage", -count),
        ("student_gaps", sum(student_gaps)),
        ("balance", sum(balances)),
        ("preferences", preferences),
    ]
    selected, phases, status_name = incumbent, [], "HEURISTIC_FALLBACK"
    remaining = deadline - time.monotonic()
    if incumbent and remaining > 1:
        if progress:
            progress("initial_solution", placed=len(incumbent), total=len(pools))
        warm = cp_model.CpSolver()
        warm.parameters.num_search_workers = 1
        warm.parameters.max_time_in_seconds = min(5, remaining * 0.2)
        warm.parameters.fix_variables_to_their_hinted_value = True
        warm_status = warm.solve(model)
        phases.append(
            {
                "objective": "initial_solution",
                "status": warm.status_name(warm_status),
                "seconds": warm.wall_time,
            }
        )
        if warm_status in {cp_model.OPTIMAL, cp_model.FEASIBLE}:
            model.clear_hints()
            for index, value in enumerate(warm.response_proto.solution):
                model.add_hint(model.get_int_var_from_proto_index(index), value)
            status_name = "FEASIBLE"
    if len(incumbent) == len(pools):
        # The one-choice upper bound proves full coverage without spending a solve on it.
        model.add(count == len(pools))
        objectives = objectives[1:]
        phases.append(
            {
                "objective": "coverage",
                "status": "OPTIMAL",
                "value": -len(pools),
                "seconds": 0.0,
            }
        )
        if metrics(incumbent, weights, snapshot)["student_gaps"] == 0:
            model.add(sum(student_gaps) == 0)
            objectives = objectives[1:]
            phases.append(
                {
                    "objective": "student_gaps",
                    "status": "OPTIMAL",
                    "value": 0,
                    "seconds": 0.0,
                }
            )
    for index, (name, expression) in enumerate(objectives):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        solver = cp_model.CpSolver()
        solver.parameters.random_seed = seed
        solver.parameters.num_search_workers = 1
        # Retain the complete constructive hint; large table-free Boolean models otherwise
        # spend the whole diploma-scale time budget in presolve on modest laptops.
        solver.parameters.cp_model_presolve = False
        solver.parameters.max_time_in_seconds = (
            remaining
            if index == len(objectives) - 1
            else remaining * (0.55 if index == 0 else 0.65)
        )
        model.minimize(expression)
        if progress:
            progress(name, objective=name, placed=len(selected), total=len(pools))
        callback = SearchProgress(progress, count, len(pools), name) if progress else None
        status = solver.solve(model, callback)
        status_name = solver.status_name(status)
        phases.append(
            {"objective": name, "status": status_name, "seconds": solver.wall_time}
        )
        if status not in {cp_model.OPTIMAL, cp_model.FEASIBLE}:
            if index == 0 and incumbent and status != cp_model.MODEL_INVALID:
                status_name = "HEURISTIC_FALLBACK"
            break
        selected = [
            candidate for candidate, variable in options if solver.value(variable)
        ]
        value = (
            int(solver.value(expression))
            if not isinstance(expression, int)
            else expression
        )
        phases[-1]["value"] = value
        if progress:
            progress(name, objective=name, placed=len(selected), total=len(pools), solver_status=status_name)
        if (
            name == "coverage"
            and len(selected) < len(pools)
            and status == cp_model.FEASIBLE
        ):
            # Preserve the priority of completion: spend the rest on coverage.
            solver.parameters.max_time_in_seconds = max(
                0.001, deadline - time.monotonic()
            )
            if progress:
                progress("coverage_continued", placed=len(selected), total=len(pools))
            status = solver.solve(model, SearchProgress(progress, count, len(pools), "coverage_continued") if progress else None)
            phases.append(
                {
                    "objective": "coverage_continued",
                    "status": solver.status_name(status),
                    "seconds": solver.wall_time,
                }
            )
            if status in {cp_model.OPTIMAL, cp_model.FEASIBLE}:
                result = [c for c, v in options if solver.value(v)]
                if len(result) >= len(selected):
                    selected = result
            break
        model.add(expression == value)
        model.clear_hints()
        selected_set = set(selected)
        for candidate, variable in options:
            model.add_hint(variable, int(candidate in selected_set))
    if selected and status_name not in {"MODEL_INVALID", "HEURISTIC_FALLBACK"}:
        proven = {p["objective"] for p in phases if p["status"] == "OPTIMAL"}
        status_name = (
            "OPTIMAL"
            if {"coverage", "student_gaps", "balance", "preferences"} <= proven
            else "FEASIBLE"
        )
    return selected, status_name, phases


class SearchProgress(cp_model.CpSolverSolutionCallback):
    def __init__(self, progress, count, total, stage):
        super().__init__()
        self.progress, self.count, self.total, self.stage = progress, count, total, stage
        self.last = 0.

    def on_solution_callback(self):
        now = time.monotonic()
        if now - self.last >= 1:
            self.last = now
            self.progress(self.stage, placed=int(self.value(self.count)), total=self.total)


def generate(snapshot: dict, algorithm="cp_sat", seed=1, seconds=60, progress=None) -> dict:
    started = time.perf_counter()
    if progress:
        progress("preparing", total=len(snapshot["occurrences"]))
    pools, reasons, weights = candidates_for(snapshot)
    preparation_seconds = time.perf_counter() - started
    if progress:
        progress("candidates_ready", total=len(pools), candidate_count=sum(map(len, pools.values())),
                 preparation_seconds=preparation_seconds)
    invalid_pins = [
        pin["occurrence_id"]
        for pin in snapshot["pins"]
        if not pools.get(pin["occurrence_id"])
    ]
    if invalid_pins:
        return {
            "status": "INVALID_PINS",
            "assignments": [],
            "invalid_pins": invalid_pins,
            "diagnostics": reasons,
            "report": validate(snapshot, []),
            "elapsed_seconds": time.perf_counter() - started,
        }
    pins = [pool[0] for pool in pools.values() if pool and pool[0].pinned]
    if any(not compatible(pin, pins[:i]) for i, pin in enumerate(pins)):
        return {
            "status": "INVALID_PINS",
            "assignments": [],
            "diagnostics": reasons,
            "report": validate(snapshot, []),
            "elapsed_seconds": time.perf_counter() - started,
        }
    search = constraint_search if algorithm == "cp_sat" else greedy_search
    selected, status, phases = search(
        pools, snapshot, weights, seed, time.monotonic() + seconds, progress=progress
    )
    assignments = [c.assignment() for c in selected]
    if progress:
        progress("validating", placed=len(assignments), total=len(pools), solver_status=status)
    report = validate(snapshot, assignments)
    unplaced = {
        identifier: reasons[identifier] or [{"code": "search_incomplete"}]
        for identifier in report["unplaced_occurrences"]
    }
    return {
        "status": status,
        "assignments": assignments,
        "report": report,
        "diagnostics": unplaced,
        "metrics": metrics(selected, weights, snapshot),
        "phases": phases,
        "elapsed_seconds": time.perf_counter() - started,
        "preparation_seconds": preparation_seconds,
        "algorithm": algorithm,
        "seed": seed,
    }
