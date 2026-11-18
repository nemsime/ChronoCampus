"""Measure saved timetable versions. Run from backend: python -m scripts.timetable_metrics [version_id]."""

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from sqlalchemy import false, select
from sqlalchemy.orm import Session

from app.calendar.rules import as_date, week_index
from app.db import models as m
from app.db.session import get_engine


def cohort_metrics(rows, starts_on, teaching_weeks, weekdays):
    """Measure occupied cohort-days. Parallel subgroup lessons occupy one pair."""
    occupied = defaultdict(set)
    rooms = defaultdict(set)
    positions = defaultdict(set)
    weeks = defaultdict(set)
    for day, slot, room, component, ordinal in rows:
        occupied[day].add(slot)
        # Generation divides each workload into weekly series and a final remainder.
        key = (component, ordinal // teaching_weeks)
        weeks[key].add(week_index(starts_on, day))
        rooms[key].add(room)
        positions[key].add((day.weekday(), slot))

    gaps = []
    first = Counter()
    pairs = Counter()
    load = Counter(dict.fromkeys(weekdays, 0))
    for day, slots in occupied.items():
        pairs[len(slots)] += 1
        first[min(slots)] += 1
        load[day.weekday()] += len(slots)
        gaps.append(max(slots) - min(slots) + 1 - len(slots))
    window_days = sum(gap > 0 for gap in gaps)
    recurring = [key for key, observed in weeks.items() if len(observed) > 1]
    return {
        "occupied_days": len(gaps),
        "pairs_per_day": dict(sorted(pairs.items())),
        "first_pair_of_day": dict(sorted(first.items())),
        "window_slots": sum(gaps),
        "days_with_windows": window_days,
        "percent_days_with_windows": round(100 * window_days / len(gaps), 2)
        if gaps
        else 0,
        "weekday_load": dict(sorted(load.items())),
        "series_with_room_changes": sum(len(rooms[k]) > 1 for k in recurring),
        "series_with_weekday_or_slot_changes": sum(
            len(positions[k]) > 1 for k in recurring
        ),
        "series_with_any_changes": sum(
            len(rooms[k]) > 1 or len(positions[k]) > 1 for k in recurring
        ),
    }


def measure_draft(snapshot, assignments):
    """Use the same metrics for an archived, unpublished generation result."""
    occurrences = {o["id"]: o for o in snapshot["occurrences"]}
    workloads = {w["id"]: w for w in snapshot["workloads"]}
    cohorts = {w["course_group_id"] for w in workloads.values()}
    rows = defaultdict(list)
    for item in assignments:
        if item["cancelled"]:
            continue
        occurrence = occurrences[item["occurrence_id"]]
        component = occurrence["component_id"]
        rows[workloads[component]["course_group_id"]].append(
            (
                as_date(item["day"]),
                item["slot"],
                item["room_id"],
                component,
                occurrence["ordinal"],
            )
        )
    calendar = snapshot["calendar"]
    return [
        {
            "group": group["group_code"],
            **cohort_metrics(
                rows[group["id"]],
                snapshot["term"]["starts_on"],
                calendar["teaching_weeks"],
                calendar["weekdays"],
            ),
        }
        for group in snapshot["groups"]
        if group["id"] in cohorts
    ]


def measure_version(db, version):
    config = version.configuration or {}
    term = db.get(m.Term, version.term_id)
    calendar = db.get(m.CalendarConfig, term.calendar_id)
    starts_on = config.get("term", {}).get("starts_on", term.starts_on)
    saved = config.get("calendar", {})
    groups = dict(
        db.execute(
            select(m.CourseGroup.id, m.CourseGroup.group_code).where(
                m.CourseGroup.id.in_(version.cohort_ids)
            )
        ).all()
    )
    rows = defaultdict(list)
    for group_id, *values in db.execute(
        select(
            m.Workload.course_group_id,
            m.Assignment.day,
            m.Assignment.slot,
            m.Assignment.room_id,
            m.Workload.id,
            m.Occurrence.ordinal,
        )
        .join_from(
            m.Assignment, m.Occurrence, m.Assignment.occurrence_id == m.Occurrence.id
        )
        .join(m.Workload, m.Occurrence.component_id == m.Workload.id)
        .where(m.Assignment.version_id == version.id, m.Assignment.cancelled == false())
    ):
        rows[group_id].append(values)
    return [
        {
            "version": version.id,
            "group": groups[gid],
            **cohort_metrics(
                rows[gid],
                starts_on,
                saved.get("teaching_weeks", calendar.teaching_weeks),
                saved.get("weekdays", calendar.weekdays),
            ),
        }
        for gid in version.cohort_ids
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("version_id", type=int, nargs="?")
    source.add_argument("--draft", type=Path, help="Read an archived benchmark draft")
    args = parser.parse_args()
    if args.draft:
        draft = json.loads(args.draft.read_text(encoding="utf-8"))
        print(
            json.dumps(measure_draft(draft["snapshot"], draft["assignments"]), indent=2)
        )
        return
    with Session(get_engine()) as db:
        query = select(m.ScheduleVersion).order_by(m.ScheduleVersion.id)
        if args.version_id is not None:
            query = query.where(m.ScheduleVersion.id == args.version_id)
        versions = db.scalars(query).all()
        if args.version_id is not None and not versions:
            parser.error("Unknown schedule version")
        print(
            json.dumps(
                [row for version in versions for row in measure_version(db, version)],
                ensure_ascii=False,
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
