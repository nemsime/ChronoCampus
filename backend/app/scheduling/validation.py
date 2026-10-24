from collections import Counter, defaultdict

from app.calendar.rules import (
    allowed_slots,
    as_date,
    audience_size,
    audiences_overlap,
    lesson_slot,
    overlaps,
    resource_rule_matches,
    teaching_dates,
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
    room = context["rooms"].get(assignment["room_id"])
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
    if component["teacher_id"] not in context["teachers"]:
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
            if (
                rule["teacher_id"] != component["teacher_id"]
                and rule["room_id"] != room["id"]
            ):
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
                if other["teacher_id"] == component["teacher_id"]:
                    errors.append("external_teacher_conflict")
                if other["room_id"] == room["id"]:
                    errors.append("external_room_conflict")
                if audiences_overlap(component, other):
                    errors.append("external_group_conflict")
    return sorted(set(errors))


def validate(snapshot: dict, assignments: list[dict]) -> dict:
    context = validation_context(snapshot)
    components = {c["id"]: c for c in snapshot["workloads"]}
    occurrences = {o["id"]: o for o in snapshot["occurrences"]}
    seen, placed, cancelled = set(), Counter(), Counter()
    issues, effective = [], []
    if not components:
        issues.append({"code": "workload_empty"})
    if not snapshot["term"]["confirmed"] or not snapshot["calendar"]["confirmed"]:
        issues.append({"code": "configuration_unconfirmed"})
    for group_id in {c["course_group_id"] for c in components.values()}:
        if not any(
            p["course_group_id"] in {None, group_id} for p in snapshot["periods"]
        ):
            issues.append(
                {"code": "teaching_period_required", "course_group_id": group_id}
            )
    for assignment in assignments:
        identifier = assignment["occurrence_id"]
        if identifier not in occurrences or identifier in seen:
            issues.append({"occurrence_id": identifier, "code": "invalid_occurrence"})
            continue
        seen.add(identifier)
        component = components[occurrences[identifier]["component_id"]]
        errors = placement_errors(snapshot, assignment, component, context)
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
                    (other["room_id"] == assignment["room_id"], "room_conflict"),
                    (
                        other_component["teacher_id"] == component["teacher_id"],
                        "teacher_conflict",
                    ),
                    (audiences_overlap(component, other_component), "group_conflict"),
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
    complete = not issues and all(row["remaining_hours"] == 0 for row in ledger)
    return {
        "complete": complete,
        "issues": issues,
        "hours": ledger,
        "unplaced_occurrences": sorted(set(occurrences) - seen),
    }
