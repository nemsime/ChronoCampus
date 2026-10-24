import hashlib
import json

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import inspect, select, true
from sqlalchemy.orm import Session

from app.calendar.rules import required_pairs
from app.db import models as m


def record(row):
    return jsonable_encoder(
        {col.key: getattr(row, col.key) for col in inspect(type(row)).columns}
    )


def current_assignments(db: Session):
    return db.execute(
        select(m.Assignment, m.Workload)
        .join(m.Occurrence, m.Assignment.occurrence_id == m.Occurrence.id)
        .join(m.Workload, m.Occurrence.component_id == m.Workload.id)
        .join(
            m.PublishedGroup,
            (m.PublishedGroup.version_id == m.Assignment.version_id)
            & (m.PublishedGroup.course_group_id == m.Workload.course_group_id),
        )
    ).all()


def ensure_occurrences(db: Session, workloads, calendar):
    for component in workloads:
        try:
            count = required_pairs(
                component.semester_hours, calendar.academic_hours_per_lesson
            )
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        rows = list(
            db.scalars(
                select(m.Occurrence)
                .where(m.Occurrence.component_id == component.id)
                .order_by(m.Occurrence.ordinal)
            )
        )
        if rows and (
            len(rows) != count or [row.ordinal for row in rows] != list(range(count))
        ):
            raise HTTPException(409, "occurrence_count_changed")
        if not rows:
            db.add_all(
                m.Occurrence(component_id=component.id, ordinal=i) for i in range(count)
            )
    db.flush()


def build_snapshot(
    db: Session, version: m.ScheduleVersion, *, materialize=False
) -> dict:
    term = db.get(m.Term, version.term_id)
    calendar = db.get(m.CalendarConfig, term.calendar_id)
    workloads = list(
        db.scalars(
            select(m.Workload)
            .where(
                m.Workload.term_id == term.id,
                m.Workload.course_group_id.in_(version.cohort_ids),
            )
            .order_by(m.Workload.id)
        )
    )
    if not workloads:
        raise HTTPException(422, "no_workload")
    if set(version.cohort_ids) - {w.course_group_id for w in workloads}:
        raise HTTPException(422, "no_workload_for_cohort")
    if materialize:
        ensure_occurrences(db, workloads, calendar)
    snapshot = {
        "term": record(term),
        "calendar": record(calendar),
        "workloads": [record(w) for w in workloads],
    }
    for key, model in (
        ("groups", m.CourseGroup),
        ("subgroups", m.SmallGroup),
        ("lab_groups", m.LabGroup),
        ("rooms", m.Room),
        ("availability", m.Availability),
    ):
        snapshot[key] = [
            record(row) for row in db.scalars(select(model).order_by(model.id))
        ]
    equipment = list(db.scalars(select(m.RoomEquipment)))
    for room in snapshot["rooms"]:
        room["equipment_ids"] = [
            e.equipment_type_id for e in equipment if e.room_id == room["id"]
        ]
    snapshot["teachers"] = [
        {"id": a.id, "role": a.role, "is_active": a.is_active}
        for a in db.scalars(select(m.Account).where(m.Account.role == "lecturer"))
    ]
    for key, model in (
        ("holidays", m.Holiday),
        ("periods", m.TeachingPeriod),
        ("extra_permissions", m.ExtraPermission),
    ):
        snapshot[key] = [
            record(row)
            for row in db.scalars(
                select(model).where(model.term_id == term.id).order_by(model.id)
            )
        ]
    snapshot["occurrences"] = [
        record(row)
        for row in db.scalars(
            select(m.Occurrence)
            .where(m.Occurrence.component_id.in_([w.id for w in workloads]))
            .order_by(m.Occurrence.id)
        )
    ]
    snapshot["pins"] = [
        record(row)
        for row in db.scalars(
            select(m.Assignment).where(
                m.Assignment.version_id == version.id, m.Assignment.pinned == true()
            )
        )
    ]
    snapshot["disruptions"] = [
        record(row)
        for row in db.scalars(
            select(m.Disruption).where(m.Disruption.version_id == version.id)
        )
    ]
    snapshot["external"] = []
    for assignment, component in current_assignments(db):
        if (
            component.term_id == term.id
            and component.course_group_id in version.cohort_ids
        ):
            continue
        if (
            term.starts_on <= assignment.day <= term.ends_on
            and not assignment.cancelled
        ):
            snapshot["external"].append(
                {
                    **record(assignment),
                    **{
                        k: getattr(component, k)
                        for k in (
                            "teacher_id",
                            "course_group_id",
                            "small_group_id",
                            "lab_group_id",
                        )
                    },
                }
            )
    snapshot["data_revision"] = db.get(m.DataRevision, 1).revision
    snapshot["model_version"] = 1
    return snapshot


def snapshot_hash(snapshot: dict) -> str:
    return hashlib.sha256(
        json.dumps(
            snapshot, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode()
    ).hexdigest()


def comparison_hash(snapshot: dict) -> str:
    """Ignore bookkeeping revisions/placement row IDs, retain actual solver inputs."""
    comparable = {key: value for key, value in snapshot.items() if key != "data_revision"}
    for key in ("pins", "external", "disruptions"):
        comparable[key] = sorted([
            {field: value for field, value in row.items() if field not in {"id", "version_id"}}
            for row in snapshot.get(key, [])
        ], key=lambda row: json.dumps(row, sort_keys=True))
    return snapshot_hash(comparable)
