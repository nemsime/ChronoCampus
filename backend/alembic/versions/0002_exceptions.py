"""Explicit emergency replacement and configurable secondary quality criteria."""

from alembic import op
import sqlalchemy as sa

revision = "0002_exceptions"
down_revision = "0001_modular"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "CalendarConfig", sa.Column("quality_weights", sa.JSON(), nullable=True)
    )
    op.add_column(
        "CalendarConfig", sa.Column("lecture_order", sa.String(20), nullable=True)
    )
    table = sa.table(
        "CalendarConfig",
        sa.column("quality_weights", sa.JSON()),
        sa.column("lecture_order", sa.String(20)),
    )
    op.get_bind().execute(
        table.update().values(
            quality_weights={
                "teacher_gaps": 1,
                "daily_overload": 1,
                "lecture_order": 1,
                "preferences": 1,
            },
            lecture_order="unconfirmed",
        )
    )
    with op.batch_alter_table("CalendarConfig") as batch:
        batch.alter_column("quality_weights", existing_type=sa.JSON(), nullable=False)
        batch.alter_column("lecture_order", existing_type=sa.String(20), nullable=False)
    op.create_table(
        "LessonDisruption",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "version_id",
            sa.Integer(),
            sa.ForeignKey("ScheduleVersion.id"),
            nullable=False,
        ),
        sa.Column(
            "occurrence_id",
            sa.Integer(),
            sa.ForeignKey("LessonOccurrence.id"),
            nullable=False,
        ),
        sa.Column("original_day", sa.Date(), nullable=False),
        sa.Column("original_slot", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Unicode(500), nullable=False),
        sa.UniqueConstraint("version_id", "occurrence_id"),
    )
    # These legacy constraints encoded duration as an immutable consequence of form.
    # Preserve existing values while allowing administrator-configured durations.
    bind = op.get_bind()
    if bind.dialect.name == "mssql":
        checks = (
            bind.execute(
                sa.text(
                    "SELECT name FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(:table)"
                ),
                {"table": "Major"},
            )
            .mappings()
            .all()
        )
    else:
        checks = sa.inspect(bind).get_check_constraints("Major")
    for check in checks:
        if check["name"] in {"chk_major_duration", "chk_major_form_duration"}:
            op.drop_constraint(check["name"], "Major", type_="check")


def downgrade():
    raise RuntimeError(
        "Restore a verified backup; do not discard dated exception records."
    )
