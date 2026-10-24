from datetime import date, datetime, time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, defer

from app.accounts.dependencies import administrator
from app.calendar.rules import audiences_overlap, lesson_slot, parity
from app.db import models as m
from app.db.session import get_db, lock_revision
from app.jobs.generation import cancel_run, enqueue_generation, execute_run  # noqa: F401
from app.jobs.models import JobAttempt
from app.observability.audit import record_audit
from app.observability.runs import run_view
from app.scheduling.snapshot import (
    build_snapshot,
    current_assignments,
    record,
)
from app.scheduling.validation import validate

router = APIRouter(tags=["scheduling"])


class DraftInput(BaseModel):
    term_id: int
    cohort_ids: list[int] = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)


class GenerateInput(BaseModel):
    revision: int
    idempotency_key: str | None = Field(default=None, min_length=16, max_length=80)
    seed: int = Field(default=1, ge=0, le=2**31 - 1)
    algorithm: Literal["cp_sat", "greedy_local"] = "cp_sat"


class MoveInput(BaseModel):
    revision: int
    day: date
    slot: int = Field(ge=1)
    room_id: int
    pinned: bool = False


class RevisionInput(BaseModel):
    revision: int


class DisruptionInput(RevisionInput):
    reason: str = Field(min_length=1, max_length=500)


def require_draft(db, identifier, revision=None):
    version = db.get(m.ScheduleVersion, identifier, populate_existing=True)
    if not version:
        raise HTTPException(404, "version_not_found")
    if version.status != "draft":
        raise HTTPException(409, "published_version_immutable")
    if revision is not None and version.revision != revision:
        raise HTTPException(409, "stale_revision")
    return version


def assignment_model(version_id, item):
    return m.Assignment(
        version_id=version_id,
        occurrence_id=item["occurrence_id"],
        day=date.fromisoformat(item["day"]),
        slot=item["slot"],
        room_id=item["room_id"],
        starts_at=time.fromisoformat(item["starts_at"]),
        ends_at=time.fromisoformat(item["ends_at"]),
        pinned=item.get("pinned", False),
        cancelled=item.get("cancelled", False),
    )


def assignment_view(db, assignment, component):
    subject, teacher, group, room = (
        db.get(model, identifier)
        for model, identifier in (
            (m.Subject, component.subject_id),
            (m.Account, component.teacher_id),
            (m.CourseGroup, component.course_group_id),
            (m.Room, assignment.room_id),
        )
    )
    version = db.get(m.ScheduleVersion, assignment.version_id)
    term = db.get(m.Term, version.term_id)
    small = (
        db.get(m.SmallGroup, component.small_group_id)
        if component.small_group_id
        else None
    )
    lab = db.get(m.LabGroup, component.lab_group_id) if component.lab_group_id else None
    start = (
        version.configuration.get("term", {}).get("starts_on")
        or db.get(m.Term, version.term_id).starts_on
    )
    return {
        **record(assignment),
        "component_id": component.id,
        "term_id": component.term_id,
        "term": term.name,
        "subject_id": subject.id,
        "subject": subject.name,
        "teacher_id": teacher.id,
        "teacher": teacher.display_name,
        "course_group_id": group.id,
        "group": group.group_code,
        "small_group_id": component.small_group_id,
        "lab_group_id": component.lab_group_id,
        "small_group": small.label if small else None,
        "lab_group": lab.label if lab else None,
        "room": room.room_number,
        "lesson_type": component.lesson_type,
        "parity": parity(start, assignment.day),
    }


def readable(account, component):
    if account.role == "admin":
        return True
    if account.role == "lecturer":
        return component.teacher_id == account.id
    membership = {
        key: getattr(account, key)
        for key in ("course_group_id", "small_group_id", "lab_group_id")
    }
    audience = {key: getattr(component, key) for key in membership}
    return audiences_overlap(membership, audience)


