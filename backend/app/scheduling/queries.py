"""Bounded published reads. No ORM identity-map or response cache is consulted."""

import base64
import hashlib
import json
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import and_, false, func, or_, select, true
from sqlalchemy.orm import Session

from app.accounts.dependencies import COOKIE
from app.calendar.rules import parity
from app.core.security import token_hash
from app.db import models as m
from app.db.session import get_db

router = APIRouter(tags=["scheduling"])
PRIVATE = {"Cache-Control": "private, no-store"}
FILTERS = ("term_id", "course_group_id", "teacher_id", "room_id", "subject_id", "lesson_type")
A, W = m.Assignment.__table__, m.Workload.__table__
Occurrences, P = m.Occurrence.__table__, m.PublishedGroup.__table__
V, T = m.ScheduleVersion.__table__, m.Term.__table__
S, U = m.Subject.__table__, m.Account.__table__
G, R = m.CourseGroup.__table__, m.Room.__table__
SG, LG = m.SmallGroup.__table__, m.LabGroup.__table__


def fresh_scope(db, request):
    # End the previous read transaction too: a snapshot-isolated connection must
    # not revalidate against its original snapshot. These endpoints never write.
    db.rollback()
    sessions = m.UserSession.__table__
    row = db.execute(
        select(U.c.id, U.c.role, U.c.course_group_id, U.c.small_group_id,
               U.c.lab_group_id, U.c.must_change_password,
               select(m.DataRevision.revision).where(m.DataRevision.id == 1)
               .scalar_subquery().label("revision"))
        .join(sessions, sessions.c.user_id == U.c.id)
        .where(sessions.c.session_token == token_hash(request.cookies.get(COOKIE, "")),
               sessions.c.is_revoked == false(), sessions.c.expires_at > datetime.utcnow(),
               U.c.is_active == true(), U.c.role.in_(["admin", "lecturer", "student"]))
    ).mappings().first()
    if row is None:
        raise HTTPException(401, "authentication_required", headers=PRIVATE)
    if row["must_change_password"]:
        raise HTTPException(403, "password_change_required", headers=PRIVATE)
    if row["revision"] is None:
        raise HTTPException(503, "revision_unavailable", headers=PRIVATE)
    return dict(row)


def authorized(scope):
    if scope["role"] == "admin":
        return true()
    if scope["role"] == "lecturer":
        return W.c.teacher_id == scope["id"]
    if scope["role"] != "student" or not scope["course_group_id"]:
        return false()
    predicate = W.c.course_group_id == scope["course_group_id"]
    if scope["small_group_id"]:
        same_small = W.c.small_group_id == scope["small_group_id"]
        if scope["lab_group_id"]:
            same_small = and_(same_small, or_(W.c.lab_group_id.is_(None),
                                              W.c.lab_group_id == scope["lab_group_id"]))
        predicate = and_(predicate, or_(W.c.small_group_id.is_(None), same_small))
    return predicate


def source(scope):
    return (A.join(Occurrences, A.c.occurrence_id == Occurrences.c.id)
            .join(W, Occurrences.c.component_id == W.c.id)
            .join(P, and_(P.c.version_id == A.c.version_id,
                          P.c.course_group_id == W.c.course_group_id,
                          P.c.term_id == W.c.term_id))
            .join(V, V.c.id == A.c.version_id).join(T, T.c.id == V.c.term_id)
            .join(S, S.c.id == W.c.subject_id).join(U, U.c.id == W.c.teacher_id)
            .join(G, G.c.id == W.c.course_group_id).join(R, R.c.id == A.c.room_id)
            .outerjoin(SG, SG.c.id == W.c.small_group_id)
            .outerjoin(LG, LG.c.id == W.c.lab_group_id))


def filters(start: date | None = None, end: date | None = None,
            term_id: int | None = None, course_group_id: int | None = None,
            teacher_id: int | None = None, room_id: int | None = None,
            subject_id: int | None = None, lesson_type: str | None = Query(None, max_length=20)):
    return dict(start=start, end=end, term_id=term_id, course_group_id=course_group_id,
                teacher_id=teacher_id, room_id=room_id, subject_id=subject_id,
                lesson_type=lesson_type)


def selection(scope, values):
    statement = select(*A.c, W.c.id.label("component_id"), W.c.term_id,
                       T.c.name.label("term"), W.c.subject_id, S.c.name.label("subject"),
                       W.c.teacher_id, U.c.display_name.label("teacher"),
                       W.c.course_group_id, G.c.group_code.label("group"),
                       W.c.small_group_id, W.c.lab_group_id, SG.c.label.label("small_group"),
                       LG.c.label.label("lab_group"), R.c.room_number.label("room"),
                       W.c.lesson_type, V.c.configuration, T.c.starts_on)
    statement = statement.select_from(source(scope)).where(authorized(scope))
    for key in FILTERS:
        if values.get(key) is not None:
            statement = statement.where((A.c[key] if key == "room_id" else W.c[key]) == values[key])
    if values.get("start"):
        statement = statement.where(A.c.day >= values["start"])
    if values.get("end"):
        statement = statement.where(A.c.day <= values["end"])
    return statement


