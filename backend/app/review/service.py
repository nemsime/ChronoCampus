"""Shared review policy and explicit, privacy-safe response projections."""


from fastapi import HTTPException
from sqlalchemy import and_, case, func, or_, select

from app.accounts.roles import ADMIN, DEAN
from app.calendar.rules import lesson_slot, parity
from app.db import models as m
from app.db.utc import utc_now
from app.observability.audit import record_audit
from app.review.schemas import SuggestionInput
from app.scheduling import queries as q
from app.scheduling.snapshot import record


def require_reader(scope):
    if scope["role"] not in {ADMIN, DEAN}:
        raise HTTPException(403, "forbidden", headers=q.PRIVATE)


def account_scope(account):
    return {key: getattr(account, key) for key in (
        "id", "role", "faculty_id", "course_group_id", "small_group_id", "lab_group_id"
    )}


def scope_groups(db, scope):
    """Return allowed cohort IDs; None means university-wide access."""
    require_reader(scope)
    if scope["role"] == ADMIN or scope.get("faculty_id") is None:
        return None
    return set(db.scalars(
        select(m.CourseGroup.id).join(m.Major).where(m.Major.faculty_id == scope["faculty_id"])
    ))


def visible_versions(db, scope, status=None):
    groups = scope_groups(db, scope)
    statement = select(m.ScheduleVersion).order_by(m.ScheduleVersion.id.desc())
    if status is not None:
        statement = statement.where(m.ScheduleVersion.status == status)
    return [version for version in db.scalars(statement.execution_options(populate_existing=True))
            if version.cohort_ids and (groups is None or groups.intersection(version.cohort_ids))]


def require_version(db, identifier, scope):
    version = db.get(m.ScheduleVersion, identifier, populate_existing=True)
    groups = scope_groups(db, scope)
    if not version or not version.cohort_ids or (
        groups is not None and not groups.intersection(version.cohort_ids)
    ):
        raise HTTPException(404, "version_not_found", headers=q.PRIVATE)
    return version


def version_view(db, version, scope):
    groups = scope_groups(db, scope)
    cohorts = [identifier for identifier in version.cohort_ids
               if groups is None or identifier in groups]
    term = db.get(m.Term, version.term_id)
    report = version.report or {}
    # A mixed-faculty version must not expose identifiers or totals for other faculties.
    component_ids = set(db.scalars(select(m.Workload.id).where(
        m.Workload.term_id == version.term_id, m.Workload.course_group_id.in_(cohorts)
    )))
    occurrence_ids = set(db.scalars(select(m.Occurrence.id).where(
        m.Occurrence.component_id.in_(component_ids)
    )))
    hours = [row for row in report.get("hours", []) if row.get("component_id") in component_ids]
    issues = [row for row in report.get("issues", [])
              if ("occurrence_id" not in row or row["occurrence_id"] in occurrence_ids)
              and ("course_group_id" not in row or row["course_group_id"] in cohorts)]
    unresolved = len([identifier for identifier in report.get("unplaced_occurrences", [])
                      if identifier in occurrence_ids])
    summary = {
        "complete": bool(report.get("complete")) if len(cohorts) == len(version.cohort_ids)
        else bool(hours) and not issues and not unresolved
        and all(row.get("remaining_hours") == 0 for row in hours),
        "required_hours": sum(row.get("required_hours", 0) for row in hours),
        "remaining_hours": sum(row.get("remaining_hours", 0) for row in hours),
        "unresolved": unresolved,
    }
    return {key: getattr(version, key) for key in (
        "id", "name", "status", "term_id", "revision", "published_at"
    )} | {"term": term.name, "starts_on": term.starts_on, "ends_on": term.ends_on,
         "cohort_ids": cohorts, "summary": summary}


def lesson_rows(db, scope, values, version_id=None, occurrence_ids=None):
    statement = q.selection(scope, values, version_id=version_id)
    if occurrence_ids is not None:
        statement = statement.where(m.Assignment.occurrence_id.in_(occurrence_ids))
    result = []
    for row in db.execute(statement).mappings():
        item = dict(row)
        config = item.pop("configuration") or {}
        start = config.get("term", {}).get("starts_on") or item.pop("starts_on")
        item.pop("starts_on", None)
        item["parity"] = parity(start, item["day"])
        result.append(item)
    return result


