"""Allow resource-free Physical Education while preserving existing lessons."""

import sqlalchemy as sa

from alembic import op

revision = "0010_physical_education"
down_revision = "0009_independent_labs"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("CurriculumComponent") as batch:
        batch.alter_column("teacher_id", existing_type=sa.Integer(), nullable=True)
        batch.create_check_constraint(
            "ck_load_pe_resources",
            "(lesson_type = 'pe' AND teacher_id IS NULL AND small_group_id IS NULL "
            "AND lab_group_id IS NULL) OR (lesson_type <> 'pe' AND teacher_id IS NOT NULL)",
        )
    with op.batch_alter_table("LessonAssignment") as batch:
        batch.alter_column("room_id", existing_type=sa.Integer(), nullable=True)
    pe_only = sa.text("lesson_type = 'pe'")
    op.create_index(
        "uq_load_pe_cohort",
        "CurriculumComponent",
        ["term_id", "course_group_id"],
        unique=True,
        sqlite_where=pe_only,
        mssql_where=pe_only,
    )


def downgrade():
    conn = op.get_bind()
    if conn.scalar(sa.text("SELECT COUNT(*) FROM CurriculumComponent WHERE lesson_type = 'pe'")):
        raise RuntimeError("Remove Physical Education workloads before downgrading")
    if conn.scalar(sa.text("SELECT COUNT(*) FROM LessonAssignment WHERE room_id IS NULL")):
        raise RuntimeError("Remove placements without assigned rooms before downgrading")
    op.drop_index("uq_load_pe_cohort", table_name="CurriculumComponent")
    with op.batch_alter_table("LessonAssignment") as batch:
        batch.alter_column("room_id", existing_type=sa.Integer(), nullable=False)
    with op.batch_alter_table("CurriculumComponent") as batch:
        batch.drop_constraint("ck_load_pe_resources", type_="check")
        batch.alter_column("teacher_id", existing_type=sa.Integer(), nullable=False)
