from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy import delete, func, inspect, select
from sqlalchemy.orm import Session

from app.academics import schemas as s
from app.accounts.dependencies import administrator, public_account
from app.accounts.roles import ADMIN, DEAN, LECTURER, STUDENT
from app.accounts.router import EmailInput, revoke_sessions
from app.calendar.rules import academic_start_year, pe_workload_errors
from app.core.security import password_hash
from app.db import models as m
from app.db.session import get_db, lock_revision
from app.observability.audit import record_audit

router = APIRouter(
    prefix="/admin", tags=["administration"], dependencies=[Depends(administrator)]
)
RESOURCES = {
    "faculties": (m.Faculty, s.FacultyInput),
    "majors": (m.Major, s.MajorInput),
    "groups": (m.CourseGroup, s.GroupInput),
    "subgroups": (m.SmallGroup, s.SmallGroupInput),
    "lab-groups": (m.LabGroup, s.LabGroupInput),
    "buildings": (m.Building, s.BuildingInput),
    "rooms": (m.Room, s.RoomInput),
    "equipment": (m.Equipment, s.EquipmentInput),
    "subjects": (m.Subject, s.SubjectInput),
    "users": (m.Account, s.AccountInput),
    "calendars": (m.CalendarConfig, s.CalendarInput),
    "terms": (m.Term, s.TermInput),
    "periods": (m.TeachingPeriod, s.PeriodInput),
    "holidays": (m.Holiday, s.HolidayInput),
    "extra-permissions": (m.ExtraPermission, s.ExtraInput),
    "availability": (m.Availability, s.AvailabilityInput),
    "workloads": (m.Workload, s.WorkloadInput),
}


def resource_type(resource):
    if resource not in RESOURCES:
        raise HTTPException(404, "resource_not_found")
    return RESOURCES[resource]


def serialize(row, db):
    if isinstance(row, m.Account):
        return public_account(row)
    result = {
        column.key: getattr(row, column.key) for column in inspect(type(row)).columns
    }
    if isinstance(row, m.CalendarConfig):
        result["quality_weights"] = {"late_start": 1, **row.quality_weights}
    if isinstance(row, m.Room):
        result["equipment_ids"] = list(
            db.scalars(
                select(m.RoomEquipment.equipment_type_id).where(
                    m.RoomEquipment.room_id == row.id
                )
            )
        )
    if isinstance(row, m.Subject):
        result.pop("lesson_type_id", None)
    return result


def require_record(db, model, identifier):
    row = db.get(model, identifier) if identifier is not None else None
    if row is None:
        raise HTTPException(422, "invalid_reference")
    return row


def membership(db, data, resource):
    group_id, small_id, lab_id = (
        data.get(k) for k in ("course_group_id", "small_group_id", "lab_group_id")
    )
    if group_id:
        require_record(db, m.CourseGroup, group_id)
    if (
        small_id
        and require_record(db, m.SmallGroup, small_id).course_group_id != group_id
    ):
        raise HTTPException(422, "invalid_subgroup")
    if lab_id:
        lab = require_record(db, m.LabGroup, lab_id)
        if lab.small_group_id is None:
            if lab.course_group_id != group_id or (resource == "workloads" and small_id):
                raise HTTPException(422, "invalid_lab_group")
        elif lab.small_group_id != small_id:
            raise HTTPException(422, "invalid_lab_group")


def lab_capacity(group_id):
    return (select(func.coalesce(func.sum(m.LabGroup.capacity), 0))
            .outerjoin(m.SmallGroup, m.LabGroup.small_group_id == m.SmallGroup.id)
            .where(func.coalesce(m.LabGroup.course_group_id, m.SmallGroup.course_group_id) == group_id))


