"""Explicit dated overrides. Original publications and account records are immutable."""

from fastapi import HTTPException
from sqlalchemy import inspect, select

from app.db import models as m
from app.scheduling.snapshot import record


def available(db):
    inspector = inspect(db.connection())
    return inspector.has_table("ScheduleChangeEvent") and inspector.has_table(
        "LessonOverride"
    )


def require_schema(db):
    if not available(db):
        raise HTTPException(503, "dated_changes_migration_required")


def metadata(db, version_id):
    if not available(db):
        return [], []
    events = list(
        db.scalars(
            select(m.ScheduleChangeEvent).where(
                m.ScheduleChangeEvent.version_id == version_id
            )
        )
    )
    by_id = {e.id: e for e in events}
    overrides = []
    for o in db.scalars(
        select(m.LessonOverride).where(m.LessonOverride.version_id == version_id)
    ):
        event = by_id[o.event_id]
        original = dict(o.original)
        room = db.get(m.Room, original["room_id"])
        original["room"] = room.room_number if room else str(original["room_id"])
        overrides.append(
            dict(
                occurrence_id=o.occurrence_id,
                original=original,
                reason=event.reason,
                event_kind=event.kind,
                event_id=event.id,
            )
        )
    return [record(e) for e in events], overrides


def remember(db, version, event, assignment):
    existing = db.scalar(
        select(m.LessonOverride).where(
            m.LessonOverride.version_id == version.id,
            m.LessonOverride.occurrence_id == assignment.occurrence_id,
        )
    )
    if existing is None:
        db.add(
            m.LessonOverride(
                version_id=version.id,
                event_id=event.id,
                occurrence_id=assignment.occurrence_id,
                original=record(assignment),
            )
        )
    else:
        # Preserve the earliest original placement even after subsequent edits.
        existing.event_id = event.id
    db.flush()


def copy_metadata(db, target, sources):
    if not available(db):
        return
    for source_id, occurrence_ids in sources.items():
        event_map = {}
        for event in db.scalars(
            select(m.ScheduleChangeEvent).where(
                m.ScheduleChangeEvent.version_id == source_id
            )
        ):
            groups = sorted(set(event.cohort_ids) & set(target.cohort_ids))
            if not groups:
                continue
            values = record(event)
            values.pop("id")
            values.update(
                version_id=target.id,
                cohort_ids=groups,
                starts_on=event.starts_on,
                ends_on=event.ends_on,
            )
            copied = m.ScheduleChangeEvent(**values)
            db.add(copied)
            db.flush()
            event_map[event.id] = copied.id
        for override in db.scalars(
            select(m.LessonOverride).where(m.LessonOverride.version_id == source_id)
        ):
            if (
                override.occurrence_id in occurrence_ids
                and override.event_id in event_map
            ):
                db.add(
                    m.LessonOverride(
                        version_id=target.id,
                        event_id=event_map[override.event_id],
                        occurrence_id=override.occurrence_id,
                        original=override.original,
                    )
                )
    db.flush()


def missing_template_rows(db, scope, values, version_id):
    """Authorize unresolved originals using workloads/groups, not student state."""
    from app.scheduling import queries as q

    if not available(db):
        return []
    o = m.LessonOverride.__table__
    joined = (
        o.join(q.Occurrences, q.Occurrences.c.id == o.c.occurrence_id)
        .join(q.W, q.W.c.id == q.Occurrences.c.component_id)
        .join(q.V, q.V.c.id == o.c.version_id)
        .join(q.T, q.T.c.id == q.W.c.term_id)
        .join(q.S, q.S.c.id == q.W.c.subject_id)
        .join(q.U, q.U.c.id == q.W.c.teacher_id)
        .join(q.G, q.G.c.id == q.W.c.course_group_id)
        .outerjoin(q.SG, q.SG.c.id == q.W.c.small_group_id)
        .outerjoin(q.LG, q.LG.c.id == q.W.c.lab_group_id)
    )
    if version_id is None:
        joined = joined.join(
            q.P,
            (q.P.c.version_id == o.c.version_id)
            & (q.P.c.term_id == q.W.c.term_id)
            & (q.P.c.course_group_id == q.W.c.course_group_id),
        )
    statement = (
        select(
            o.c.original,
            o.c.version_id,
            o.c.occurrence_id,
            q.W.c.id.label("component_id"),
            q.W.c.term_id,
            q.T.c.name.label("term"),
            q.W.c.subject_id,
            q.S.c.name.label("subject"),
            q.W.c.teacher_id,
            q.U.c.display_name.label("teacher"),
            q.W.c.course_group_id,
            q.G.c.group_code.label("group"),
            q.W.c.small_group_id,
            q.W.c.lab_group_id,
            q.SG.c.label.label("small_group"),
            q.LG.c.label.label("lab_group"),
            q.W.c.lesson_type,
            q.V.c.configuration,
        )
        .select_from(joined)
        .where(q.authorized(scope))
    )
    if version_id is not None:
        statement = statement.where(o.c.version_id == version_id)
    for key in ("term_id", "course_group_id", "teacher_id"):
        if values.get(key) is not None:
            statement = statement.where(q.W.c[key] == values[key])
    statement = statement.where(
        ~select(q.A.c.id)
        .where(
            q.A.c.version_id == o.c.version_id, q.A.c.occurrence_id == o.c.occurrence_id
        )
        .exists()
    )
    results = []
    for item in db.execute(statement.limit(20001)).mappings():
        row = dict(item)
        original = row.pop("original")
        row.update({k: v for k, v in original.items() if k not in {"version_id"}})
        row["_unresolved"] = True
        room = db.get(m.Room, original["room_id"])
        row["room"] = room.room_number if room else str(original["room_id"])
        results.append(row)
    return results
