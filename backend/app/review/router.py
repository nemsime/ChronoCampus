from datetime import date
from types import SimpleNamespace
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.dependencies import administrator, dean, schedule_reader
from app.accounts.roles import ADMIN, DEAN
from app.db import models as m
from app.db.session import get_db, lock_revision
from app.review import service as s
from app.review.schemas import (
    CommentInput, DecisionInput, ImplementedInput, SuggestionInput, SuggestionStatus,
)
from app.scheduling import queries as q
from app.scheduling.moves import move_candidate
from app.scheduling.router import MoveInput

router = APIRouter(tags=["timetable review"])


def private(response: Response):
    response.headers.update(q.PRIVATE)


def dean_scope(scope):
    if scope["role"] != DEAN:
        raise HTTPException(403, "dean_required", headers=q.PRIVATE)
    return SimpleNamespace(**scope)


def locked_actor(db, actor, role):
    lock_revision(db, changed=False)
    db.refresh(actor)
    if not actor.is_active or not actor.email_verified:
        raise HTTPException(401, "authentication_required", headers=q.PRIVATE)
    if actor.must_change_password:
        raise HTTPException(403, "password_change_required", headers=q.PRIVATE)
    if actor.role != role:
        raise HTTPException(403, "administrator_required" if role == ADMIN else "dean_required",
                            headers=q.PRIVATE)


def stable_version(db, identifier, scope, operation):
    version = s.require_version(db, identifier, scope)
    revision = version.revision
    result = operation(version)
    current = db.scalar(select(m.ScheduleVersion.revision).where(m.ScheduleVersion.id == identifier))
    if current != revision:
        raise HTTPException(409, "schedule_changed", headers=q.PRIVATE)
    return result


@router.get("/dean/versions", dependencies=[Depends(schedule_reader), Depends(private)])
def versions(request: Request, response: Response,
             status: Literal["draft", "published"] | None = None,
             db: Session = Depends(get_db)):
    return q.consistent(db, request, response, lambda scope: [
        s.version_view(db, version, scope) for version in s.visible_versions(db, scope, status)
    ])


@router.get("/dean/versions/{identifier}/schedule",
            dependencies=[Depends(schedule_reader), Depends(private)])
def schedule(identifier: int, request: Request, response: Response, start: date, end: date,
             limit: int = Query(100, ge=1, le=500),
             cursor: str | None = Query(None, max_length=2048),
             values: dict = Depends(q.filters), db: Session = Depends(get_db)):
    if not 0 <= (end - start).days <= 30:
        raise HTTPException(422, "schedule_range_required", headers=q.PRIVATE)

    def read(scope):
        return stable_version(db, identifier, scope, lambda version: q.materialize(
            db, scope, {**values, "start": start, "end": end, "limit": limit,
                        "version_revision": version.revision,
                        "_cohort_ids": version.cohort_ids}, limit, cursor, version_id=identifier
        ))

    return q.consistent(db, request, response, read)


@router.get("/dean/versions/{identifier}/facets",
            dependencies=[Depends(schedule_reader), Depends(private)])
def facets(identifier: int, request: Request, response: Response, db: Session = Depends(get_db)):
    return q.consistent(db, request, response, lambda scope: stable_version(
        db, identifier, scope, lambda version: q.facets(db, scope, version_id=identifier)
    ))


@router.get("/dean/versions/{identifier}/diff",
            dependencies=[Depends(schedule_reader), Depends(private)])
def diff(identifier: int, request: Request, response: Response,
         base: str = Query("published", max_length=20),
         limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0, le=100000),
         db: Session = Depends(get_db)):
    return q.consistent(db, request, response, lambda scope: stable_version(
        db, identifier, scope, lambda version: s.version_diff(db, scope, version, base, limit, offset)
    ))


@router.post("/dean/suggestions", status_code=201, dependencies=[Depends(private)])
def create_suggestion(body: SuggestionInput, actor: m.Account = Depends(dean),
                      db: Session = Depends(get_db)):
    locked_actor(db, actor, DEAN)
    suggestion = s.add_suggestion(db, body, actor)
    db.commit()
    return s.suggestion_view(db, suggestion, comments=True)


@router.get("/dean/suggestions", dependencies=[Depends(dean), Depends(private)])
def own_suggestions(request: Request, response: Response,
                    status: SuggestionStatus | None = None,
                    version_id: int | None = Query(None, ge=1),
                    limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0, le=100000),
                    db: Session = Depends(get_db)):
    return q.consistent(db, request, response, lambda scope: s.suggestions_page(
        db, dean_scope(scope), own=True, status=status, version_id=version_id, limit=limit, offset=offset
    ))


@router.get("/dean/suggestions/{identifier}", dependencies=[Depends(dean), Depends(private)])
def own_suggestion(identifier: int, request: Request, response: Response, db: Session = Depends(get_db)):
    return q.consistent(db, request, response, lambda scope: s.suggestion_view(
        db, s.require_suggestion(db, identifier, dean_scope(scope), own=True), comments=True
    ))


