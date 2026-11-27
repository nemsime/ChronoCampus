from collections import Counter, defaultdict

from app.calendar.rules import (
    allowed_slots,
    as_date,
    audience_size,
    audiences_overlap,
    cohort_compactness,
    lesson_slot,
    overlaps,
    pe_workload_errors,
    requires_pe,
    resource_rule_matches,
    rule_applies_to_resource,
    teaching_dates,
    week_index,
)


def validation_context(snapshot):
    """Indexes scoped to one immutable input snapshot, never shared across requests."""
    external = defaultdict(list)
    for item in snapshot["external"]:
        external[as_date(item["day"])].append(item)
    return {
        "days": {
            group_id: set(teaching_dates(snapshot, group_id))
            for group_id in {c["course_group_id"] for c in snapshot["workloads"]}
        },
        "sizes": {c["id"]: audience_size(snapshot, c) for c in snapshot["workloads"]},
        "rooms": {r["id"]: r for r in snapshot["rooms"]},
        "teachers": {t["id"] for t in snapshot["teachers"] if t["is_active"]},
        "holidays": {as_date(h["day"]) for h in snapshot["holidays"]},
        "disruptions": {d["occurrence_id"]: d for d in snapshot.get("disruptions", [])},
        "slots": {},
        "times": {},
        "external": external,
        "independent_labs": {lab["id"] for lab in snapshot["lab_groups"] if lab.get("small_group_id") is None},
    }


def placement_errors(
    snapshot: dict, assignment: dict, component: dict, context=None
) -> list[str]:
    context = context if context is not None else validation_context(snapshot)
    errors = []
    day = as_date(assignment["day"])
    config = snapshot["calendar"]
    if day not in context["days"][component["course_group_id"]]:
        errors.append("outside_teaching_period")
    for closure in snapshot.get("closures", []):
        if (component["course_group_id"] in closure["cohort_ids"]
                and as_date(closure["starts_on"]) <= day <= as_date(closure["ends_on"])):
            errors.append("teaching_closed")
    key = (component["course_group_id"], day)
    if key not in context["slots"]:
        context["slots"][key] = allowed_slots(snapshot, key[0], day)
    if assignment["slot"] not in context["slots"][key]:
        errors.append("slot_not_permitted")
    disruption = context["disruptions"].get(assignment.get("occurrence_id"))
    if disruption and (
        as_date(disruption["original_day"]) != day
        or assignment["slot"] <= config["ordinary_slots"]
    ):
        errors.append("emergency_requires_extra_slot")
    try:
        if assignment["slot"] not in context["times"]:
            context["times"][assignment["slot"]] = lesson_slot(
                config, assignment["slot"]
            )
        start, end = context["times"][assignment["slot"]]
        if (
            str(assignment["starts_at"])[:5] != start
            or str(assignment["ends_at"])[:5] != end
        ):
            errors.append("slot_time_mismatch")
    except ValueError as error:
        errors.append(str(error))
    teacher_id = component["teacher_id"]
    room_id = assignment["room_id"]
    if component["lesson_type"] == "pe":
        if room_id is not None:
            errors.append("pe_room_not_permitted")
    else:
        room = context["rooms"].get(room_id)
        if not room:
            return errors + ["room_not_found"]
        if room["capacity"] < context["sizes"][component["id"]]:
            errors.append("room_capacity")
        suitable_types = {
            "lecture": {"lecture_hall", "classroom"},
            "practical": {"classroom", "lab", "language_lab"},
            "lab": {"lab", "language_lab"},
        }
        if room["room_type"] not in suitable_types[component["lesson_type"]]:
            errors.append("room_type")
        if not set(component["equipment_ids"]).issubset(room["equipment_ids"]):
            errors.append("room_equipment")
        if teacher_id not in context["teachers"]:
            errors.append("lecturer_required")
    holiday = day in context["holidays"]
    cancelled = assignment.get("cancelled", False)
    if holiday and not cancelled:
        errors.append("holiday")
    if cancelled and (not holiday or snapshot["term"]["holiday_policy"] != "exempt"):
        errors.append("cancellation_not_permitted")
    if not cancelled:
        for rule in snapshot["availability"]:
            if rule["kind"] != "unavailable":
                continue
            if not rule_applies_to_resource(rule, teacher_id, room_id):
                continue
            if resource_rule_matches(
                rule, snapshot, day, assignment["starts_at"], assignment["ends_at"]
            ):
                errors.append(
                    "teacher_unavailable" if rule["teacher_id"] else "room_unavailable"
                )
        for other in context["external"].get(day, []):
            if overlaps(
                assignment["starts_at"],
                assignment["ends_at"],
                other["starts_at"],
                other["ends_at"],
            ):
                if teacher_id is not None and other["teacher_id"] == teacher_id:
                    errors.append("external_teacher_conflict")
                if room_id is not None and other["room_id"] == room_id:
                    errors.append("external_room_conflict")
                if audiences_overlap(component, other, context["independent_labs"]):
                    errors.append("external_group_conflict")
    return sorted(set(errors))


