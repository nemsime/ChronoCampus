"""Preserve existing catalogs and add the modular scheduling schema.

Revision ID: 0001_modular
No legacy data or scheduler tables are removed. Unknown legacy accounts require
explicit administrator role assignment and a password reset before access.
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_modular"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("ApplicationRevision"):
        op.create_table(
            "ApplicationRevision",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("AuthRateLimit"):
        op.create_table(
            "AuthRateLimit",
            sa.Column("key", sa.String(length=64), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint("key"),
        )
    if not inspector.has_table("Building"):
        op.create_table(
            "Building",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("building_number", sa.Integer(), nullable=False),
            sa.Column("name", sa.Unicode(length=100), nullable=True),
            sa.Column("address", sa.Unicode(length=200), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("building_number"),
        )
    if not inspector.has_table("CalendarConfig"):
        op.create_table(
            "CalendarConfig",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.Unicode(length=150), nullable=False),
            sa.Column("study_form", sa.String(length=10), nullable=False),
            sa.Column("first_start", sa.Time(), nullable=False),
            sa.Column("lesson_minutes", sa.Integer(), nullable=False),
            sa.Column("break_minutes", sa.Integer(), nullable=False),
            sa.Column("break_overrides", sa.JSON(), nullable=False),
            sa.Column("weekdays", sa.JSON(), nullable=False),
            sa.Column("ordinary_slots", sa.Integer(), nullable=False),
            sa.Column("operating_end", sa.Time(), nullable=True),
            sa.Column("academic_hours_per_lesson", sa.Integer(), nullable=True),
            sa.Column("academic_hour_minutes", sa.Integer(), nullable=True),
            sa.Column("teaching_weeks", sa.Integer(), nullable=False),
            sa.Column("confirmed", sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("EquipmentType"):
        op.create_table(
            "EquipmentType",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.Unicode(length=100), nullable=False),
            sa.Column("description", sa.Unicode(length=500), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
    if not inspector.has_table("Faculty"):
        op.create_table(
            "Faculty",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.Unicode(length=150), nullable=False),
            sa.Column("code", sa.Unicode(length=20), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code"),
        )
    if not inspector.has_table("LessonType"):
        op.create_table(
            "LessonType",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("label", sa.Unicode(length=20), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("label"),
        )
    if not inspector.has_table("AcademicTerm"):
        op.create_table(
            "AcademicTerm",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.Unicode(length=150), nullable=False),
            sa.Column("academic_year", sa.Unicode(length=20), nullable=False),
            sa.Column("starts_on", sa.Date(), nullable=False),
            sa.Column("ends_on", sa.Date(), nullable=False),
            sa.Column("calendar_id", sa.Integer(), nullable=False),
            sa.Column("holiday_policy", sa.String(length=20), nullable=False),
            sa.Column("confirmed", sa.Boolean(), nullable=False),
            sa.Column("search_seconds", sa.Integer(), nullable=False),
            sa.CheckConstraint("ends_on >= starts_on", name="ck_term_dates"),
            sa.ForeignKeyConstraint(
                ["calendar_id"],
                ["CalendarConfig.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("Major"):
        op.create_table(
            "Major",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("faculty_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.Unicode(length=150), nullable=False),
            sa.Column("major_code", sa.Integer(), nullable=False),
            sa.Column("study_form", sa.Unicode(length=10), nullable=False),
            sa.Column("duration_yrs", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["faculty_id"],
                ["Faculty.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("major_code", "study_form"),
        )
    if not inspector.has_table("Room"):
        op.create_table(
            "Room",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("building_id", sa.Integer(), nullable=False),
            sa.Column("room_number", sa.Unicode(length=20), nullable=False),
            sa.Column("floor_number", sa.Integer(), nullable=False),
            sa.Column("room_on_floor", sa.Integer(), nullable=False),
            sa.Column("capacity", sa.Integer(), nullable=False),
            sa.Column("room_type", sa.Unicode(length=20), nullable=False),
            sa.ForeignKeyConstraint(
                ["building_id"],
                ["Building.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("room_number"),
        )
    if not inspector.has_table("Subject"):
        op.create_table(
            "Subject",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.Unicode(length=150), nullable=False),
            sa.Column("lesson_type_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(
                ["lesson_type_id"],
                ["LessonType.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name", "lesson_type_id"),
        )
    if not inspector.has_table("CalendarHoliday"):
        op.create_table(
            "CalendarHoliday",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("term_id", sa.Integer(), nullable=False),
            sa.Column("day", sa.Date(), nullable=False),
            sa.Column("name", sa.Unicode(length=150), nullable=False),
            sa.ForeignKeyConstraint(
                ["term_id"],
                ["AcademicTerm.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("CourseGroup"):
        op.create_table(
            "CourseGroup",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("major_id", sa.Integer(), nullable=False),
            sa.Column("admission_year", sa.Integer(), nullable=False),
            sa.Column("group_code", sa.Unicode(length=20), nullable=False),
            sa.Column("capacity", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["major_id"],
                ["Major.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("group_code"),
        )
    if not inspector.has_table("RoomEquipment"):
        op.create_table(
            "RoomEquipment",
            sa.Column("room_id", sa.Integer(), nullable=False),
            sa.Column("equipment_type_id", sa.Integer(), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["equipment_type_id"],
                ["EquipmentType.id"],
            ),
            sa.ForeignKeyConstraint(
                ["room_id"],
                ["Room.id"],
            ),
            sa.PrimaryKeyConstraint("room_id", "equipment_type_id"),
        )
    if not inspector.has_table("ScheduleVersion"):
        op.create_table(
            "ScheduleVersion",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("term_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.Unicode(length=150), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("cohort_ids", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("report", sa.JSON(), nullable=False),
            sa.Column("configuration", sa.JSON(), nullable=False),
            sa.ForeignKeyConstraint(
                ["term_id"],
                ["AcademicTerm.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("ExtraLessonPermission"):
        op.create_table(
            "ExtraLessonPermission",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("term_id", sa.Integer(), nullable=False),
            sa.Column("course_group_id", sa.Integer(), nullable=True),
            sa.Column("starts_on", sa.Date(), nullable=False),
            sa.Column("ends_on", sa.Date(), nullable=False),
            sa.Column("weekday", sa.Integer(), nullable=True),
            sa.Column("slots", sa.JSON(), nullable=False),
            sa.Column("from_time", sa.Time(), nullable=False),
            sa.Column("until_time", sa.Time(), nullable=False),
            sa.Column("reason", sa.Unicode(length=500), nullable=False),
            sa.ForeignKeyConstraint(
                ["course_group_id"],
                ["CourseGroup.id"],
            ),
            sa.ForeignKeyConstraint(
                ["term_id"],
                ["AcademicTerm.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("GenerationRun"):
        op.create_table(
            "GenerationRun",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("version_id", sa.Integer(), nullable=False),
            sa.Column("source_revision", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("seed", sa.Integer(), nullable=False),
            sa.Column("algorithm", sa.String(length=20), nullable=False),
            sa.Column("input_hash", sa.String(length=64), nullable=False),
            sa.Column("snapshot", sa.JSON(), nullable=False),
            sa.Column("result", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(
                ["version_id"],
                ["ScheduleVersion.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("PublishedGroupSchedule"):
        op.create_table(
            "PublishedGroupSchedule",
            sa.Column("term_id", sa.Integer(), nullable=False),
            sa.Column("course_group_id", sa.Integer(), nullable=False),
            sa.Column("version_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["course_group_id"],
                ["CourseGroup.id"],
            ),
            sa.ForeignKeyConstraint(
                ["term_id"],
                ["AcademicTerm.id"],
            ),
            sa.ForeignKeyConstraint(
                ["version_id"],
                ["ScheduleVersion.id"],
            ),
            sa.PrimaryKeyConstraint("term_id", "course_group_id"),
        )
    if not inspector.has_table("SmallGroup"):
        op.create_table(
            "SmallGroup",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("course_group_id", sa.Integer(), nullable=False),
            sa.Column("label", sa.Unicode(length=50), nullable=False),
            sa.Column("capacity", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["course_group_id"],
                ["CourseGroup.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("course_group_id", "label"),
        )
    if not inspector.has_table("TeachingPeriod"):
        op.create_table(
            "TeachingPeriod",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("term_id", sa.Integer(), nullable=False),
            sa.Column("course_group_id", sa.Integer(), nullable=True),
            sa.Column("starts_on", sa.Date(), nullable=False),
            sa.Column("ends_on", sa.Date(), nullable=False),
            sa.ForeignKeyConstraint(
                ["course_group_id"],
                ["CourseGroup.id"],
            ),
            sa.ForeignKeyConstraint(
                ["term_id"],
                ["AcademicTerm.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("LabGroup"):
        op.create_table(
            "LabGroup",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("small_group_id", sa.Integer(), nullable=False),
            sa.Column("label", sa.Unicode(length=50), nullable=False),
            sa.Column("capacity", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["small_group_id"],
                ["SmallGroup.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("small_group_id", "label"),
        )
    if not inspector.has_table("User"):
        op.create_table(
            "User",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("email", sa.Unicode(length=255), nullable=False),
            sa.Column("password_hash", sa.Unicode(length=255), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_login", sa.DateTime(), nullable=True),
            sa.Column("display_name", sa.Unicode(length=150), nullable=True),
            sa.Column("role", sa.String(length=20), nullable=True),
            sa.Column("must_change_password", sa.Boolean(), nullable=False),
            sa.Column("course_group_id", sa.Integer(), nullable=True),
            sa.Column("small_group_id", sa.Integer(), nullable=True),
            sa.Column("lab_group_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(
                ["course_group_id"],
                ["CourseGroup.id"],
            ),
            sa.ForeignKeyConstraint(
                ["lab_group_id"],
                ["LabGroup.id"],
            ),
            sa.ForeignKeyConstraint(
                ["small_group_id"],
                ["SmallGroup.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("email"),
        )
    if not inspector.has_table("CurriculumComponent"):
        op.create_table(
            "CurriculumComponent",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("term_id", sa.Integer(), nullable=False),
            sa.Column("course_group_id", sa.Integer(), nullable=False),
            sa.Column("small_group_id", sa.Integer(), nullable=True),
            sa.Column("lab_group_id", sa.Integer(), nullable=True),
            sa.Column("subject_id", sa.Integer(), nullable=False),
            sa.Column("teacher_id", sa.Integer(), nullable=False),
            sa.Column("lesson_type", sa.String(length=20), nullable=False),
            sa.Column("semester_hours", sa.Integer(), nullable=False),
            sa.Column("assessment", sa.String(length=20), nullable=False),
            sa.Column("equipment_ids", sa.JSON(), nullable=False),
            sa.Column("preferred_daily_max", sa.Integer(), nullable=True),
            sa.CheckConstraint("semester_hours > 0", name="ck_load_hours"),
            sa.ForeignKeyConstraint(
                ["course_group_id"],
                ["CourseGroup.id"],
            ),
            sa.ForeignKeyConstraint(
                ["lab_group_id"],
                ["LabGroup.id"],
            ),
            sa.ForeignKeyConstraint(
                ["small_group_id"],
                ["SmallGroup.id"],
            ),
            sa.ForeignKeyConstraint(
                ["subject_id"],
                ["Subject.id"],
            ),
            sa.ForeignKeyConstraint(
                ["teacher_id"],
                ["User.id"],
            ),
            sa.ForeignKeyConstraint(
                ["term_id"],
                ["AcademicTerm.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("FeedbackThread"):
        op.create_table(
            "FeedbackThread",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("subject", sa.Unicode(length=150), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["User.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("PasswordResetToken"):
        op.create_table(
            "PasswordResetToken",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token", sa.Unicode(length=255), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["User.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token"),
        )
    if not inspector.has_table("ResourceAvailability"):
        op.create_table(
            "ResourceAvailability",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("teacher_id", sa.Integer(), nullable=True),
            sa.Column("room_id", sa.Integer(), nullable=True),
            sa.Column("starts_on", sa.Date(), nullable=False),
            sa.Column("ends_on", sa.Date(), nullable=False),
            sa.Column("weekday", sa.Integer(), nullable=True),
            sa.Column("parity", sa.String(length=20), nullable=False),
            sa.Column("from_time", sa.Time(), nullable=False),
            sa.Column("until_time", sa.Time(), nullable=False),
            sa.Column("kind", sa.String(length=20), nullable=False),
            sa.Column("reason", sa.Unicode(length=500), nullable=False),
            sa.ForeignKeyConstraint(
                ["room_id"],
                ["Room.id"],
            ),
            sa.ForeignKeyConstraint(
                ["teacher_id"],
                ["User.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("UserSession"):
        op.create_table(
            "UserSession",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("session_token", sa.Unicode(length=500), nullable=False),
            sa.Column("ip_address", sa.Unicode(length=45), nullable=True),
            sa.Column("user_agent", sa.Unicode(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("is_revoked", sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["User.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("session_token"),
        )
    if not inspector.has_table("FeedbackMessage"):
        op.create_table(
            "FeedbackMessage",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("thread_id", sa.Integer(), nullable=False),
            sa.Column("author_id", sa.Integer(), nullable=False),
            sa.Column("content", sa.UnicodeText(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["author_id"],
                ["User.id"],
            ),
            sa.ForeignKeyConstraint(
                ["thread_id"],
                ["FeedbackThread.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("LessonOccurrence"):
        op.create_table(
            "LessonOccurrence",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("component_id", sa.Integer(), nullable=False),
            sa.Column("ordinal", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["component_id"],
                ["CurriculumComponent.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("component_id", "ordinal"),
        )
    if not inspector.has_table("LessonAssignment"):
        op.create_table(
            "LessonAssignment",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("version_id", sa.Integer(), nullable=False),
            sa.Column("occurrence_id", sa.Integer(), nullable=False),
            sa.Column("day", sa.Date(), nullable=False),
            sa.Column("slot", sa.Integer(), nullable=False),
            sa.Column("starts_at", sa.Time(), nullable=False),
            sa.Column("ends_at", sa.Time(), nullable=False),
            sa.Column("room_id", sa.Integer(), nullable=False),
            sa.Column("pinned", sa.Boolean(), nullable=False),
            sa.Column("cancelled", sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(
                ["occurrence_id"],
                ["LessonOccurrence.id"],
            ),
            sa.ForeignKeyConstraint(
                ["room_id"],
                ["Room.id"],
            ),
            sa.ForeignKeyConstraint(
                ["version_id"],
                ["ScheduleVersion.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("version_id", "occurrence_id"),
        )
    if not inspector.has_table("PersonalLessonNote"):
        op.create_table(
            "PersonalLessonNote",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("occurrence_id", sa.Integer(), nullable=False),
            sa.Column("content", sa.UnicodeText(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["occurrence_id"],
                ["LessonOccurrence.id"],
            ),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["User.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "occurrence_id"),
        )

    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("User")}
    additions = [
        sa.Column("display_name", sa.Unicode(150), nullable=True),
        sa.Column("role", sa.String(20), nullable=True),
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("course_group_id", sa.Integer(), nullable=True),
        sa.Column("small_group_id", sa.Integer(), nullable=True),
        sa.Column("lab_group_id", sa.Integer(), nullable=True),
    ]
    for column in additions:
        if column.name not in columns:
            op.add_column("User", column)
            if column.name in ("course_group_id", "small_group_id", "lab_group_id"):
                target = {
                    "course_group_id": "CourseGroup",
                    "small_group_id": "SmallGroup",
                    "lab_group_id": "LabGroup",
                }[column.name]
                op.create_foreign_key(
                    "fk_account_" + column.name, "User", target, [column.name], ["id"]
                )
    subject_columns = {
        c["name"]: c for c in sa.inspect(op.get_bind()).get_columns("Subject")
    }
    if not subject_columns["lesson_type_id"]["nullable"]:
        op.alter_column(
            "Subject", "lesson_type_id", existing_type=sa.Integer(), nullable=True
        )
    bind = op.get_bind()
    if (
        bind.execute(sa.text("SELECT COUNT(*) FROM ApplicationRevision")).scalar_one()
        == 0
    ):
        bind.execute(
            sa.text("INSERT INTO ApplicationRevision (id, revision) VALUES (1, 0)")
            if bind.dialect.name != "mssql"
            else sa.text(
                "SET IDENTITY_INSERT ApplicationRevision ON; INSERT INTO ApplicationRevision (id, revision) VALUES (1, 0); SET IDENTITY_INSERT ApplicationRevision OFF;"
            )
        )


def downgrade():
    raise RuntimeError(
        "This migration preserves live records. Restore a verified backup instead of deleting application tables."
    )
