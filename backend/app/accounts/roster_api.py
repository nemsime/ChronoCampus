from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, PositiveInt, StringConstraints
from sqlalchemy import false, select, true
from sqlalchemy.orm import Session

from app.accounts import dependencies, roster
from app.accounts.dependencies import current_user, dean
from app.accounts.roles import ADMIN, DEAN, STUDENT
from app.accounts.roster_models import StudentEnrollment, StudentTransfer
from app.db.models import Account, CourseGroup, SmallGroup, Term
from app.db.session import get_db, lock_revision
from app.observability.audit import record_audit

router = APIRouter(tags=["student roster"])


class RosterInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ImportInput(RosterInput):
    term_id: PositiveInt
    csv: str = Field(max_length=2_000_000)


class EnrollmentInput(RosterInput):
    small_group_id: PositiveInt


class TransferInput(EnrollmentInput):
    reason: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
    ]


class DecisionInput(RosterInput):
    ids: list[PositiveInt] = Field(min_length=1, max_length=100)
    approve: bool


def _student(account: Account = Depends(current_user)) -> Account:
    if account.role != STUDENT:
        raise HTTPException(403, "student_required")
    return account


def _staff(account: Account = Depends(current_user)) -> Account:
    if account.role not in {ADMIN, DEAN}:
        raise HTTPException(403, "student_groups_staff_required")
    return account


def _settings():
    settings = dependencies.get_settings()
    if not settings.strict_student_groups:
        raise HTTPException(409, "strict_student_groups_disabled")
    return settings


def _groups(db: Session, course_ids: set[int]):
    if not course_ids:
        return []
    return db.scalars(
        select(SmallGroup)
        .where(SmallGroup.course_group_id.in_(course_ids))
        .order_by(SmallGroup.course_group_id, SmallGroup.id)
    ).all()


def _group_data(group: SmallGroup) -> dict:
    return {"id": group.id, "label": group.label, "capacity": group.capacity}


@router.get("/student-groups/me")
def student_groups(db: Session = Depends(get_db), student: Account = Depends(_student)):
    enabled = dependencies.get_settings().strict_student_groups
    enrollment = db.get(StudentEnrollment, student.id) if enabled else None
    confirmed = roster.enrollment_confirmed(student, enrollment)
    groups = _groups(db, {student.course_group_id}) if confirmed else []
    assigned = next(
        (group for group in groups if group.id == student.small_group_id), None
    )
    requests = []
    if confirmed:
        requests = [
            {
                "id": row.id,
                "status": row.status,
                "reason": row.reason,
                "target_label": label,
            }
            for row, label in db.execute(
                select(StudentTransfer, SmallGroup.label)
                .join(SmallGroup, StudentTransfer.target_group_id == SmallGroup.id)
                .where(StudentTransfer.account_id == student.id)
                .order_by(StudentTransfer.id.desc())
                .limit(100)
            )
        ]
    return {
        "enabled": enabled,
        "confirmed": confirmed,
        "needs_subgroup": bool(groups and assigned is None),
        "pending": enabled and not confirmed,
        "current_group_id": assigned.id if assigned else None,
        "current_group_label": assigned.label if assigned else None,
        "groups": [_group_data(group) for group in groups],
        "requests": requests,
    }


@router.post("/student-groups/transfers")
def submit_transfer(
    body: TransferInput,
    db: Session = Depends(get_db),
    student: Account = Depends(_student),
):
    _settings()
    lock_revision(db, changed=False)
    db.refresh(student)
    transfer = roster.request_transfer(db, student, body.small_group_id, body.reason)
    record_audit(
        db,
        student,
        "student_group.transfer_requested",
        "student_transfers",
        transfer.id,
    )
    db.commit()
    return {"id": transfer.id, "status": transfer.status}


