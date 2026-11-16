"""Add dated change metadata; no retained rows are modified."""

import sqlalchemy as sa

from alembic import op

revision = "0008_dated_changes"
down_revision = "0007_dean_suggestions"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ScheduleChangeEvent",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "version_id",
            sa.Integer(),
            sa.ForeignKey("ScheduleVersion.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("reason", sa.Unicode(500), nullable=False),
        sa.Column("cohort_ids", sa.JSON(), nullable=False),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("ScheduleSuggestion.id")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("User.id"), nullable=False),
    )
    op.create_index(
        "ix_ScheduleChangeEvent_version_id", "ScheduleChangeEvent", ["version_id"]
    )
    op.create_table(
        "LessonOverride",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "version_id",
            sa.Integer(),
            sa.ForeignKey("ScheduleVersion.id"),
            nullable=False,
        ),
        sa.Column(
            "event_id",
            sa.Integer(),
            sa.ForeignKey("ScheduleChangeEvent.id"),
            nullable=False,
        ),
        sa.Column(
            "occurrence_id",
            sa.Integer(),
            sa.ForeignKey("LessonOccurrence.id"),
            nullable=False,
        ),
        sa.Column("original", sa.JSON(), nullable=False),
        sa.UniqueConstraint(
            "version_id", "occurrence_id", name="uq_override_occurrence"
        ),
    )
    op.create_index("ix_LessonOverride_version_id", "LessonOverride", ["version_id"])


def downgrade():
    raise RuntimeError(
        "Dated changes contain retained history; restore a verified backup instead"
    )
