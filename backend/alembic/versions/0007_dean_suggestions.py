"""Add scoped dean accounts and non-binding schedule suggestions.

Frozen DDL: deliberately independent of the current application models.
"""

import sqlalchemy as sa

from alembic import op

revision = "0007_dean_suggestions"
down_revision = "0006_smtp_password_reset"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("User", sa.Column("faculty_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_user_faculty", "User", "Faculty", ["faculty_id"], ["id"])
    op.create_index("ix_user_faculty", "User", ["faculty_id"])
    op.create_table(
        "ScheduleSuggestion",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("User.id"), nullable=False),
        sa.Column("version_id", sa.Integer(), sa.ForeignKey("ScheduleVersion.id"), nullable=False),
        sa.Column("base_revision", sa.Integer(), nullable=False),
        sa.Column("occurrence_id", sa.Integer(), sa.ForeignKey("LessonOccurrence.id")),
        sa.Column("course_group_id", sa.Integer(), sa.ForeignKey("CourseGroup.id")),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("anchor", sa.JSON(), nullable=False),
        sa.Column("proposed_day", sa.Date()),
        sa.Column("proposed_slot", sa.Integer()),
        sa.Column("proposed_room_id", sa.Integer(), sa.ForeignKey("Room.id")),
        sa.Column("title", sa.Unicode(150), nullable=False),
        sa.Column("body", sa.UnicodeText(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("decision_note", sa.Unicode(1000)),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("User.id")),
        sa.Column("decided_at", sa.DateTime()),
        sa.Column("implemented_in_version_id", sa.Integer(), sa.ForeignKey("ScheduleVersion.id")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.sysutcdatetime()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.sysutcdatetime()),
    )
    for name, columns in (
        ("ix_suggestion_status_created", ["status", "created_at"]),
        ("ix_suggestion_author_status", ["author_id", "status"]),
        ("ix_suggestion_version", ["version_id"]),
        ("ix_suggestion_occurrence", ["occurrence_id"]),
    ):
        op.create_index(name, "ScheduleSuggestion", columns)
    op.create_table(
        "SuggestionComment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("suggestion_id", sa.Integer(), sa.ForeignKey("ScheduleSuggestion.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("User.id"), nullable=False),
        sa.Column("content", sa.UnicodeText(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.sysutcdatetime()),
    )


def downgrade():
    raise RuntimeError("Dean suggestions contain retained review history; restore a verified backup instead")