def validate_calendar_workloads(db, resource, data, existing):
    """Calendar edits must preserve already materialized curriculum identity."""
    if not existing or resource not in {"calendars", "terms"}:
        return
    if resource == "calendars":
        scope = m.Workload.term_id.in_(
            select(m.Term.id).where(m.Term.calendar_id == existing.id)
        )
        form, units = data["study_form"], data["academic_hours_per_lesson"]
        old_units = existing.academic_hours_per_lesson
        weeks = data["teaching_weeks"]
    else:
        calendar = require_record(db, m.CalendarConfig, data["calendar_id"])
        previous = require_record(db, m.CalendarConfig, existing.calendar_id)
        scope = m.Workload.term_id == existing.id
        form, units = calendar.study_form, calendar.academic_hours_per_lesson
        old_units = previous.academic_hours_per_lesson
        weeks = calendar.teaching_weeks
    if db.scalar(
        select(m.Workload.id)
        .join(m.CourseGroup, m.CourseGroup.id == m.Workload.course_group_id)
        .join(m.Major, m.Major.id == m.CourseGroup.major_id)
        .where(scope, m.Major.study_form != form).limit(1)
    ):
        raise HTTPException(422, "study_form_mismatch")
    if old_units != units and db.scalar(
        select(m.Occurrence.id)
        .join(m.Workload, m.Workload.id == m.Occurrence.component_id)
        .where(scope).limit(1)
    ):
        raise HTTPException(409, "academic_units_have_occurrences")
    if units and db.scalar(
        select(m.Workload.id).where(scope, m.Workload.semester_hours % units != 0).limit(1)
    ):
        raise HTTPException(422, "indivisible_workload")
    pe = (scope, m.Workload.lesson_type == "pe")
    if db.scalar(
        select(m.Workload.id)
        .where(*pe, m.Workload.semester_hours != 2 * weeks * (units or 0))
        .limit(1)
    ):
        raise HTTPException(422, "pe_weekly_hours")
    if resource == "terms":
        year = academic_start_year(data["academic_year"], data["starts_on"])
        if db.scalar(
            select(m.Workload.id)
            .join(m.CourseGroup, m.CourseGroup.id == m.Workload.course_group_id)
            .where(*pe, m.CourseGroup.admission_year.not_in({year, year - 1}))
            .limit(1)
        ):
            raise HTTPException(422, "pe_year_ineligible")


