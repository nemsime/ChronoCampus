import csv
import re
from collections import Counter, defaultdict
from collections.abc import Collection
from io import StringIO

from fastapi import HTTPException
from sqlalchemy import select, true
from sqlalchemy.orm import Session

from app.accounts.distribution import distribute_students, normalized_name
from app.accounts.roles import DEAN, STUDENT
from app.accounts.roster_models import StudentEnrollment, StudentRoster, StudentTransfer
from app.db.models import (
    Account,
    CalendarConfig,
    CourseGroup,
    LabGroup,
    Major,
    SmallGroup,
    Term,
)
from app.db.session import lock_revision
from app.db.utc import utc_now


def _valid_official_email(email: str, domains: Collection[str]) -> bool:
    local, _, domain = email.lower().partition("@")
    return (
        email.isascii()
        and len(email) <= 255
        and len(local) <= 64
        and domain in domains
        and re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_{}|~\x60-]+", local) is not None
        and not (local.startswith(".") or local.endswith(".") or ".." in local)
    )


def scoped_courses(actor: Account):
    query = select(CourseGroup).join(Major)
    if actor.role == DEAN and actor.faculty_id is not None:
        query = query.where(Major.faculty_id == actor.faculty_id)
    return query


def ensure_course_scope(db: Session, actor: Account, course_id: int) -> None:
    if db.scalar(scoped_courses(actor).where(CourseGroup.id == course_id)) is None:
        raise HTTPException(403, "forbidden")


def _latest_term(db: Session, course_id: int) -> int | None:
    return db.scalar(
        select(Term.id)
        .where(
            select(StudentRoster.id)
            .where(
                StudentRoster.term_id == Term.id,
                StudentRoster.course_group_id == course_id,
            )
            .exists()
        )
        .order_by(Term.starts_on.desc(), Term.id.desc())
        .limit(1)
    )


def _name_key(row) -> tuple[str, str, str]:
    return (
        normalized_name(row.surname),
        normalized_name(row.given_name),
        normalized_name(row.patronymic),
    )


def _matching_roster(db: Session, enrollment: StudentEnrollment) -> list[StudentRoster]:
    term_id = _latest_term(db, enrollment.course_group_id)
    if term_id is None:
        return []
    surname, given_name, patronymic = _name_key(enrollment)
    roster = db.scalars(
        select(StudentRoster).where(
            StudentRoster.term_id == term_id,
            StudentRoster.course_group_id == enrollment.course_group_id,
        )
    )
    return [
        row
        for row in roster
        if (name := _name_key(row))[:2] == (surname, given_name)
        and (not name[2] or name[2] == patronymic)
    ]


def _assigned(db: Session, roster: StudentRoster) -> bool:
    return (
        db.scalar(
            select(StudentEnrollment.account_id).where(
                StudentEnrollment.roster_id == roster.id
            )
        )
        is not None
    )


def _apply_membership(
    db: Session,
    account: Account,
    enrollment: StudentEnrollment,
    subgroup: SmallGroup,
) -> None:
    lab = (
        db.get(LabGroup, account.lab_group_id)
        if account.lab_group_id is not None
        else None
    )
    if lab is not None and (
        (lab.small_group_id is not None and lab.small_group_id != subgroup.id)
        or (
            lab.small_group_id is None
            and lab.course_group_id != enrollment.course_group_id
        )
    ):
        account.lab_group_id = None
    account.course_group_id = enrollment.course_group_id
    account.small_group_id = subgroup.id
    enrollment.confirmed = True


def stage_enrollment(
    db: Session,
    account: Account,
    *,
    course_group_id: int,
    surname: str,
    given_name: str,
    patronymic: str | None,
) -> None:
    db.add(
        StudentEnrollment(
            account_id=account.id,
            course_group_id=course_group_id,
            surname=surname,
            given_name=given_name,
            patronymic=patronymic,
        )
    )


def confirm_enrollment(db: Session, account: Account) -> None:
    if not account.email_verified or account.role != STUDENT:
        return
    enrollment = db.get(StudentEnrollment, account.id)
    if enrollment is None or enrollment.confirmed:
        return
    candidates = _matching_roster(db, enrollment)
    if len(candidates) != 1:
        return
    row = candidates[0]
    if not row.email or row.email != account.email.lower() or _assigned(db, row):
        return
    subgroup = db.get(SmallGroup, row.small_group_id)
    if subgroup is None or subgroup.course_group_id != row.course_group_id:
        return
    if (
        _available_seats(
            db, subgroup, row.term_id, subgroup.capacity, {account.id}, {row.id}
        )
        <= 0
    ):
        return
    enrollment.roster_id = row.id
    _apply_membership(db, account, enrollment, subgroup)


