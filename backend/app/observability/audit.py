"""Audit entries share the domain transaction; private text is never retained."""

from datetime import date, time

from app.db.models import AuditEvent
from app.observability.telemetry import request_id_var

# Only operational fields are retained. Names/emails/passwords/free text are omitted.
SAFE_FIELDS = {
    "role",
    "is_active",
    "must_change_password",
    "term_id",
    "calendar_id",
    "cohort_ids",
    "occurrence_id",
    "course_group_id",
    "small_group_id",
    "lab_group_id",
    "faculty_id",
    "major_id",
    "teacher_id",
    "subject_id",
    "room_id",
    "building_id",
    "equipment_ids",
    "capacity",
    "admission_year",
    "study_form",
    "duration_yrs",
    "lesson_type",
    "semester_hours",
    "assessment",
    "preferred_daily_max",
    "day",
    "slot",
    "pinned",
    "cancelled",
    "starts_on",
    "ends_on",
    "starts_at",
    "ends_at",
    "from_time",
    "until_time",
    "first_start",
    "operating_end",
    "lesson_minutes",
    "break_minutes",
    "break_overrides",
    "ordinary_slots",
    "academic_hours_per_lesson",
    "academic_hour_minutes",
    "teaching_weeks",
    "lecture_order",
    "quality_weights",
    "weekdays",
    "weekday",
    "slots",
    "parity",
    "kind",
    "confirmed",
    "holiday_policy",
    "search_seconds",
    "status",
    "revision",
    "seed",
    "algorithm",
    "room_type",
    "floor_number",
    "room_on_floor",
    "building_number",
    "major_code",
}


def safe_value(value):
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, (bool, int, float)) or value is None:
        return value
    if isinstance(value, str):
        return value[:100]
    if isinstance(value, list):
        return [safe_value(item) for item in value[:100]]
    if isinstance(value, dict):
        return {str(k)[:50]: safe_value(v) for k, v in list(value.items())[:30]}
    return None


def record_audit(db, actor, action, resource, entity_id=None, before=None, after=None):
    before, after = before or {}, after or {}
    changes = {
        key: {
            "before": safe_value(before.get(key)),
            "after": safe_value(after.get(key)),
        }
        for key in sorted(SAFE_FIELDS & (before.keys() | after.keys()))
        if before.get(key) != after.get(key)
    }
    actor_id = actor if isinstance(actor, int) else getattr(actor, "id", None)
    db.add(
        AuditEvent(
            actor_id=actor_id,
            request_id=request_id_var.get(),
            action=action,
            resource=resource,
            entity_id=entity_id,
            changes=changes,
        )
    )