def fingerprint(scope, values):
    return hashlib.sha256(json.dumps([scope, values], sort_keys=True, default=str).encode()).hexdigest()


def decode_cursor(cursor, expected):
    try:
        if len(cursor) > 2048:
            raise ValueError()
        payload = json.loads(base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True))
        if not isinstance(payload, dict) or payload.get("v") != 1:
            raise ValueError()
        day, starts, occurrence, identifier = payload["last"]
        key = (date.fromisoformat(day), time.fromisoformat(starts), occurrence, identifier)
        if (type(occurrence) is not int or type(identifier) is not int
                or not 1 <= occurrence <= 2**31 - 1 or not 1 <= identifier <= 2**31 - 1
                or key[1].tzinfo is not None):
            raise ValueError()
        if payload["scope"] != expected:
            raise HTTPException(409, "stale_cursor", headers=PRIVATE)
        return key
    except (ValueError, TypeError, KeyError, UnicodeError, OverflowError):
        raise HTTPException(422, "invalid_cursor", headers=PRIVATE) from None


def materialize(db, scope, values, limit, cursor=None):
    signature = fingerprint(scope, values)
    statement = selection(scope, values)
    columns = (A.c.day, A.c.starts_at, A.c.occurrence_id, A.c.id)
    if cursor is not None:
        last = decode_cursor(cursor, signature)
        statement = statement.where(or_(*[
            and_(*(columns[j] == last[j] for j in range(i)), columns[i] > last[i])
            for i in range(4)
        ]))
    rows = db.execute(statement.order_by(*columns).limit(limit + 1)).mappings().all()
    items = []
    for row in rows[:limit]:
        item = dict(row)
        configuration = item.pop("configuration") or {}
        start = configuration.get("term", {}).get("starts_on") or item["starts_on"]
        item.pop("starts_on")
        item["parity"] = parity(start, item["day"])
        items.append(item)
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        payload = {"v": 1, "scope": signature, "last": [str(last["day"]), str(last["starts_at"]),
                                                           last["occurrence_id"], last["id"]]}
        next_cursor = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return {"items": items, "next_cursor": next_cursor, "revision": scope["revision"]}


def consistent(db, request, response, operation):
    response.headers["Cache-Control"] = "private, no-store"
    for _ in range(2):
        scope = fresh_scope(db, request)
        try:
            result = operation(scope)
        except HTTPException as error:
            # Even a materialized overflow/error must not bypass revocation.
            if fresh_scope(db, request) != scope:
                continue
            error.headers = {**(error.headers or {}), **PRIVATE}
            raise
        if fresh_scope(db, request) == scope:
            return result
    raise HTTPException(409, "schedule_changed", headers=PRIVATE)


@router.get("/schedule/page")
def schedule_page(request: Request, response: Response, start: date, end: date,
                  limit: int = Query(100, ge=1, le=500),
                  cursor: str | None = Query(None, max_length=2048),
                  values: dict = Depends(filters), db: Session = Depends(get_db)):
    if not 0 <= (end - start).days <= 30:
        raise HTTPException(422, "schedule_range_required", headers=PRIVATE)
    values = {**values, "start": start, "end": end, "limit": limit}
    return consistent(db, request, response,
                      lambda scope: materialize(db, scope, values, limit, cursor))


@router.get("/schedule")
def published_schedule(request: Request, response: Response, values: dict = Depends(filters),
                       db: Session = Depends(get_db)):
    if values["start"] and values["end"] and values["end"] < values["start"]:
        raise HTTPException(422, "schedule_range_required", headers=PRIVATE)

    def read(scope):
        result = materialize(db, scope, values, 500)
        if result["next_cursor"]:
            raise HTTPException(422, "pagination_required", headers=PRIVATE)
        return result["items"]

    return consistent(db, request, response, read)


@router.get("/schedule/facets")
def schedule_facets(request: Request, response: Response, db: Session = Depends(get_db)):
    def read(scope):
        choices = {}
        for key, identifier, label in (
            ("term_id", W.c.term_id, T.c.name),
            ("course_group_id", W.c.course_group_id, G.c.group_code),
            ("teacher_id", W.c.teacher_id, U.c.display_name),
            ("room_id", A.c.room_id, R.c.room_number),
            ("subject_id", W.c.subject_id, S.c.name),
            ("lesson_type", W.c.lesson_type, W.c.lesson_type),
        ):
            ordering = (label,) if label is identifier else (label, identifier)
            statement = (select(identifier.label("id"), label.label("label"))
                         .select_from(source(scope)).where(authorized(scope)).distinct()
                         .order_by(*ordering))
            choices[key] = [dict(row) for row in db.execute(statement).mappings()]
        bounds = db.execute(select(func.min(A.c.day), func.max(A.c.day))
                            .select_from(source(scope)).where(authorized(scope))).one()
        return {"filters": choices, "date_bounds": {"start": bounds[0], "end": bounds[1]},
                "revision": scope["revision"]}

    return consistent(db, request, response, read)