def _read_csv(content: str) -> tuple[list[tuple[int, dict]], list[dict]]:
    required = {"group_code", "surname", "given_name"}
    supported = required | {"patronymic", "email"}
    rows: list[tuple[int, dict]] = []
    errors: list[dict] = []
    reader = csv.DictReader(
        StringIO(content.removeprefix("\ufeff"), newline=""), strict=True
    )
    try:
        headers = [header.strip().lower() for header in (reader.fieldnames or [])]
        if not required <= set(headers) <= supported or len(set(headers)) != len(
            headers
        ):
            return [], [{"line": 1, "code": "roster_invalid_header"}]
        reader.fieldnames = headers
        for values in reader:
            if None in values or any(values.get(field) is None for field in required):
                errors.append({"line": reader.line_num, "code": "roster_invalid_csv"})
            else:
                rows.append((reader.line_num, values))
    except csv.Error:
        errors.append({"line": max(1, reader.line_num), "code": "roster_invalid_csv"})
    return rows, errors


def _active_enrollments():
    return (
        select(Account.id, Account.small_group_id, StudentEnrollment.roster_id)
        .join(StudentEnrollment, StudentEnrollment.account_id == Account.id)
        .where(
            StudentEnrollment.confirmed == true(),
            Account.course_group_id == StudentEnrollment.course_group_id,
            Account.role == STUDENT,
            Account.is_active == true(),
        )
    )


def _plan_groups(
    db: Session,
    course: CourseGroup,
    size: int,
    existing: list[StudentRoster],
    incoming: list[StudentRoster],
):
    # Preserve existing subgroup IDs and capacities referenced by scheduling and accounts.
    distribution = distribute_students([*existing, *incoming], size)
    groups = db.scalars(
        select(SmallGroup)
        .where(SmallGroup.course_group_id == course.id)
        .order_by(SmallGroup.id)
    ).all()
    labels = {group.label.casefold() for group in groups}
    steps = []
    label_number = 1
    roster_ids = {row.id for row in existing}
    additional = Counter(
        subgroup_id
        for _, subgroup_id, roster_id in db.execute(
            _active_enrollments().where(StudentEnrollment.course_group_id == course.id)
        )
        if roster_id not in roster_ids
    )
    if len(existing) + len(incoming) + sum(additional.values()) > course.capacity:
        return [], "roster_capacity_conflict"
    if existing:
        claimed = set(
            db.scalars(
                select(StudentEnrollment.roster_id).where(
                    StudentEnrollment.roster_id.in_(row.id for row in existing)
                )
            )
        )
    else:
        claimed = set()
    for index, students in enumerate(distribution):
        if index < len(groups):
            group = groups[index]
            if len(students) + additional[group.id] > min(group.capacity, size):
                return [], "roster_capacity_conflict"
        else:
            while f"p{label_number}" in labels:
                label_number += 1
            group = SmallGroup(
                course_group_id=course.id, label=f"P{label_number}", capacity=size
            )
            label_number += 1
        if any(
            row.id in claimed and row.small_group_id != group.id for row in students
        ):
            return [], "roster_import_locked"
        steps.append((group, students))
    return steps, None