@router.get("/admin/schedule/versions", dependencies=[Depends(administrator)])
def versions(db: Session = Depends(get_db)):
    return [
        record(v)
        for v in db.scalars(
            select(m.ScheduleVersion).order_by(m.ScheduleVersion.id.desc())
        )
    ]


@router.post(
    "/admin/schedule/versions", status_code=201, dependencies=[Depends(administrator)]
)
def create_draft(body: DraftInput, db: Session = Depends(get_db), actor: m.Account = Depends(administrator)):
    lock_revision(db, changed=False)
    if not db.get(m.Term, body.term_id):
        raise HTTPException(422, "invalid_reference")
    groups = sorted(set(body.cohort_ids))
    if any(not db.get(m.CourseGroup, identifier) for identifier in groups):
        raise HTTPException(422, "invalid_reference")
    version = m.ScheduleVersion(term_id=body.term_id, name=body.name, cohort_ids=groups)
    db.add(version)
    db.flush()
    snapshot = build_snapshot(db, version, materialize=True)
    for assignment, component in current_assignments(db):
        if component.term_id == body.term_id and component.course_group_id in groups:
            db.add(assignment_model(version.id, record(assignment)))
            disruption = db.scalar(
                select(m.Disruption).where(
                    m.Disruption.version_id == assignment.version_id,
                    m.Disruption.occurrence_id == assignment.occurrence_id,
                )
            )
            if disruption:
                db.add(
                    m.Disruption(
                        version_id=version.id,
                        occurrence_id=disruption.occurrence_id,
                        original_day=disruption.original_day,
                        original_slot=disruption.original_slot,
                        reason=disruption.reason,
                    )
                )
    version.configuration = {"term": snapshot["term"], "calendar": snapshot["calendar"]}
    record_audit(db, actor, "draft.created", "schedule", version.id,
                 after={"term_id": body.term_id, "cohort_ids": groups})
    db.commit()
    return record(version)


@router.get(
    "/admin/schedule/versions/{identifier}", dependencies=[Depends(administrator)]
)
def version_detail(identifier: int, db: Session = Depends(get_db)):
    version = db.get(m.ScheduleVersion, identifier)
    if not version:
        raise HTTPException(404, "version_not_found")
    rows = db.execute(
        select(m.Assignment, m.Workload)
        .join(m.Occurrence, m.Assignment.occurrence_id == m.Occurrence.id)
        .join(m.Workload, m.Occurrence.component_id == m.Workload.id)
        .where(m.Assignment.version_id == identifier)
    ).all()
    snapshot = build_snapshot(db, version)
    last_run = db.scalar(
        select(m.GenerationRun)
        .where(m.GenerationRun.version_id == identifier)
        .order_by(m.GenerationRun.id.desc())
        .limit(1)
    )
    return {
        "version": record(version),
        "assignments": [assignment_view(db, a, c) for a, c in rows],
        "report": validate(snapshot, [record(a) for a, c in rows]),
        "disruptions": snapshot["disruptions"],
        "occurrences": snapshot["occurrences"],
        "workloads": snapshot["workloads"],
        "last_run": run_view(last_run) if last_run else None,
    }


@router.post(
    "/admin/schedule/versions/{identifier}/generate",
    status_code=202,
    dependencies=[Depends(administrator)],
)
def start_generation(
    identifier: int, body: GenerateInput, db: Session = Depends(get_db),
    actor: m.Account = Depends(administrator),
):
    run = enqueue_generation(db, identifier, body, actor)
    db.commit()
    return run_view(run)


@router.get(
    "/admin/calendar/{calendar_id}/slots", dependencies=[Depends(administrator)]
)
def calendar_slots(calendar_id: int, count: int = 6, db: Session = Depends(get_db)):
    calendar = db.get(m.CalendarConfig, calendar_id)
    if not calendar or not 1 <= count <= 144:
        raise HTTPException(422, "invalid_reference")
    result = []
    for number in range(1, count + 1):
        try:
            start, end = lesson_slot(record(calendar), number)
            result.append({"slot": number, "starts_at": start, "ends_at": end})
        except ValueError:
            break
    return result


