"""Shared calendar rules expressed in dates and integer minutes."""

from datetime import date, timedelta


def minutes(value) -> int:
    parts = str(value).split(":")
    return int(parts[0]) * 60 + int(parts[1])


def clock(value: int) -> str:
    if not 0 <= value < 1440:
        raise ValueError("outside_operating_hours")
    return f"{value // 60:02d}:{value % 60:02d}"


def lesson_slot(config: dict, number: int) -> tuple[str, str]:
    if number < 1:
        raise ValueError("invalid_slot")
    start = minutes(config["first_start"])
    for previous in range(1, number):
        start += config["lesson_minutes"] + config["break_overrides"].get(
            str(previous), config["break_minutes"]
        )
    end = start + config["lesson_minutes"]
    if config.get("operating_end") and end > minutes(config["operating_end"]):
        raise ValueError("outside_operating_hours")
    return clock(start), clock(end)


def as_date(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(value)


def week_index(start, day) -> int:
    first = as_date(start)
    monday = first - timedelta(days=first.weekday())
    return (as_date(day) - monday).days // 7


def parity(start, day) -> str:
    return "numerator" if week_index(start, day) % 2 == 0 else "denominator"


def dates_between(start, end):
    current = as_date(start)
    while current <= as_date(end):
        yield current
        current += timedelta(days=1)


def teaching_dates(snapshot: dict, group_id: int) -> list[date]:
    term, config = snapshot["term"], snapshot["calendar"]
    periods = [p for p in snapshot["periods"] if p["course_group_id"] == group_id]
    if not periods:
        periods = [p for p in snapshot["periods"] if p["course_group_id"] is None]
    if not periods:
        return []
    return [
        day
        for day in dates_between(term["starts_on"], term["ends_on"])
        if day.weekday() in config["weekdays"]
        and (
            not periods
            or any(
                as_date(p["starts_on"]) <= day <= as_date(p["ends_on"]) for p in periods
            )
        )
    ]


def allowed_slots(snapshot: dict, group_id: int, day) -> list[int]:
    day = as_date(day)
    config = snapshot["calendar"]
    allowed = set(range(1, config["ordinary_slots"] + 1))
    for permission in snapshot["extra_permissions"]:
        if permission["course_group_id"] not in {None, group_id}:
            continue
        if (
            not as_date(permission["starts_on"])
            <= day
            <= as_date(permission["ends_on"])
        ):
            continue
        if permission["weekday"] is not None and day.weekday() != permission["weekday"]:
            continue
        for number in permission["slots"]:
            try:
                start, end = lesson_slot(config, number)
            except ValueError:
                continue
            if minutes(permission["from_time"]) <= minutes(start) and minutes(
                end
            ) <= minutes(permission["until_time"]):
                allowed.add(number)
    result = []
    for number in sorted(allowed):
        try:
            lesson_slot(config, number)
            result.append(number)
        except ValueError:
            continue
    return result


def overlaps(start_a, end_a, start_b, end_b) -> bool:
    return minutes(start_a) < minutes(end_b) and minutes(start_b) < minutes(end_a)


def resource_rule_matches(rule: dict, snapshot: dict, day, start, end) -> bool:
    day = as_date(day)
    return (
        as_date(rule["starts_on"]) <= day <= as_date(rule["ends_on"])
        and (rule["weekday"] is None or rule["weekday"] == day.weekday())
        and rule["parity"] in {"every", parity(snapshot["term"]["starts_on"], day)}
        and overlaps(start, end, rule["from_time"], rule["until_time"])
    )


def audience_size(snapshot: dict, component: dict) -> int:
    for collection, key in (
        ("lab_groups", "lab_group_id"),
        ("subgroups", "small_group_id"),
        ("groups", "course_group_id"),
    ):
        if component.get(key):
            return next(
                item["capacity"]
                for item in snapshot[collection]
                if item["id"] == component[key]
            )
    raise ValueError("invalid_audience")


def audiences_overlap(first: dict, second: dict) -> bool:
    if first["course_group_id"] != second["course_group_id"]:
        return False
    if first.get("small_group_id") and second.get("small_group_id"):
        if first["small_group_id"] != second["small_group_id"]:
            return False
        if first.get("lab_group_id") and second.get("lab_group_id"):
            return first["lab_group_id"] == second["lab_group_id"]
    return True


def audience_leaves(snapshot: dict, component: dict) -> dict[str, int]:
    """Disjoint student segments for conflict/gap accounting; include unsplit remainders."""
    group_id = component["course_group_id"]
    group = next(g for g in snapshot["groups"] if g["id"] == group_id)
    smalls = [s for s in snapshot["subgroups"] if s["course_group_id"] == group_id]
    leaves = {}
    for small in smalls:
        if (
            component.get("small_group_id")
            and component["small_group_id"] != small["id"]
        ):
            continue
        labs = [
            lab
            for lab in snapshot["lab_groups"]
            if lab["small_group_id"] == small["id"]
        ]
        for lab in labs:
            if (
                not component.get("lab_group_id")
                or component["lab_group_id"] == lab["id"]
            ):
                leaves[f"lab:{lab['id']}"] = lab["capacity"]
        remainder = small["capacity"] - sum(lab["capacity"] for lab in labs)
        if remainder > 0 and not component.get("lab_group_id"):
            leaves[f"small:{small['id']}:rest"] = remainder
    remainder = group["capacity"] - sum(s["capacity"] for s in smalls)
    if remainder > 0 and not component.get("small_group_id"):
        leaves[f"group:{group_id}:rest"] = remainder
    return leaves


def required_pairs(hours: int, units: int | None) -> int:
    if not units:
        raise ValueError("academic_units_required")
    if hours <= 0 or hours % units:
        raise ValueError("indivisible_workload")
    return hours // units
