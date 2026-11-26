"""Install the fixture's dated timetable through normal publication validation."""

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time

from sqlalchemy import select

from app.db import models as m
from app.observability.audit import record_audit
from app.scheduling.router import assignment_model
from app.scheduling.snapshot import build_snapshot
from app.scheduling.validation import validate


def publish_demo_reference(db, fixture, *, terms, groups, workloads, rooms, actor_id):
    """Publish the same placements on each demo database in the caller's transaction."""
    series = {row["id"]: row for row in fixture["series"]}
    pairs = {row["slot"]: row for row in fixture["pairs"]}
    lessons = defaultdict(list)
    for row in sorted(fixture["lessons"], key=lambda row: (row["series_id"], row["day"])):
        lessons[workloads[row["series_id"]]].append(row)

    term = fixture["term"]
    timestamp = datetime.combine(date.fromisoformat(term["starts_on"]), time.min, tzinfo=UTC)
    reference_ids = {}
    for form in ("present", "remote"):
        if form not in terms:
            continue
        term_id = terms[form]
        cohort_ids = [
            groups[row["id"]]
            for row in sorted(fixture["groups"], key=lambda row: row["id"])
            if row["study_form"] == form
        ]
        name = f"Synthetic autumn {term['academic_year_start']} reference · {form}"
        references = list(db.scalars(select(m.ScheduleVersion).where(
            m.ScheduleVersion.term_id == term_id, m.ScheduleVersion.name == name,
        )))
        pointers = list(db.scalars(select(m.PublishedGroup).where(
            m.PublishedGroup.term_id == term_id, m.PublishedGroup.course_group_id.in_(cohort_ids),
        )))
        if references:
            if (len(references) != 1 or references[0].status != "published"
                    or set(references[0].cohort_ids) != set(cohort_ids)
                    or len(pointers) != len(cohort_ids)
                    or any(pointer.version_id != references[0].id for pointer in pointers)):
                raise RuntimeError(f"Cannot reuse the {form} demo reference because its publication differs")
            reference_ids[form] = references[0].id
            continue
        if pointers:
            raise RuntimeError(f"Cannot publish the {form} demo reference because a cohort already has a published timetable")

        version = m.ScheduleVersion(
            term_id=term_id, name=name, cohort_ids=cohort_ids, created_at=timestamp,
        )
        db.add(version)
        db.flush()
        snapshot = build_snapshot(db, version, materialize=True)
        occurrences = defaultdict(list)
        for row in sorted(snapshot["occurrences"], key=lambda row: row["ordinal"]):
            occurrences[row["component_id"]].append(row["id"])
        assignments = []
        for component_id, identifiers in occurrences.items():
            references_for_component = lessons[component_id]
            if len(identifiers) != len(references_for_component):
                raise RuntimeError(f"The {form} demo reference does not match the coursework for component {component_id}")
            for occurrence_id, placement in zip(identifiers, references_for_component, strict=True):
                pattern = series[placement["series_id"]]
                slot = pattern["slot"]
                room_id = pattern["room_id"]
                assignments.append({
                    "occurrence_id": occurrence_id,
                    "day": placement["day"],
                    "slot": slot,
                    "room_id": rooms[room_id] if room_id is not None else None,
                    "starts_at": pairs[slot]["starts_at"],
                    "ends_at": pairs[slot]["ends_at"],
                    "cancelled": placement["cancelled"],
                })
        report = validate(snapshot, assignments)
        if not report["complete"]:
            issues = dict(Counter(issue["code"] for issue in report["issues"]))
            raise RuntimeError(f"The {form} demo reference failed schedule validation: {issues}")

        db.add_all(assignment_model(version.id, item) for item in assignments)
        db.add_all(m.PublishedGroup(
            term_id=term_id, course_group_id=identifier, version_id=version.id,
        ) for identifier in cohort_ids)
        version.status = "published"
        version.published_at = timestamp
        version.revision += 1
        version.report = report
        version.configuration = {"term": snapshot["term"], "calendar": snapshot["calendar"]}
        record_audit(db, actor_id, "schedule.published", "schedule", version.id,
                     before={"status": "draft"}, after={"status": "published", "cohort_ids": cohort_ids})
        db.flush()
        reference_ids[form] = version.id
    return reference_ids