@router.get("/admin/schedule/runs/{identifier}", dependencies=[Depends(administrator)])
def run_status(identifier: int, db: Session = Depends(get_db)):
    run = db.get(m.GenerationRun, identifier)
    if not run:
        raise HTTPException(404, "run_not_found")
    return run_view(run)


@router.get("/admin/schedule/runs/{identifier}/attempts", dependencies=[Depends(administrator)])
def run_attempts(identifier: int, db: Session = Depends(get_db)):
    run = db.get(m.GenerationRun, identifier)
    if not run:
        raise HTTPException(404, "run_not_found")
    rows = db.scalars(select(JobAttempt).where(JobAttempt.job_id == run.job_id)
                      .order_by(JobAttempt.attempt_number)) if run.job_id else []
    return {"items": [{key: getattr(row, key) for key in (
        "id", "attempt_number", "lease_generation", "worker_instance", "started_at",
        "deadline_at", "finished_at", "outcome", "error_code", "input_hash")} for row in rows]}


@router.post("/admin/schedule/runs/{identifier}/cancel", dependencies=[Depends(administrator)])
def cancel_generation(identifier: int, db: Session = Depends(get_db)):
    run = cancel_run(db, identifier)
    db.commit()
    return run_view(run)


@router.get("/admin/schedule/runs", dependencies=[Depends(administrator)])
def run_history(db: Session = Depends(get_db), version_id: int | None = Query(None, ge=1),
                status: Literal["queued", "running", "complete", "partial", "failed", "rejected", "stale", "interrupted", "retry_wait", "cancelled"] | None = None,
                limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0, le=100000)):
    statement = select(m.GenerationRun).options(defer(m.GenerationRun.snapshot))
    if version_id is not None:
        statement = statement.where(m.GenerationRun.version_id == version_id)
    if status is not None:
        statement = statement.where(m.GenerationRun.status == status)
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    runs = db.scalars(statement.order_by(m.GenerationRun.id.desc()).offset(offset).limit(limit))
    return {"items": [run_view(row, detailed=False) for row in runs], "total": total, "limit": limit, "offset": offset}


@router.put(
    "/admin/schedule/versions/{identifier}/assignments/{occurrence_id}",
    dependencies=[Depends(administrator)],
)
def move_assignment(
    identifier: int, occurrence_id: int, body: MoveInput, db: Session = Depends(get_db),
    actor: m.Account = Depends(administrator),
):
    lock_revision(db, changed=False)
    version = require_draft(db, identifier, body.revision)
    snapshot = build_snapshot(db, version)
    if occurrence_id not in {o["id"] for o in snapshot["occurrences"]}:
        raise HTTPException(422, "invalid_occurrence")
    try:
        start, end = lesson_slot(snapshot["calendar"], body.slot)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    moved = {
        "occurrence_id": occurrence_id,
        "day": body.day.isoformat(),
        "slot": body.slot,
        "room_id": body.room_id,
        "starts_at": start,
        "ends_at": end,
        "pinned": body.pinned,
        "cancelled": snapshot["term"]["holiday_policy"] == "exempt"
        and any(h["day"] == body.day.isoformat() for h in snapshot["holidays"]),
    }
    # An explicit manual edit can move/unpin this lesson; all other pins still apply.
    snapshot["pins"] = [
        p for p in snapshot["pins"] if p["occurrence_id"] != occurrence_id
    ]
    rows = list(
        db.scalars(select(m.Assignment).where(m.Assignment.version_id == identifier))
    )
    existing = next((a for a in rows if a.occurrence_id == occurrence_id), None)
    if moved["cancelled"] and not (
        existing and existing.cancelled and existing.day == body.day
    ):
        raise HTTPException(409, "manual_holiday_move")
    candidates = [record(a) for a in rows if a.occurrence_id != occurrence_id] + [moved]
    report = validate(snapshot, candidates)
    # Catalog changes may invalidate several existing lessons. Allow repairs one
    # lesson at a time, but never accept a conflict involving the edited lesson.
    blocking = [
        issue
        for issue in report["issues"]
        if issue["code"] != "configuration_unconfirmed"
        and (
            "occurrence_id" not in issue
            or occurrence_id in (issue["occurrence_id"], issue.get("other_occurrence_id"))
        )
    ]
    if blocking:
        raise HTTPException(
            409, {"code": "schedule_conflict", "issues": blocking}
        )
    if existing:
        before = record(existing)
        db.delete(existing)
        db.flush()
    else:
        before = {}
    db.add(assignment_model(identifier, moved))
    version.revision += 1
    version.report = report
    record_audit(db, actor, "lesson.changed", "schedule", identifier, before=before, after=moved)
    db.commit()
    return {"revision": version.revision, "report": report}