def import_roster(
    db: Session,
    actor: Account,
    term_id: int,
    content: str,
    max_size: int,
    domains: Collection[str],
) -> dict:
    raw_rows, errors = _read_csv(content)
    term = db.get(Term, term_id)
    if term is None:
        raise HTTPException(404, "invalid_reference")
    form = db.get(CalendarConfig, term.calendar_id).study_form
    courses = {course.group_code: course for course in db.scalars(select(CourseGroup))}
    allowed = {course.id for course in db.scalars(scoped_courses(actor))}
    compatible = set(
        db.scalars(select(CourseGroup.id).join(Major).where(Major.study_form == form))
    )
    official_domains = {domain.lower() for domain in domains}
    existing = defaultdict(list)
    imported = defaultdict(list)
    signatures = set()
    emails = set()
    names = defaultdict(list)
    lines: dict[StudentRoster, int] = {}
    for row in db.scalars(
        select(StudentRoster)
        .where(StudentRoster.term_id == term_id)
        .order_by(StudentRoster.id)
    ):
        existing[row.course_group_id].append(row)
        key = (row.course_group_id, *_name_key(row))
        names[key].append(0)
        signatures.add((*key, row.email))
        if row.email:
            emails.add(row.email)

    for line, values in raw_rows:
        course = courses.get(values["group_code"].strip())
        surname = " ".join(values["surname"].split())
        given_name = " ".join(values["given_name"].split())
        patronymic = " ".join((values.get("patronymic") or "").split()) or None
        email = (values.get("email") or "").strip() or None
        if course is None:
            code = "roster_unknown_group"
        elif course.id not in allowed:
            code = "roster_forbidden_group"
        elif course.id not in compatible:
            code = "roster_wrong_study_form"
        elif (
            not surname
            or not given_name
            or max(len(surname), len(given_name), len(patronymic or "")) > 100
        ):
            code = "roster_invalid_name"
        elif email and not _valid_official_email(email, official_domains):
            code = "roster_invalid_email"
        else:
            email = email.lower() if email else None
            row = StudentRoster(
                term_id=term_id,
                course_group_id=course.id,
                surname=surname,
                given_name=given_name,
                patronymic=patronymic,
                email=email,
            )
            key = (course.id, *_name_key(row))
            signature = (*key, email)
            if signature in signatures:
                code = "roster_duplicate_row"
            elif email and email in emails:
                code = "roster_duplicate_email"
            else:
                signatures.add(signature)
                if email:
                    emails.add(email)
                names[key].append(line)
                imported[course].append(row)
                lines[row] = line
                continue
        errors.append({"line": line, "code": code})

    warnings = [
        {"line": line, "code": "roster_duplicate_name"}
        for occurrences in names.values()
        if len(occurrences) > 1
        for line in occurrences
        if line
    ]
    planned = []
    if not errors:
        for course, incoming in imported.items():
            groups, error = _plan_groups(
                db, course, max_size, existing[course.id], incoming
            )
            if error:
                errors.append({"line": lines[incoming[0]], "code": error})
            planned.extend(groups)
    if not errors:
        new_groups = [group for group, _ in planned if group.id is None]
        if new_groups:
            lock_revision(db)
            db.add_all(new_groups)
            db.flush()
        for group, students in planned:
            for row in students:
                row.small_group_id = group.id
                db.add(row)
    return {
        "imported": 0 if errors else len(lines),
        "errors": sorted(errors, key=lambda issue: issue["line"]),
        "warnings": sorted(warnings, key=lambda issue: issue["line"]),
    }


def enrollment_confirmed(
    account: Account, enrollment: StudentEnrollment | None
) -> bool:
    return bool(
        enrollment
        and enrollment.confirmed
        and account.course_group_id == enrollment.course_group_id
    )


def get_subgroup(db: Session, subgroup_id: int, course_id: int) -> SmallGroup:
    subgroup = db.get(SmallGroup, subgroup_id)
    if subgroup is None or subgroup.course_group_id != course_id:
        raise HTTPException(400, "invalid_subgroup")
    return subgroup


def _available_seats(
    db: Session,
    subgroup: SmallGroup,
    term_id: int | None,
    max_size: int,
    excluded_accounts: set[int],
    excluded_roster: set[int],
) -> int:
    return min(subgroup.capacity, max_size) - _occupied_seats(
        db,
        subgroup.course_group_id,
        term_id,
        subgroup.id,
        excluded_accounts,
        excluded_roster,
    )


def _occupied_seats(
    db: Session,
    course_id: int,
    term_id: int | None,
    subgroup_id: int | None,
    excluded_accounts: set[int],
    excluded_roster: set[int],
) -> int:
    enrollment_query = _active_enrollments().where(
        StudentEnrollment.course_group_id == course_id
    )
    reservation_query = (
        select(StudentRoster.id, StudentEnrollment.account_id)
        .outerjoin(StudentEnrollment, StudentEnrollment.roster_id == StudentRoster.id)
        .where(
            StudentRoster.term_id == term_id, StudentRoster.course_group_id == course_id
        )
    )
    if subgroup_id is not None:
        enrollment_query = enrollment_query.where(Account.small_group_id == subgroup_id)
        reservation_query = reservation_query.where(
            StudentRoster.small_group_id == subgroup_id
        )
    accounts = {
        account_id
        for account_id, _, _ in db.execute(enrollment_query)
        if account_id not in excluded_accounts
    }
    return len(accounts) + sum(
        row_id not in excluded_roster and account_id not in accounts
        for row_id, account_id in db.execute(reservation_query)
    )