def validate_domain(db, resource, data, existing, actor):
    # A role change must remove an old dean scope even if an editor echoes it.
    if resource == "users" and data["role"] != DEAN:
        if existing and existing.role == DEAN:
            data["faculty_id"] = None
        elif data.get("faculty_id") is not None:
            raise HTTPException(422, "faculty_dean_only")
    if resource in {"users", "workloads", "subgroups"}:
        membership(db, data, resource)
    model, _ = resource_type(resource)
    # Check references before persistence, yielding stable errors instead of driver text.
    for column in inspect(model).columns:
        if data.get(column.key) is not None:
            for foreign in column.foreign_keys:
                table = foreign.column.table
                found = db.execute(
                    select(table.c.id).where(table.c.id == data[column.key])
                ).first()
                if not found:
                    raise HTTPException(422, "invalid_reference")
    validate_calendar_workloads(db, resource, data, existing)
    if resource == "users":
        try:
            data["email"] = EmailInput(email=data["email"]).email
        except ValidationError:
            raise HTTPException(422, "invalid_email") from None
        if data["role"] == STUDENT and not data.get("course_group_id"):
            raise HTTPException(422, "student_group_required")
        if data["role"] != STUDENT and any(
            data.get(k) for k in ("course_group_id", "small_group_id", "lab_group_id")
        ):
            raise HTTPException(422, "student_membership_only")
        if (
            existing
            and existing.id == actor.id
            and (data["role"] != ADMIN or not data["is_active"])
        ):
            raise HTTPException(409, "cannot_disable_self")
        if (
            existing
            and existing.role == LECTURER
            and (data["role"] != LECTURER or not data["is_active"])
        ):
            if db.scalar(
                select(m.Workload.id)
                .where(m.Workload.teacher_id == existing.id)
                .limit(1)
            ):
                raise HTTPException(409, "teacher_has_workload")
        secret = data.pop("password", None)
        if secret:
            data["password_hash"] = password_hash(secret)
            data["must_change_password"] = True
        elif not existing:
            raise HTTPException(422, "password_required")
        if existing:
            revoke_sessions(db, existing.id)
    if resource in {"rooms", "workloads"}:
        for identifier in data["equipment_ids"]:
            require_record(db, m.Equipment, identifier)
        data["equipment_ids"] = sorted(set(data["equipment_ids"]))
    if (
        resource == "groups"
        and existing
        and any(
            data[key] != getattr(existing, key)
            for key in ("major_id", "admission_year")
        )
    ):
        if db.scalar(
            select(m.Workload.id)
            .where(m.Workload.course_group_id == existing.id)
            .limit(1)
        ):
            raise HTTPException(409, "cohort_identity_has_workload")
    if resource == "majors" and existing and data["study_form"] != existing.study_form:
        if db.scalar(
            select(m.Workload.id)
            .join(m.CourseGroup, m.CourseGroup.id == m.Workload.course_group_id)
            .where(m.CourseGroup.major_id == existing.id)
            .limit(1)
        ):
            raise HTTPException(409, "study_form_has_workload")
    if resource == "lab-groups":
        small_id = data["small_group_id"]
        if small_id is not None:
            small = require_record(db, m.SmallGroup, small_id)
            if data["course_group_id"] not in {None, small.course_group_id}:
                raise HTTPException(422, "invalid_subgroup")
            data["course_group_id"] = small.course_group_id
        group = require_record(db, m.CourseGroup, data["course_group_id"])
        if existing and (existing.small_group_id != small_id or
                         existing.course_group_id not in {None, group.id}):
            raise HTTPException(409, "group_parent_immutable")
        others = lab_capacity(group.id)
        if existing:
            others = others.where(m.LabGroup.id != existing.id)
        if db.scalar(others) + data["capacity"] > group.capacity:
            raise HTTPException(422, "subgroup_capacity")
    if resource == "subgroups" or (resource == "lab-groups" and data["small_group_id"]):
        parent_model, parent_key = ((m.CourseGroup, "course_group_id") if resource == "subgroups"
                                    else (m.SmallGroup, "small_group_id"))
        parent = require_record(db, parent_model, data[parent_key])
        siblings = select(func.coalesce(func.sum(model.capacity), 0)).where(
            getattr(model, parent_key) == parent.id
        )
        if existing:
            siblings = siblings.where(model.id != existing.id)
            if getattr(existing, parent_key) != data[parent_key]:
                raise HTTPException(409, "group_parent_immutable")
        if data["capacity"] + db.scalar(siblings) > parent.capacity:
            raise HTTPException(422, "subgroup_capacity")
    if resource == "groups" and existing and db.scalar(lab_capacity(existing.id)) > data["capacity"]:
        raise HTTPException(422, "subgroup_capacity")
    if resource in {"groups", "subgroups"} and existing:
        child_model, child_key = (
            (m.SmallGroup, "course_group_id")
            if resource == "groups"
            else (m.LabGroup, "small_group_id")
        )
        total = db.scalar(
            select(func.coalesce(func.sum(child_model.capacity), 0)).where(
                getattr(child_model, child_key) == existing.id
            )
        )
        if total > data["capacity"]:
            raise HTTPException(422, "subgroup_capacity")
    if resource == "availability" and data["teacher_id"]:
        if require_record(db, m.Account, data["teacher_id"]).role != LECTURER:
            raise HTTPException(422, "lecturer_required")
    if resource in {"periods", "extra-permissions", "holidays"}:
        term = require_record(db, m.Term, data["term_id"])
        start, end = (
            data.get("starts_on", data.get("day")),
            data.get("ends_on", data.get("day")),
        )
        if not term.starts_on <= start <= end <= term.ends_on:
            raise HTTPException(422, "outside_term")
    if resource == "workloads":
        term = require_record(db, m.Term, data["term_id"])
        calendar = require_record(db, m.CalendarConfig, term.calendar_id)
        group = require_record(db, m.CourseGroup, data["course_group_id"])
        major = require_record(db, m.Major, group.major_id)
        if major.study_form != calendar.study_form:
            raise HTTPException(422, "study_form_mismatch")
        if data["lesson_type"] == "pe":
            errors = pe_workload_errors(
                data, serialize(group, db), serialize(term, db), serialize(calendar, db)
            )
            if errors:
                raise HTTPException(422, errors[0])
            duplicate = select(m.Workload.id).where(
                m.Workload.term_id == term.id,
                m.Workload.course_group_id == group.id,
                m.Workload.lesson_type == "pe",
            )
            if existing:
                duplicate = duplicate.where(m.Workload.id != existing.id)
            if db.scalar(duplicate.limit(1)):
                raise HTTPException(422, "pe_already_exists")
        else:
            if data["teacher_id"] is None:
                raise HTTPException(422, "lecturer_required")
            teacher = require_record(db, m.Account, data["teacher_id"])
            if teacher.role != LECTURER or not teacher.is_active:
                raise HTTPException(422, "lecturer_required")
        units = calendar.academic_hours_per_lesson
        if units and data["semester_hours"] % units:
            raise HTTPException(422, "indivisible_workload")
        # Identity is stable after occurrences exist. Explicit curriculum revision is needed.
        if existing and db.scalar(
            select(m.Occurrence.id)
            .where(m.Occurrence.component_id == existing.id)
            .limit(1)
        ):
            if any(getattr(existing, key) != value for key, value in data.items()):
                raise HTTPException(409, "workload_has_occurrences")


