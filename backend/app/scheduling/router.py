from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, func, update
from sqlalchemy.orm import Session

from app.accounts.dependencies import administrator, current_user
from app.calendar.rules import audiences_overlap, lesson_slot, parity
from app.db import models as m
from app.db.session import get_db, lock_revision
from app.scheduling.snapshot import (
    build_snapshot,
    current_assignments,
    record,
    snapshot_hash,
)
from app.scheduling.solver import generate
from app.scheduling.validation import validate

router = APIRouter(tags=["scheduling"])
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="chronocampus-solver")
logger = logging.getLogger(__name__)


class DraftInput(BaseModel):
    term_id: int
    cohort_ids: list[int] = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)


class GenerateInput(BaseModel):
    revision: int
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


@router.get("/schedule")
def published_schedule(
    start: date | None = None,
    end: date | None = None,
    term_id: int | None = None,
    course_group_id: int | None = None,
    teacher_id: int | None = None,
    room_id: int | None = None,
    subject_id: int | None = None,
    lesson_type: str | None = None,
    account: m.Account = Depends(current_user),
    db: Session = Depends(get_db),
):
    output = []
    for assignment, component in current_assignments(db):
        if not readable(account, component):
            continue
        if start and assignment.day < start or end and assignment.day > end:
            continue
        if (
            any(
                value is not None and getattr(component, key) != value
                for key, value in (
                    ("term_id", term_id),
                    ("course_group_id", course_group_id),
                    ("teacher_id", teacher_id),
                    ("subject_id", subject_id),
                    ("lesson_type", lesson_type),
                )
            )
            or room_id is not None
            and assignment.room_id != room_id
        ):
            continue
        output.append(assignment_view(db, assignment, component))
    return sorted(
        output, key=lambda row: (row["day"], row["starts_at"], row["occurrence_id"])
    )


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
def create_draft(body: DraftInput, db: Session = Depends(get_db)):
    lock_revision(db)
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
        "last_run": {
            key: getattr(last_run, key)
            for key in ("id", "version_id", "status", "result")
        }
        if last_run
        else None,
    }


@router.post(
    "/admin/schedule/versions/{identifier}/generate",
    status_code=202,
    dependencies=[Depends(administrator)],
)
def start_generation(
    identifier: int, body: GenerateInput, db: Session = Depends(get_db)
):
    lock_revision(db, changed=False)
    version = require_draft(db, identifier, body.revision)
    if db.scalar(
        select(m.GenerationRun.id)
        .where(
            m.GenerationRun.version_id == identifier,
            m.GenerationRun.status.in_(["queued", "running"]),
        )
        .limit(1)
    ):
        raise HTTPException(409, "generation_already_running")
    if (
        db.scalar(
            select(func.count())
            .select_from(m.GenerationRun)
            .where(m.GenerationRun.status.in_(["queued", "running"]))
        )
        >= 4
    ):
        raise HTTPException(429, "generation_queue_full")
    snapshot = build_snapshot(db, version, materialize=True)
    run = m.GenerationRun(
        version_id=identifier,
        source_revision=version.revision,
        status="queued",
        seed=body.seed,
        algorithm=body.algorithm,
        input_hash=snapshot_hash(snapshot),
        snapshot=snapshot,
    )
    db.add(run)
    db.commit()
    executor.submit(execute_run, db.get_bind(), run.id)
    return {"id": run.id, "status": "queued"}


def recover_runs(engine):
    """The supported deployment runs one API process with one solver worker."""
    with Session(engine) as db:
        lock_revision(db, changed=False)
        db.execute(
            update(m.GenerationRun)
            .where(m.GenerationRun.status.in_(["queued", "running"]))
            .values(
                status="interrupted",
                finished_at=datetime.utcnow(),
                result={"error": "server_restarted"},
            )
        )
        db.commit()


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


def execute_run(engine, identifier):
    with Session(engine, expire_on_commit=False) as db:
        try:
            run = db.get(m.GenerationRun, identifier)
            if not run or run.status != "queued":
                return
            run.status = "running"
            db.commit()
            result = generate(
                run.snapshot,
                run.algorithm,
                run.seed,
                run.snapshot["term"]["search_seconds"],
            )
            # Search happens outside a transaction. Recheck both catalog and draft versions now.
            revision = lock_revision(db, changed=False)
            version = db.get(m.ScheduleVersion, run.version_id, populate_existing=True)
            run.result = result
            run.finished_at = datetime.utcnow()
            if (
                version.status != "draft"
                or version.revision != run.source_revision
                or revision != run.snapshot["data_revision"]
            ):
                run.status = "stale"
            elif result["status"] in {"INVALID_PINS", "MODEL_INVALID"} or any(
                issue["code"] != "configuration_unconfirmed"
                for issue in result["report"]["issues"]
            ):
                run.status = "rejected"
            else:
                db.execute(
                    delete(m.Assignment).where(m.Assignment.version_id == version.id)
                )
                db.add_all(
                    assignment_model(version.id, row) for row in result["assignments"]
                )
                version.report = result["report"]
                version.configuration = {
                    "term": run.snapshot["term"],
                    "calendar": run.snapshot["calendar"],
                }
                version.revision += 1
                db.get(m.DataRevision, 1).revision += 1
                run.status = "complete" if result["report"]["complete"] else "partial"
            db.commit()
        except Exception as error:
            db.rollback()
            logger.error("Generation failed: %s", type(error).__name__)
            run = db.get(m.GenerationRun, identifier)
            if run:
                run.status = "failed"
                run.finished_at = datetime.utcnow()
                run.result = {"error": "generation_failed"}
                db.commit()


@router.get("/admin/schedule/runs/{identifier}", dependencies=[Depends(administrator)])
def run_status(identifier: int, db: Session = Depends(get_db)):
    run = db.get(m.GenerationRun, identifier)
    if not run:
        raise HTTPException(404, "run_not_found")
    return {
        key: getattr(run, key)
        for key in (
            "id",
            "version_id",
            "status",
            "algorithm",
            "seed",
            "input_hash",
            "result",
            "created_at",
            "finished_at",
        )
    }


@router.put(
    "/admin/schedule/versions/{identifier}/assignments/{occurrence_id}",
    dependencies=[Depends(administrator)],
)
def move_assignment(
    identifier: int, occurrence_id: int, body: MoveInput, db: Session = Depends(get_db)
):
    lock_revision(db)
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
        db.delete(existing)
        db.flush()
    db.add(assignment_model(identifier, moved))
    version.revision += 1
    version.report = report
    db.commit()
    return {"revision": version.revision, "report": report}


@router.post(
    "/admin/schedule/versions/{identifier}/publish",
    dependencies=[Depends(administrator)],
)
def publish(identifier: int, body: RevisionInput, db: Session = Depends(get_db)):
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
):
    lock_revision(db)
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
    db.commit()
    return {"revision": version.revision, "message": "replacement_required"}