def version_diff(db, scope, version, base, limit, offset):
    groups = scope_groups(db, scope)
    cohorts = [identifier for identifier in version.cohort_ids
               if groups is None or identifier in groups]
    values = {"term_id": version.term_id, "_cohort_ids": cohorts}
    base_id = None
    if base != "published":
        try:
            base_id = int(base)
        except (ValueError, TypeError):
            raise HTTPException(422, "invalid_reference", headers=q.PRIVATE) from None
        previous = require_version(db, base_id, scope)
        if previous.term_id != version.term_id:
            raise HTTPException(422, "invalid_reference", headers=q.PRIVATE)
    fields = (q.A.c.occurrence_id, q.A.c.day, q.A.c.slot, q.A.c.room_id, q.A.c.cancelled)
    before = q.selection(scope, values, version_id=base_id).with_only_columns(*fields).where(
        q.W.c.course_group_id.in_(cohorts)
    ).subquery("before")
    after = q.selection(scope, values, version_id=version.id).with_only_columns(*fields).subquery("after")
    keys = select(before.c.occurrence_id).union(select(after.c.occurrence_id)).subquery("keys")
    joined = keys.outerjoin(before, keys.c.occurrence_id == before.c.occurrence_id).outerjoin(
        after, keys.c.occurrence_id == after.c.occurrence_id
    )
    both = and_(before.c.occurrence_id.is_not(None), after.c.occurrence_id.is_not(None))
    predicates = {
        "added": before.c.occurrence_id.is_(None),
        "removed": after.c.occurrence_id.is_(None),
        "moved": and_(both, or_(before.c.day != after.c.day, before.c.slot != after.c.slot)),
        "room_changed": and_(both, before.c.room_id != after.c.room_id),
        "cancelled_changed": and_(both, before.c.cancelled != after.c.cancelled),
    }
    changed = or_(*predicates.values())
    totals = db.execute(select(
        func.count().label("total"),
        *(func.coalesce(func.sum(case((predicate, 1), else_=0)), 0).label(kind)
          for kind, predicate in predicates.items())
    ).select_from(joined).where(changed)).mappings().one()
    identifiers = list(db.scalars(select(keys.c.occurrence_id).select_from(joined).where(changed)
                                 .order_by(keys.c.occurrence_id).offset(offset).limit(limit)))
    prior_rows = {row["occurrence_id"]: row for row in lesson_rows(
        db, scope, values, base_id, identifiers
    ) if row["course_group_id"] in cohorts}
    next_rows = {row["occurrence_id"]: row for row in lesson_rows(
        db, scope, values, version.id, identifiers
    )}
    items = []
    for identifier in identifiers:
        prior, current = prior_rows.get(identifier), next_rows.get(identifier)
        kinds = []
        if prior is None:
            kinds.append("added")
        elif current is None:
            kinds.append("removed")
        else:
            if (prior["day"], prior["slot"]) != (current["day"], current["slot"]):
                kinds.append("moved")
            if prior["room_id"] != current["room_id"]:
                kinds.append("room_changed")
            if prior["cancelled"] != current["cancelled"]:
                kinds.append("cancelled_changed")
        items.append({"occurrence_id": identifier, "changes": kinds, "before": prior, "after": current})
    if base_id is not None and db.scalar(select(m.ScheduleVersion.revision).where(
        m.ScheduleVersion.id == base_id
    )) != previous.revision:
        raise HTTPException(409, "schedule_changed", headers=q.PRIVATE)
    return {"items": items, "total": totals["total"], "limit": limit, "offset": offset,
            "counts": {kind: totals[kind] for kind in predicates}}


def require_suggestion(db, identifier, actor, *, own=False):
    suggestion = db.get(m.ScheduleSuggestion, identifier, populate_existing=True)
    if not suggestion or (own and suggestion.author_id != actor.id):
        raise HTTPException(404, "suggestion_not_found", headers=q.PRIVATE)
    if own:
        scope = account_scope(actor)
        groups = scope_groups(db, scope)
        if groups is not None and suggestion.course_group_id is not None and suggestion.course_group_id not in groups:
            raise HTTPException(404, "suggestion_not_found", headers=q.PRIVATE)
        try:
            require_version(db, suggestion.version_id, scope)
        except HTTPException as error:
            if error.status_code == 404:
                raise HTTPException(404, "suggestion_not_found", headers=q.PRIVATE) from None
            raise
    return suggestion