def approve_enrollment(
    db: Session,
    actor: Account,
    account_id: int,
    subgroup_id: int,
    max_size: int,
) -> StudentEnrollment:
    enrollment = db.get(StudentEnrollment, account_id)
    if enrollment is None:
        raise HTTPException(404, "enrollment_not_pending")
    ensure_course_scope(db, actor, enrollment.course_group_id)
    account = db.get(Account, account_id)
    if (
        enrollment.confirmed
        or not account.is_active
        or not account.email_verified
        or account.role != STUDENT
    ):
        raise HTTPException(409, "enrollment_not_pending")
    group = get_subgroup(db, subgroup_id, enrollment.course_group_id)
    identified = [
        row
        for row in _matching_roster(db, enrollment)
        if (row.email is None or row.email == account.email.lower())
        and not _assigned(db, row)
    ]
    email_match = next((row for row in identified if row.email is not None), None)
    row = email_match or (identified[0] if len(identified) == 1 else None)
    term_id = _latest_term(db, enrollment.course_group_id)
    if row is None:
        course = db.get(CourseGroup, enrollment.course_group_id)
        if (
            _occupied_seats(db, course.id, term_id, None, {account_id}, set())
            >= course.capacity
        ):
            raise HTTPException(409, "subgroup_full")
    if (
        _available_seats(
            db,
            group,
            term_id,
            max_size,
            {account_id},
            {row.id} if row else set(),
        )
        <= 0
    ):
        raise HTTPException(409, "subgroup_full")
    if row is not None:
        enrollment.roster_id = row.id
        row.small_group_id = group.id
    _apply_membership(db, account, enrollment, group)
    return enrollment


def request_transfer(
    db: Session, student: Account, subgroup_id: int, reason: str
) -> StudentTransfer:
    enrollment = db.get(StudentEnrollment, student.id)
    if (
        not enrollment_confirmed(student, enrollment)
        or student.small_group_id is None
        or not student.is_active
        or not student.email_verified
        or student.role != STUDENT
    ):
        raise HTTPException(409, "group_not_confirmed")
    get_subgroup(db, subgroup_id, enrollment.course_group_id)
    if subgroup_id == student.small_group_id:
        raise HTTPException(400, "invalid_subgroup")
    pending = db.scalar(
        select(StudentTransfer.id).where(
            StudentTransfer.account_id == student.id,
            StudentTransfer.status == "pending",
        )
    )
    if pending is not None:
        raise HTTPException(409, "transfer_already_pending")
    transfer = StudentTransfer(
        account_id=student.id,
        from_group_id=student.small_group_id,
        target_group_id=subgroup_id,
        reason=reason,
    )
    db.add(transfer)
    db.flush()
    return transfer


def decide_transfers(
    db: Session,
    dean: Account,
    ids: list[int],
    approve: bool,
    max_size: int,
) -> list[StudentTransfer]:
    transfers = {
        row.id: row
        for row in db.scalars(
            select(StudentTransfer).where(StudentTransfer.id.in_(ids))
        )
    }
    if len(transfers) != len(ids) or any(
        row.status != "pending" for row in transfers.values()
    ):
        raise HTTPException(404, "transfer_not_found")
    changes = []
    for transfer in transfers.values():
        enrollment = db.get(StudentEnrollment, transfer.account_id)
        ensure_course_scope(db, dean, enrollment.course_group_id)
        if approve:
            student = db.get(Account, transfer.account_id)
            if (
                not enrollment_confirmed(student, enrollment)
                or student.small_group_id != transfer.from_group_id
                or not student.is_active
                or not student.email_verified
                or student.role != STUDENT
            ):
                raise HTTPException(409, "transfer_outdated")
            target = get_subgroup(
                db, transfer.target_group_id, enrollment.course_group_id
            )
            changes.append((student, enrollment, target))

    # Check capacity against the final batch so students can swap the last seats.
    excluded_accounts = {student.id for student, _, _ in changes}
    excluded_roster = {
        enrollment.roster_id
        for _, enrollment, _ in changes
        if enrollment.roster_id is not None
    }
    for target, additions in Counter(target for _, _, target in changes).items():
        if (
            _available_seats(
                db,
                target,
                _latest_term(db, target.course_group_id),
                max_size,
                excluded_accounts,
                excluded_roster,
            )
            < additions
        ):
            raise HTTPException(409, "subgroup_full")
    for student, enrollment, target in changes:
        _apply_membership(db, student, enrollment, target)
        if enrollment.roster_id is not None:
            db.get(StudentRoster, enrollment.roster_id).small_group_id = target.id

    now = utc_now()
    for transfer in transfers.values():
        transfer.status = "approved" if approve else "rejected"
        transfer.decided_at = now
        transfer.decided_by = dean.id
    return list(transfers.values())