@router.get("/catalog/{resource}")
def list_records(resource: str, db: Session = Depends(get_db)):
    model, _ = resource_type(resource)
    return [serialize(row, db) for row in db.scalars(select(model).order_by(model.id))]


@router.post("/catalog/{resource}", status_code=201)
def create_record(
    resource: str,
    body: dict,
    db: Session = Depends(get_db),
    actor: m.Account = Depends(administrator),
):
    return save_record(resource, body, db, actor)


@router.put("/catalog/{resource}/{identifier}")
def update_record(
    resource: str,
    identifier: int,
    body: dict,
    db: Session = Depends(get_db),
    actor: m.Account = Depends(administrator),
):
    return save_record(resource, body, db, actor, identifier)


def save_record(resource, body, db, actor, identifier=None):
    model, schema = resource_type(resource)
    try:
        data = schema.model_validate(body).model_dump()
    except ValidationError as error:
        raise HTTPException(
            422,
            jsonable_encoder(error.errors(include_context=False, include_input=False)),
        ) from None
    lock_revision(db)
    existing = require_record(db, model, identifier) if identifier else None
    before = serialize(existing, db) if existing else {}
    validate_domain(db, resource, data, existing, actor)
    equipment = data.pop("equipment_ids") if resource == "rooms" else None
    row = existing or model()
    for key, value in data.items():
        setattr(row, key, value)
    db.add(row)
    db.flush()
    if equipment is not None:
        db.execute(delete(m.RoomEquipment).where(m.RoomEquipment.room_id == row.id))
        db.add_all(
            m.RoomEquipment(room_id=row.id, equipment_type_id=identifier, quantity=1)
            for identifier in equipment
        )
    record_audit(db, actor, "catalog.updated" if existing else "catalog.created", resource,
                 row.id, before=before, after=serialize(row, db))
    db.commit()
    return serialize(row, db)


@router.delete("/catalog/{resource}/{identifier}", status_code=204)
def delete_record(resource: str, identifier: int, db: Session = Depends(get_db),
                  actor: m.Account = Depends(administrator)):
    model, _ = resource_type(resource)
    if resource == "users":
        raise HTTPException(409, "deactivate_account_instead")
    lock_revision(db)
    row = require_record(db, model, identifier)
    if resource == "equipment" and any(
        identifier in equipment_ids
        for equipment_ids in db.scalars(select(m.Workload.equipment_ids))
    ):
        # Workload requirements are JSON, so the database cannot enforce this FK.
        raise HTTPException(409, "equipment_has_workload")
    record_audit(db, actor, "catalog.deleted", resource, identifier, before=serialize(row, db))
    if resource == "rooms":
        db.execute(delete(m.RoomEquipment).where(m.RoomEquipment.room_id == identifier))
    db.delete(row)
    db.commit()