def suggestion_view(db, suggestion, *, comments=False):
    result = record(suggestion)
    version = db.get(m.ScheduleVersion, suggestion.version_id)
    result["author"] = db.scalar(select(m.Account.display_name).where(m.Account.id == suggestion.author_id))
    result["author_role"] = db.scalar(select(m.Account.role).where(m.Account.id == suggestion.author_id))
    result["version_name"] = version.name
    assignment = None
    if suggestion.occurrence_id is not None:
        assignment = db.scalar(select(m.Assignment).where(
            m.Assignment.version_id == suggestion.version_id,
            m.Assignment.occurrence_id == suggestion.occurrence_id
        ))
    result["outdated"] = bool(suggestion.occurrence_id is not None and (
        assignment is None or suggestion.anchor != {
            "day": assignment.day.isoformat(), "slot": assignment.slot, "room_id": assignment.room_id
        }
    ))
    if result["author_role"] == "lecturer" and suggestion.status in {"open", "accepted"}:
        occurrence = db.get(m.Occurrence, suggestion.occurrence_id)
        workload = db.get(m.Workload, occurrence.component_id) if occurrence else None
        pointer = db.get(m.PublishedGroup, (workload.term_id, workload.course_group_id)) if workload else None
        result["outdated"] = result["outdated"] or not pointer or pointer.version_id != suggestion.version_id or workload.teacher_id != suggestion.author_id
        result["outdated"] = bool(result["outdated"])
    if comments:
        result["comments"] = [
            {**record(comment), "author": author}
            for comment, author in db.execute(select(m.SuggestionComment, m.Account.display_name)
                .join(m.Account, m.Account.id == m.SuggestionComment.author_id)
                .where(m.SuggestionComment.suggestion_id == suggestion.id)
                .order_by(m.SuggestionComment.id))
        ]
    return result


def suggestions_page(db, actor, *, own, status=None, version_id=None, author_id=None,
                     course_group_id=None, limit=20, offset=0):
    statement = select(m.ScheduleSuggestion)
    if own:
        scope = account_scope(actor)
        groups = scope_groups(db, scope)
        statement = statement.where(m.ScheduleSuggestion.author_id == actor.id,
            m.ScheduleSuggestion.version_id.in_([v.id for v in visible_versions(db, scope)]))
        if groups is not None:
            statement = statement.where(or_(m.ScheduleSuggestion.course_group_id.is_(None),
                                            m.ScheduleSuggestion.course_group_id.in_(groups)))
    for key, value in (("version_id", version_id), ("author_id", author_id),
                       ("course_group_id", course_group_id)):
        if value is not None:
            statement = statement.where(getattr(m.ScheduleSuggestion, key) == value)
    counts = dict(db.execute(select(m.ScheduleSuggestion.status, func.count())
        .where(m.ScheduleSuggestion.id.in_(statement.with_only_columns(m.ScheduleSuggestion.id)))
        .group_by(m.ScheduleSuggestion.status)).all())
    if status is not None:
        statement = statement.where(m.ScheduleSuggestion.status == status)
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    rows = db.scalars(statement.order_by(m.ScheduleSuggestion.id.desc()).offset(offset).limit(limit))
    return {"items": [suggestion_view(db, row) for row in rows], "total": total,
            "limit": limit, "offset": offset,
            "counts": {key: counts.get(key, 0) for key in (
                "open", "accepted", "rejected", "implemented", "withdrawn"
            )}}