@router.post("/dean/suggestions/{identifier}/withdraw", dependencies=[Depends(private)])
def withdraw(identifier: int, actor: m.Account = Depends(dean), db: Session = Depends(get_db)):
    locked_actor(db, actor, DEAN)
    suggestion = s.require_suggestion(db, identifier, actor, own=True)
    s.transition(db, suggestion, actor, "open", "withdrawn")
    db.commit()
    return s.suggestion_view(db, suggestion, comments=True)


@router.post("/dean/suggestions/{identifier}/comments", status_code=201,
             dependencies=[Depends(private)])
def own_comment(identifier: int, body: CommentInput, actor: m.Account = Depends(dean),
                db: Session = Depends(get_db)):
    locked_actor(db, actor, DEAN)
    suggestion = s.require_suggestion(db, identifier, actor, own=True)
    comment = s.add_comment(db, suggestion, actor, body.content)
    db.commit()
    return comment


@router.get("/admin/suggestions", dependencies=[Depends(private)])
def inbox(status: SuggestionStatus | None = None, version_id: int | None = Query(None, ge=1),
          author_id: int | None = Query(None, ge=1), course_group_id: int | None = Query(None, ge=1),
          limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0, le=100000),
          actor: m.Account = Depends(administrator), db: Session = Depends(get_db)):
    return s.suggestions_page(db, actor, own=False, status=status, version_id=version_id,
                              author_id=author_id, course_group_id=course_group_id,
                              limit=limit, offset=offset)


@router.get("/admin/suggestions/{identifier}", dependencies=[Depends(private)])
def suggestion_detail(identifier: int, actor: m.Account = Depends(administrator),
                      db: Session = Depends(get_db)):
    return s.suggestion_view(db, s.require_suggestion(db, identifier, actor), comments=True)


@router.get("/admin/suggestions/{identifier}/check", dependencies=[Depends(private)])
def check(identifier: int, version_id: int = Query(..., ge=1),
          actor: m.Account = Depends(administrator), db: Session = Depends(get_db)):
    suggestion = s.require_suggestion(db, identifier, actor)
    version = db.get(m.ScheduleVersion, version_id, populate_existing=True)
    if version is None:
        raise HTTPException(404, "version_not_found", headers=q.PRIVATE)
    if version.status != "draft":
        raise HTTPException(409, "draft_required", headers=q.PRIVATE)
    if suggestion.kind not in {"move", "room"} or suggestion.occurrence_id is None:
        raise HTTPException(422, "invalid_proposal", headers=q.PRIVATE)
    assignment = db.scalar(select(m.Assignment).where(m.Assignment.version_id == version_id,
        m.Assignment.occurrence_id == suggestion.occurrence_id))
    if suggestion.kind == "room" and assignment is None:
        raise HTTPException(404, "lesson_not_found", headers=q.PRIVATE)
    day = suggestion.proposed_day if suggestion.kind == "move" else assignment.day
    slot = suggestion.proposed_slot if suggestion.kind == "move" else assignment.slot
    room = suggestion.proposed_room_id or (assignment.room_id if assignment else None)
    if room is None:
        raise HTTPException(422, "invalid_proposal", headers=q.PRIVATE)
    body = MoveInput(revision=version.revision, day=day, slot=slot,
                     room_id=room, pinned=assignment.pinned if assignment else False)
    try:
        _, _, _, issues = move_candidate(db, version, suggestion.occurrence_id, body)
    except HTTPException as error:
        if error.status_code not in {409, 422} or not isinstance(error.detail, str):
            raise
        issues = [{"code": error.detail, "occurrence_id": suggestion.occurrence_id}]
    return {"feasible": not issues, "issues": issues}


@router.put("/admin/suggestions/{identifier}/decision", dependencies=[Depends(private)])
def decision(identifier: int, body: DecisionInput, actor: m.Account = Depends(administrator),
             db: Session = Depends(get_db)):
    locked_actor(db, actor, ADMIN)
    suggestion = s.require_suggestion(db, identifier, actor)
    s.transition(db, suggestion, actor, body.expected_status, body.status, note=body.note)
    db.commit()
    return s.suggestion_view(db, suggestion, comments=True)


@router.post("/admin/suggestions/{identifier}/implemented", dependencies=[Depends(private)])
def implemented(identifier: int, body: ImplementedInput, actor: m.Account = Depends(administrator),
                db: Session = Depends(get_db)):
    locked_actor(db, actor, ADMIN)
    suggestion = s.require_suggestion(db, identifier, actor)
    s.transition(db, suggestion, actor, body.expected_status, "implemented", version_id=body.version_id)
    db.commit()
    return s.suggestion_view(db, suggestion, comments=True)


@router.post("/admin/suggestions/{identifier}/comments", status_code=201,
             dependencies=[Depends(private)])
def admin_comment(identifier: int, body: CommentInput, actor: m.Account = Depends(administrator),
                  db: Session = Depends(get_db)):
    locked_actor(db, actor, ADMIN)
    suggestion = s.require_suggestion(db, identifier, actor)
    comment = s.add_comment(db, suggestion, actor, body.content)
    db.commit()
    return comment