def validate(snapshot: dict, assignments: list[dict]) -> dict:
    context = validation_context(snapshot)
    components = {c["id"]: c for c in snapshot["workloads"]}
    occurrences = {o["id"]: o for o in snapshot["occurrences"]}
    groups = {group["id"]: group for group in snapshot["groups"]}
    seen, placed, cancelled = set(), Counter(), Counter()
    issues, effective = [], []
    cohort_slots = defaultdict(set)
    pe_days, pe_weeks = Counter(), Counter()
    if not components:
        issues.append({"code": "workload_empty"})
    if not snapshot["term"]["confirmed"] or not snapshot["calendar"]["confirmed"]:
        issues.append({"code": "configuration_unconfirmed"})
    pe_groups = {
        c["course_group_id"] for c in components.values() if c["lesson_type"] == "pe"
    }
    workload_groups = {c["course_group_id"] for c in components.values()}
    selected_groups = set(snapshot.get("cohort_ids", workload_groups))
    for group_id in sorted(selected_groups - pe_groups):
        if requires_pe(groups[group_id], snapshot["term"]):
            issues.append({"code": "pe_missing", "course_group_id": group_id})
    for group_id in workload_groups:
        form = groups[group_id].get("study_form")
        if form is not None and form != snapshot["calendar"]["study_form"]:
            issues.append({"code": "study_form_mismatch", "course_group_id": group_id})
        if not any(
            p["course_group_id"] in {None, group_id} for p in snapshot["periods"]
        ):
            issues.append(
                {"code": "teaching_period_required", "course_group_id": group_id}
            )
        else:
            weeks = {week_index(snapshot["term"]["starts_on"], day)
                     for day in context["days"][group_id]}
            configured = snapshot["calendar"]["teaching_weeks"]
            if len(weeks) != configured:
                issues.append({"code": "teaching_week_count_mismatch",
                               "course_group_id": group_id,
                               "configured": configured, "actual": len(weeks)})
    for component in components.values():
        if component["lesson_type"] == "pe":
            codes = pe_workload_errors(
                component, groups[component["course_group_id"]],
                snapshot["term"], snapshot["calendar"],
            )
            issues.extend({"component_id": component["id"], "code": code} for code in codes)
    required_makeup = {o["occurrence_id"] for o in snapshot.get("overrides", [])}
    for assignment in assignments:
        identifier = assignment["occurrence_id"]
        if identifier not in occurrences or identifier in seen:
            issues.append({"occurrence_id": identifier, "code": "invalid_occurrence"})
            continue
        seen.add(identifier)
        if identifier in required_makeup and assignment.get("cancelled"):
            issues.append({"occurrence_id": identifier, "code": "makeup_required"})
        component = components[occurrences[identifier]["component_id"]]
        errors = placement_errors(snapshot, assignment, component, context)
        if component["lesson_type"] == "pe" and not errors:
            day = as_date(assignment["day"])
            daily = component["id"], day
            weekly = component["id"], week_index(snapshot["term"]["starts_on"], day)
            pe_days[daily] += 1
            pe_weeks[weekly] += 1
            if pe_days[daily] > 1:
                errors.append("pe_same_day")
            if pe_weeks[weekly] > 2:
                errors.append("pe_weekly_frequency")
        issues.extend({"occurrence_id": identifier, "code": code} for code in errors)
        if not errors:
            (cancelled if assignment.get("cancelled") else placed)[component["id"]] += 1
        if not assignment.get("cancelled"):
            for other, other_component in effective:
                if as_date(other["day"]) != as_date(assignment["day"]):
                    continue
                if not overlaps(
                    other["starts_at"],
                    other["ends_at"],
                    assignment["starts_at"],
                    assignment["ends_at"],
                ):
                    continue
                for condition, code in (
                    (
                        assignment["room_id"] is not None and other["room_id"] == assignment["room_id"],
                        "room_conflict",
                    ),
                    (
                        component["teacher_id"] is not None
                        and other_component["teacher_id"] == component["teacher_id"],
                        "teacher_conflict",
                    ),
                    (audiences_overlap(component, other_component, context["independent_labs"]), "group_conflict"),
                ):
                    if condition:
                        issues.append(
                            {
                                "occurrence_id": identifier,
                                "other_occurrence_id": other["occurrence_id"],
                                "code": code,
                            }
                        )
            effective.append((assignment, component))
            cohort_slots[component["course_group_id"], as_date(assignment["day"])].add(assignment["slot"])
    lookup = {a["occurrence_id"]: a for a in assignments}
    for pin in snapshot["pins"]:
        candidate = lookup.get(pin["occurrence_id"])
        if not candidate or any(
            str(candidate[k])[:5] != str(pin[k])[:5]
            if k in {"starts_at", "ends_at"}
            else str(candidate[k]) != str(pin[k])
            for k in ("day", "slot", "room_id", "starts_at", "ends_at")
        ):
            issues.append(
                {"occurrence_id": pin["occurrence_id"], "code": "pin_changed"}
            )
    units = snapshot["calendar"].get("academic_hours_per_lesson") or 0
    ledger = []
    for component in components.values():
        planned, skipped = (
            placed[component["id"]] * units,
            cancelled[component["id"]] * units,
        )
        credited = planned + (
            skipped if snapshot["term"]["holiday_policy"] == "exempt" else 0
        )
        ledger.append(
            {
                "component_id": component["id"],
                "required_hours": component["semester_hours"],
                "planned_hours": planned,
                "cancelled_hours": skipped,
                "remaining_hours": component["semester_hours"] - credited,
            }
        )
    unplaced = sorted(set(occurrences) - seen)
    complete = not issues and not unplaced and all(row["remaining_hours"] == 0 for row in ledger)
    return {
        "complete": complete,
        "compactness": cohort_compactness(cohort_slots),
        "issues": issues,
        "hours": ledger,
        "unplaced_occurrences": unplaced,
    }