def validate_proposal(db, body: SuggestionInput, actor):
    scope = account_scope(actor)
    version = require_version(db, body.version_id, scope)
    groups = scope_groups(db, scope)
    assignment = None
    cohort = body.course_group_id
    proposed = (body.proposed_day, body.proposed_slot, body.proposed_room_id)
    invalid = (
        (body.kind == "move" and (body.occurrence_id is None or None in proposed[:2]))
        or (body.kind == "room" and (body.occurrence_id is None or body.proposed_room_id is None
                                    or any(value is not None for value in proposed[:2])))
        or (body.kind == "cancel" and (body.occurrence_id is None
                                      or any(value is not None for value in proposed)))
        or (body.kind == "other" and (body.occurrence_id is not None
                                     or any(value is not None for value in proposed)))
    )
    if invalid:
        raise HTTPException(422, "invalid_proposal", headers=q.PRIVATE)
    if body.occurrence_id is not None:
        row = db.execute(select(m.Assignment, m.Workload)
            .join(m.Occurrence, m.Occurrence.id == m.Assignment.occurrence_id)
            .join(m.Workload, m.Workload.id == m.Occurrence.component_id)
            .where(m.Assignment.version_id == version.id,
                   m.Assignment.occurrence_id == body.occurrence_id,
                   m.Workload.term_id == version.term_id,
                   m.Workload.course_group_id.in_(version.cohort_ids))).first()
        if row is None:
            raise HTTPException(404, "lesson_not_found", headers=q.PRIVATE)
        assignment, component = row
        if groups is not None and component.course_group_id not in groups:
            raise HTTPException(403, "outside_faculty_scope", headers=q.PRIVATE)
        if cohort is not None and cohort != component.course_group_id:
            raise HTTPException(422, "invalid_proposal", headers=q.PRIVATE)
        cohort = component.course_group_id
    elif cohort is not None:
        if cohort not in version.cohort_ids or db.get(m.CourseGroup, cohort) is None:
            raise HTTPException(404, "lesson_not_found", headers=q.PRIVATE)
        if groups is not None and cohort not in groups:
            raise HTTPException(403, "outside_faculty_scope", headers=q.PRIVATE)
    if body.proposed_room_id is not None and db.get(m.Room, body.proposed_room_id) is None:
        raise HTTPException(422, "invalid_proposal", headers=q.PRIVATE)
    if body.kind == "move":
        term = db.get(m.Term, version.term_id)
        config = (version.configuration or {}).get("calendar")
        if not config:
            config = record(db.get(m.CalendarConfig, term.calendar_id))
        try:
            lesson_slot(config, body.proposed_slot)
        except ValueError:
            raise HTTPException(422, "invalid_proposal", headers=q.PRIVATE) from None
        if not term.starts_on <= body.proposed_day <= term.ends_on:
            raise HTTPException(422, "invalid_proposal", headers=q.PRIVATE)
    return version, assignment, cohort


def add_suggestion(db, body, actor):
    if db.scalar(select(func.count()).select_from(m.ScheduleSuggestion).where(
        m.ScheduleSuggestion.author_id == actor.id, m.ScheduleSuggestion.status == "open"
    )) >= 50:
        raise HTTPException(409, "suggestion_limit", headers=q.PRIVATE)
    version, assignment, cohort = validate_proposal(db, body, actor)
    values = body.model_dump(exclude={"course_group_id"})
    suggestion = m.ScheduleSuggestion(**values, author_id=actor.id,
        course_group_id=cohort, base_revision=version.revision,
        anchor={"day": assignment.day.isoformat(), "slot": assignment.slot, "room_id": assignment.room_id}
        if assignment is not None else {}, status="open")
    db.add(suggestion)
    db.flush()
    record_audit(db, actor, "suggestion.created", "suggestions", suggestion.id,
                 after=record(suggestion))
    return suggestion


def transition(db, suggestion, actor, expected, status, *, note=None, version_id=None):
    if suggestion.status != expected:
        raise HTTPException(409, "suggestion_state_changed", headers=q.PRIVATE)
    allowed = {"open": {"accepted", "rejected", "withdrawn"},
               "accepted": {"implemented", "rejected"}}
    if status not in allowed.get(suggestion.status, set()):
        raise HTTPException(409, "suggestion_closed", headers=q.PRIVATE)
    if status == "rejected" and not note:
        raise HTTPException(422, "invalid_proposal", headers=q.PRIVATE)
    before = {"status": suggestion.status}
    if status == "implemented":
        if db.get(m.ScheduleVersion, version_id) is None:
            raise HTTPException(404, "version_not_found", headers=q.PRIVATE)
        suggestion.implemented_in_version_id = version_id
    if status != "withdrawn":
        suggestion.decided_by, suggestion.decided_at = actor.id, utc_now()
        if note is not None:
            suggestion.decision_note = note
    suggestion.status, suggestion.updated_at = status, utc_now()
    action = {"implemented": "suggestion.implemented", "withdrawn": "suggestion.withdrawn"}.get(
        status, "suggestion.decided")
    record_audit(db, actor, action, "suggestions", suggestion.id,
                 before=before, after={"status": status, "version_id": version_id})


def add_comment(db, suggestion, actor, content):
    if suggestion.status == "withdrawn":
        raise HTTPException(409, "suggestion_closed", headers=q.PRIVATE)
    comment = m.SuggestionComment(suggestion_id=suggestion.id, author_id=actor.id, content=content)
    suggestion.updated_at = utc_now()
    db.add(comment)
    db.flush()
    return {**record(comment), "author": actor.display_name}
