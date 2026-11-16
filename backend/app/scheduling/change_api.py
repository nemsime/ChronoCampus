"""Draft-only dated changes and lecturer requests; no mutation of publications."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.accounts.dependencies import administrator, current_user
from app.db import models as m
from app.db.session import get_db, lock_revision
from app.observability.audit import record_audit
from app.review import service as review
from app.scheduling import queries as q
from app.scheduling.changes import available, metadata, remember, require_schema
from app.scheduling.moves import move_candidate
from app.scheduling.router import (
    MoveInput,
    RevisionInput,
    assignment_model,
    require_draft,
)
from app.scheduling.snapshot import build_snapshot, record
from app.scheduling.validation import validate

router = APIRouter(tags=["dated changes"])


class ClosureInput(RevisionInput):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    starts_on: date
    ends_on: date
    cohort_ids: list[int] = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=500)


class OnceInput(MoveInput):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: str = Field(min_length=1, max_length=500)


class LecturerInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version_id: int = Field(gt=0)
    occurrence_id: int = Field(gt=0)
    proposed_day: date
    proposed_slot: int = Field(ge=1, le=144)
    proposed_room_id: int | None = Field(default=None, gt=0)
    reason: str = Field(min_length=1, max_length=500)


def lecturer(actor=Depends(current_user)):
    if actor.role != "lecturer":
        raise HTTPException(403, "lecturer_required")
    return actor


def lock_actor(db, actor, role):
    lock_revision(db, changed=False)
    db.refresh(actor)
    if not actor.is_active or not actor.email_verified:
        raise HTTPException(401, "authentication_required")
    if actor.must_change_password:
        raise HTTPException(403, "password_change_required")
    if actor.role != role:
        raise HTTPException(403, "forbidden")


def owned_published(db, version_id, occurrence_id, actor):
    row = db.execute(
        select(m.Assignment, m.Workload)
        .join(m.Occurrence, m.Occurrence.id == m.Assignment.occurrence_id)
        .join(m.Workload, m.Workload.id == m.Occurrence.component_id)
        .join(
            m.PublishedGroup,
            (m.PublishedGroup.version_id == m.Assignment.version_id)
            & (m.PublishedGroup.course_group_id == m.Workload.course_group_id)
            & (m.PublishedGroup.term_id == m.Workload.term_id),
        )
        .where(
            m.Assignment.version_id == version_id,
            m.Assignment.occurrence_id == occurrence_id,
            m.Workload.teacher_id == actor.id,
        )
    ).first()
    if not row:
        raise HTTPException(404, "lesson_not_found")
    return row


def check_request_current(db, suggestion):
    actor = db.get(m.Account, suggestion.author_id)
    try:
        assignment, _ = owned_published(
            db, suggestion.version_id, suggestion.occurrence_id, actor
        )
    except HTTPException:
        raise HTTPException(409, "request_outdated") from None
    if suggestion.anchor != dict(
        day=str(assignment.day), slot=assignment.slot, room_id=assignment.room_id
    ):
        raise HTTPException(409, "request_outdated")


@router.get("/schedule/change-features")
def capabilities(request: Request, response: Response, db: Session = Depends(get_db)):
    return q.consistent(
        db, request, response, lambda scope: dict(enabled=available(db))
    )


@router.post("/lecturer/change-requests", status_code=201)
def request_change(
    body: LecturerInput, actor=Depends(lecturer), db: Session = Depends(get_db)
):
    require_schema(db)
    lock_actor(db, actor, "lecturer")
    assignment, workload = owned_published(
        db, body.version_id, body.occurrence_id, actor
    )
    if assignment.cancelled:
        raise HTTPException(409, "holiday_not_emergency")
    if (body.proposed_day == assignment.day and body.proposed_slot == assignment.slot
            and body.proposed_room_id in {None, assignment.room_id}):
        raise HTTPException(422, "request_no_change")
    term = db.get(m.Term, workload.term_id)
    if not term.starts_on <= body.proposed_day <= term.ends_on:
        raise HTTPException(422, "outside_teaching_period")
    if body.proposed_room_id is not None and not db.get(m.Room, body.proposed_room_id):
        raise HTTPException(422, "invalid_reference")
    if (
        db.scalar(
            select(func.count())
            .select_from(m.ScheduleSuggestion)
            .where(
                m.ScheduleSuggestion.author_id == actor.id,
                m.ScheduleSuggestion.status.in_(["open", "accepted"]),
            )
        )
        >= 50
    ):
        raise HTTPException(409, "suggestion_limit")
    if db.scalar(
        select(m.ScheduleSuggestion.id).where(
            m.ScheduleSuggestion.author_id == actor.id,
            m.ScheduleSuggestion.version_id == body.version_id,
            m.ScheduleSuggestion.occurrence_id == body.occurrence_id,
            m.ScheduleSuggestion.status.in_(["open", "accepted"]),
        )
    ):
        raise HTTPException(409, "request_already_open")
    suggestion = m.ScheduleSuggestion(
        author_id=actor.id,
        version_id=body.version_id,
        occurrence_id=body.occurrence_id,
        course_group_id=workload.course_group_id,
        base_revision=db.get(m.ScheduleVersion, body.version_id).revision,
        kind="move",
        title=body.reason[:150],
        body=body.reason,
        proposed_day=body.proposed_day,
        proposed_slot=body.proposed_slot,
        proposed_room_id=body.proposed_room_id,
        anchor=dict(
            day=str(assignment.day), slot=assignment.slot, room_id=assignment.room_id
        ),
        status="open",
    )
    db.add(suggestion)
    db.flush()
    record_audit(
        db,
        actor,
        "suggestion.created",
        "suggestions",
        suggestion.id,
        after=record(suggestion),
    )
    db.commit()
    return review.suggestion_view(db, suggestion, comments=True)


@router.get("/lecturer/change-requests")
def requests(
    response: Response,
    offset: int = Query(0, ge=0),
    actor=Depends(lecturer),
    db: Session = Depends(get_db),
):
    response.headers.update(q.PRIVATE)
    rows = db.scalars(
        select(m.ScheduleSuggestion)
        .where(m.ScheduleSuggestion.author_id == actor.id)
        .order_by(m.ScheduleSuggestion.id.desc())
        .offset(offset)
        .limit(50)
    )
    return [review.suggestion_view(db, row, comments=True) for row in rows]


@router.get("/admin/schedule/versions/{identifier}/changes")
def changes(
    identifier: int,
    response: Response,
    actor=Depends(administrator),
    db: Session = Depends(get_db),
):
    response.headers.update(q.PRIVATE)
    require_schema(db)
    if not db.get(m.ScheduleVersion, identifier):
        raise HTTPException(404, "version_not_found")
    events, overrides = metadata(db, identifier)
    assigned = set(
        db.scalars(
            select(m.Assignment.occurrence_id).where(
                m.Assignment.version_id == identifier
            )
        )
    )
    return dict(
        events=events,
        overrides=[
            dict(o, unresolved=o["occurrence_id"] not in assigned) for o in overrides
        ],
    )


def update_report(db, version):
    db.flush()
    version.revision += 1
    version.report = validate(
        build_snapshot(db, version),
        [
            record(a)
            for a in db.scalars(
                select(m.Assignment).where(m.Assignment.version_id == version.id)
            )
        ],
    )


@router.post("/admin/schedule/versions/{identifier}/closures", status_code=201)
def close_teaching(
    identifier: int,
    body: ClosureInput,
    actor=Depends(administrator),
    db: Session = Depends(get_db),
):
    require_schema(db)
    lock_actor(db, actor, "admin")
    version = require_draft(db, identifier, body.revision)
    term = db.get(m.Term, version.term_id)
    groups = sorted(set(body.cohort_ids))
    if not term.starts_on <= body.starts_on <= body.ends_on <= term.ends_on:
        raise HTTPException(422, "outside_teaching_period")
    if set(groups) - set(version.cohort_ids):
        raise HTTPException(422, "invalid_reference")
    for previous in db.scalars(
        select(m.ScheduleChangeEvent).where(
            m.ScheduleChangeEvent.version_id == identifier,
            m.ScheduleChangeEvent.kind == "closure",
        )
    ):
        if (
            set(previous.cohort_ids) & set(groups)
            and previous.starts_on <= body.ends_on
            and body.starts_on <= previous.ends_on
        ):
            raise HTTPException(409, "closure_overlaps")
    assignments = list(
        db.scalars(
            select(m.Assignment)
            .join(m.Occurrence, m.Occurrence.id == m.Assignment.occurrence_id)
            .join(m.Workload, m.Workload.id == m.Occurrence.component_id)
            .where(
                m.Assignment.version_id == identifier,
                m.Workload.course_group_id.in_(groups),
                m.Assignment.day >= body.starts_on,
                m.Assignment.day <= body.ends_on,
                m.Assignment.cancelled.is_(False),
            )
        )
    )
    ids = [a.occurrence_id for a in assignments]
    if any(a.pinned for a in assignments):
        raise HTTPException(409, "unpin_before_cancellation")
    if ids and db.scalar(
        select(m.Disruption.id)
        .where(
            m.Disruption.version_id == identifier, m.Disruption.occurrence_id.in_(ids)
        )
        .limit(1)
    ):
        raise HTTPException(409, "legacy_emergency_conflict")
    event = m.ScheduleChangeEvent(
        version_id=identifier,
        kind="closure",
        starts_on=body.starts_on,
        ends_on=body.ends_on,
        cohort_ids=groups,
        reason=body.reason,
        created_by=actor.id,
    )
    db.add(event)
    db.flush()
    for assignment in assignments:
        remember(db, version, event, assignment)
        db.delete(assignment)
    update_report(db, version)
    record_audit(
        db,
        actor,
        "closure.created",
        "schedule",
        identifier,
        after=dict(cohort_ids=groups, starts_on=body.starts_on, ends_on=body.ends_on),
    )
    db.commit()
    return dict(
        revision=version.revision,
        affected=len(assignments),
        event_id=event.id,
        report=version.report,
    )


@router.post("/admin/schedule/versions/{identifier}/assignments/{occurrence_id}/once")
def move_once(
    identifier: int,
    occurrence_id: int,
    body: OnceInput,
    actor=Depends(administrator),
    db: Session = Depends(get_db),
):
    require_schema(db)
    lock_actor(db, actor, "admin")
    version = require_draft(db, identifier, body.revision)
    result = save_once(db, version, occurrence_id, body, actor)
    db.commit()
    return result


def save_once(db, version, occurrence_id, body, actor, request_id=None):
    identifier = version.id
    existing, moved, report, blocking = move_candidate(db, version, occurrence_id, body)
    if existing is None:
        # A closure already recorded its original placement; the regular move
        # endpoint can place its unresolved occurrence too.
        override = db.scalar(
            select(m.LessonOverride).where(
                m.LessonOverride.version_id == identifier,
                m.LessonOverride.occurrence_id == occurrence_id,
            )
        )
        if not override:
            raise HTTPException(404, "lesson_not_found")
    if blocking:
        raise HTTPException(409, dict(code="schedule_conflict", issues=blocking))
    if existing:
        event = m.ScheduleChangeEvent(
            version_id=identifier,
            kind="one_time_move",
            starts_on=existing.day,
            ends_on=existing.day,
            cohort_ids=[
                db.get(
                    m.Workload, db.get(m.Occurrence, occurrence_id).component_id
                ).course_group_id
            ],
            reason=body.reason,
            created_by=actor.id,
            request_id=request_id,
        )
        db.add(event)
        db.flush()
        remember(db, version, event, existing)
        db.delete(existing)
        db.flush()
    db.add(assignment_model(identifier, moved))
    version.revision += 1
    version.report = report
    record_audit(db, actor, "lesson.changed", "schedule", identifier, after=moved)
    return dict(revision=version.revision, report=report)


@router.post("/admin/schedule/versions/{identifier}/requested-moves/{request_id}")
def apply_request(
    identifier: int,
    request_id: int,
    body: RevisionInput,
    actor=Depends(administrator),
    db: Session = Depends(get_db),
):
    require_schema(db)
    lock_actor(db, actor, "admin")
    version = require_draft(db, identifier, body.revision)
    suggestion = db.get(m.ScheduleSuggestion, request_id)
    if (
        not suggestion
        or db.get(m.Account, suggestion.author_id).role != "lecturer"
        or suggestion.kind != "move"
    ):
        raise HTTPException(404, "suggestion_not_found")
    if suggestion.status != "accepted":
        raise HTTPException(409, "request_not_accepted")
    check_request_current(db, suggestion)
    source = db.get(m.ScheduleVersion, suggestion.version_id)
    if (
        source.term_id != version.term_id
        or suggestion.course_group_id not in version.cohort_ids
    ):
        raise HTTPException(409, "request_outdated")
    assignment = db.scalar(
        select(m.Assignment).where(
            m.Assignment.version_id == identifier,
            m.Assignment.occurrence_id == suggestion.occurrence_id,
        )
    )
    if assignment is None or suggestion.anchor != dict(
        day=str(assignment.day), slot=assignment.slot, room_id=assignment.room_id
    ):
        raise HTTPException(409, "request_outdated")
    move = OnceInput(
        revision=body.revision,
        day=suggestion.proposed_day,
        slot=suggestion.proposed_slot,
        room_id=suggestion.proposed_room_id or assignment.room_id,
        reason=suggestion.body[:500],
    )
    result = save_once(
        db, version, suggestion.occurrence_id, move, actor, request_id=suggestion.id
    )
    db.commit()
    return result