@router.get("/student-roster/options")
def roster_options(db: Session = Depends(get_db), actor: Account = Depends(_staff)):
    if not dependencies.get_settings().strict_student_groups:
        return {"enabled": False, "terms": [], "groups": [], "subgroups": []}
    courses = db.scalars(
        roster.scoped_courses(actor).order_by(CourseGroup.group_code)
    ).all()
    return {
        "enabled": True,
        "terms": [
            {"id": term.id, "name": term.name}
            for term in db.scalars(
                select(Term).order_by(Term.starts_on.desc(), Term.id.desc())
            )
        ],
        "groups": [
            {"id": course.id, "group_code": course.group_code} for course in courses
        ],
        "subgroups": [
            {**_group_data(group), "course_group_id": group.course_group_id}
            for group in _groups(db, {course.id for course in courses})
        ],
    }


@router.get("/student-roster/requests")
def pending_requests(db: Session = Depends(get_db), actor: Account = Depends(dean)):
    _settings()
    courses = roster.scoped_courses(actor).with_only_columns(CourseGroup.id)
    learners = (
        select(StudentEnrollment, Account)
        .join(Account, StudentEnrollment.account_id == Account.id)
        .where(
            StudentEnrollment.course_group_id.in_(courses),
            Account.is_active == true(),
            Account.email_verified == true(),
            Account.role == STUDENT,
        )
    )
    return {
        "enrollments": [
            {
                "id": row.account_id,
                "display_name": account.display_name,
                "email": account.email,
                "course_group_id": row.course_group_id,
            }
            for row, account in db.execute(
                learners.where(StudentEnrollment.confirmed == false()).order_by(
                    StudentEnrollment.account_id
                )
            )
        ],
        "transfers": [
            {
                "id": transfer.id,
                "display_name": account.display_name,
                "course_group_id": row.course_group_id,
                "target_label": label,
                "reason": transfer.reason,
            }
            for row, account, transfer, label in db.execute(
                learners.add_columns(StudentTransfer, SmallGroup.label)
                .join(
                    StudentTransfer,
                    StudentTransfer.account_id == StudentEnrollment.account_id,
                )
                .join(SmallGroup, StudentTransfer.target_group_id == SmallGroup.id)
                .where(StudentTransfer.status == "pending")
                .order_by(StudentTransfer.id)
            )
        ],
    }


@router.post("/student-roster/import")
def upload_roster(
    body: ImportInput, db: Session = Depends(get_db), actor: Account = Depends(_staff)
):
    settings = _settings()
    lock_revision(db, changed=False)
    db.refresh(actor)
    _staff(actor)
    result = roster.import_roster(
        db,
        actor,
        body.term_id,
        body.csv,
        settings.student_subgroup_max_size,
        settings.university_email_domains,
    )
    if result["imported"]:
        record_audit(db, actor, "student_roster.imported", "terms", body.term_id)
        db.commit()
    return result


@router.post("/student-roster/enrollments/{account_id}")
def assign_enrollment(
    account_id: PositiveInt,
    body: EnrollmentInput,
    db: Session = Depends(get_db),
    actor: Account = Depends(dean),
):
    settings = _settings()
    lock_revision(db, changed=False)
    db.refresh(actor)
    dean(actor)
    roster.approve_enrollment(
        db, actor, account_id, body.small_group_id, settings.student_subgroup_max_size
    )
    record_audit(db, actor, "student_roster.enrollment_approved", "users", account_id)
    db.commit()
    return {"id": account_id, "confirmed": True}


@router.post("/student-roster/transfers/decision")
def transfer_decision(
    body: DecisionInput,
    db: Session = Depends(get_db),
    actor: Account = Depends(dean),
):
    settings = _settings()
    lock_revision(db, changed=False)
    db.refresh(actor)
    dean(actor)
    ids = list(dict.fromkeys(body.ids))
    rows = roster.decide_transfers(
        db, actor, ids, body.approve, settings.student_subgroup_max_size
    )
    for row in rows:
        record_audit(
            db,
            actor,
            f"student_group.transfer_{row.status}",
            "student_transfers",
            row.id,
        )
    db.commit()
    return {"updated": len(rows)}