@router.post(
    "/admin/schedule/versions/{identifier}/publish",
    dependencies=[Depends(administrator)],
)
def publish(identifier: int, body: RevisionInput, db: Session = Depends(get_db),
            actor: m.Account = Depends(administrator)):
    lock_revision(db)
    version = require_draft(db, identifier, body.revision)
    snapshot = build_snapshot(db, version)
    assignments = [
        record(a)
        for a in db.scalars(
            select(m.Assignment).where(m.Assignment.version_id == identifier)
        )
    ]
    report = validate(snapshot, assignments)
    if not report["complete"]:
        raise HTTPException(409, {"code": "publication_blocked", "report": report})
    for group_id in version.cohort_ids:
        pointer = db.get(m.PublishedGroup, (version.term_id, group_id))
        if not pointer:
            pointer = m.PublishedGroup(
                term_id=version.term_id, course_group_id=group_id, version_id=version.id
            )
            db.add(pointer)
        pointer.version_id = version.id
    version.status = "published"
    version.published_at = datetime.utcnow()
    version.revision += 1
    version.report = report
    version.configuration = {"term": snapshot["term"], "calendar": snapshot["calendar"]}
    record_audit(db, actor, "schedule.published", "schedule", identifier,
                 before={"status": "draft"}, after={"status": "published", "cohort_ids": version.cohort_ids})
    db.commit()
    return record(version)


@router.post(
    "/admin/schedule/versions/{identifier}/assignments/{occurrence_id}/emergency",
    dependencies=[Depends(administrator)],
)
def emergency_cancellation(
    identifier: int,
    occurrence_id: int,
    body: DisruptionInput,
    db: Session = Depends(get_db),
    actor: m.Account = Depends(administrator),
):
    lock_revision(db, changed=False)
    version = require_draft(db, identifier, body.revision)
    assignment = db.scalar(
        select(m.Assignment).where(
            m.Assignment.version_id == identifier,
            m.Assignment.occurrence_id == occurrence_id,
        )
    )
    if not assignment:
        raise HTTPException(404, "lesson_not_found")
    if assignment.pinned:
        raise HTTPException(409, "unpin_before_cancellation")
    if assignment.cancelled:
        raise HTTPException(409, "holiday_not_emergency")
    if db.scalar(
        select(m.Disruption.id).where(
            m.Disruption.version_id == identifier,
            m.Disruption.occurrence_id == occurrence_id,
        )
    ):
        raise HTTPException(409, "emergency_already_recorded")
    db.add(
        m.Disruption(
            version_id=identifier,
            occurrence_id=occurrence_id,
            original_day=assignment.day,
            original_slot=assignment.slot,
            reason=body.reason,
        )
    )
    db.delete(assignment)
    version.revision += 1
    record_audit(db, actor, "lesson.emergency", "schedule", identifier,
                 before={"occurrence_id": occurrence_id, "day": assignment.day, "slot": assignment.slot})
    db.commit()
    return {"revision": version.revision, "message": "replacement_required"}
