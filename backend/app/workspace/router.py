"""Bounded dashboard reads with the same scope checks as the published timetable."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import false, func, select, true
from sqlalchemy.orm import Session

from app.db import models as m
from app.db.session import get_db
from app.scheduling import queries as q

router = APIRouter(prefix="/workspace", tags=["workspace"])


def count_rows(model, *conditions):
    return select(func.count()).select_from(model).where(*conditions).scalar_subquery()


def overview_data(db: Session, scope: dict, day: date) -> dict:
    monday = day - timedelta(days=day.weekday())
    sunday, upcoming_end = monday + timedelta(days=6), day + timedelta(days=6)
    # Aggregate dates in SQL instead of loading a semester to count it in Python.
    counts = dict(db.execute(
        select(q.A.c.day, func.count()).select_from(q.source(scope))
        .where(q.authorized(scope), q.A.c.cancelled == false(),
               q.A.c.day >= monday, q.A.c.day <= max(sunday, upcoming_end))
        .group_by(q.A.c.day)
    ).all())
    week = [{"day": monday + timedelta(days=index),
             "lessons": counts.get(monday + timedelta(days=index), 0)}
            for index in range(7)]
    support_statement = select(m.Feedback.status, func.count()).group_by(m.Feedback.status)
    if scope["role"] != "admin":
        support_statement = support_statement.where(m.Feedback.user_id == scope["id"])
    support_counts = dict(db.execute(support_statement).all())
    support = {status: support_counts.get(status, 0)
               for status in ("new", "in_progress", "closed")}
    stats = {
        "today_lessons": counts.get(day, 0),
        "week_lessons": sum(item["lessons"] for item in week),
        "personal_notes": db.scalar(select(count_rows(m.Note, m.Note.user_id == scope["id"]))),
        "open_requests": support["new"] + support["in_progress"],
    }
    upcoming_statement = (
        q.selection(scope, {"start": day, "end": upcoming_end})
        .where(q.A.c.cancelled == false())
        .order_by(q.A.c.day, q.A.c.starts_at, q.A.c.occurrence_id, q.A.c.id).limit(6)
    )
    upcoming = []
    for row in db.execute(upcoming_statement).mappings():
        item = dict(row)
        configuration = item.pop("configuration") or {}
        term_start = configuration.get("term", {}).get("starts_on") or item.pop("starts_on")
        item.pop("starts_on", None)
        item["parity"] = q.parity(term_start, item["day"])
        upcoming.append(item)
    versions, activity = [], []
    if scope["role"] == "admin":
        aggregates = db.execute(select(
            count_rows(m.CourseGroup).label("total_cohorts"),
            count_rows(m.Room).label("total_rooms"),
            count_rows(m.Account, m.Account.is_active == true(),
                       m.Account.role.in_(["admin", "lecturer", "student"])).label("active_users"),
            count_rows(m.ScheduleVersion, m.ScheduleVersion.status == "draft").label("draft_versions"),
            select(func.count(func.distinct(m.PublishedGroup.course_group_id)))
            .scalar_subquery().label("published_cohorts"),
            count_rows(m.GenerationRun, m.GenerationRun.status.in_(
                ["queued", "running", "retry_wait"])).label("active_runs"),
        )).mappings().one()
        stats.update(dict(aggregates))
        # Small projection only: no generation snapshots or private audit details.
        version_rows = db.execute(
            select(m.ScheduleVersion.id, m.ScheduleVersion.name, m.ScheduleVersion.status,
                   m.Term.name.label("term"),
                   m.ScheduleVersion.report["complete"].as_boolean().label("report_complete"))
            .join(m.Term, m.Term.id == m.ScheduleVersion.term_id)
            .order_by(m.ScheduleVersion.id.desc()).limit(5)
        ).mappings()
        versions = [{"id": row["id"], "name": row["name"], "status": row["status"],
                     "term": row["term"], "report_complete": bool(row["report_complete"])}
                    for row in version_rows]
        activity = [dict(row) for row in db.execute(
            select(m.AuditEvent.id, m.AuditEvent.action, m.AuditEvent.resource,
                   m.AuditEvent.created_at)
            .order_by(m.AuditEvent.id.desc()).limit(8)
        ).mappings()]
    return {"date": day, "stats": stats, "week": week, "upcoming": upcoming,
            "versions": versions, "activity": activity, "support": support}


@router.get("/overview")
def overview(request: Request, response: Response, day: date,
             db: Session = Depends(get_db)):
    if day > date.max - timedelta(days=6):
        raise HTTPException(422, "schedule_range_required", headers=q.PRIVATE)
    return q.consistent(db, request, response,
                        lambda scope: overview_data(db, scope, day))
