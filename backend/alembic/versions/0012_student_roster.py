"""Add official student rosters, confirmed enrollments and transfer requests."""

import sqlalchemy as sa

from alembic import op

revision = "0012_student_roster"
down_revision = "0011_schedule_base"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "StudentRoster",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "term_id", sa.Integer(), sa.ForeignKey("AcademicTerm.id"), nullable=False
        ),
        sa.Column(
            "course_group_id",
            sa.Integer(),
            sa.ForeignKey("CourseGroup.id"),
            nullable=False,
        ),
        sa.Column(
            "small_group_id",
            sa.Integer(),
            sa.ForeignKey("SmallGroup.id"),
            nullable=False,
        ),
        sa.Column("surname", sa.Unicode(100), nullable=False),
        sa.Column("given_name", sa.Unicode(100), nullable=False),
        sa.Column("patronymic", sa.Unicode(100)),
        sa.Column("email", sa.Unicode(255)),
    )
    op.create_index(
        "ix_student_roster_term_course", "StudentRoster", ["term_id", "course_group_id"]
    )
    op.create_index(
        "uq_student_roster_term_email",
        "StudentRoster",
        ["term_id", "email"],
        unique=True,
        sqlite_where=sa.text("email IS NOT NULL"),
        mssql_where=sa.text("email IS NOT NULL"),
    )
    op.create_table(
        "StudentEnrollment",
        sa.Column(
            "account_id", sa.Integer(), sa.ForeignKey("User.id"), primary_key=True
        ),
        sa.Column(
            "course_group_id",
            sa.Integer(),
            sa.ForeignKey("CourseGroup.id"),
            nullable=False,
        ),
        sa.Column("roster_id", sa.Integer(), sa.ForeignKey("StudentRoster.id")),
        sa.Column("surname", sa.Unicode(100), nullable=False),
        sa.Column("given_name", sa.Unicode(100), nullable=False),
        sa.Column("patronymic", sa.Unicode(100)),
        sa.Column("confirmed", sa.Boolean(), nullable=False),
    )
    op.create_index(
        "ix_student_enrollment_course_confirmed",
        "StudentEnrollment",
        ["course_group_id", "confirmed"],
    )
    op.create_index(
        "uq_student_enrollment_roster",
        "StudentEnrollment",
        ["roster_id"],
        unique=True,
        sqlite_where=sa.text("roster_id IS NOT NULL"),
        mssql_where=sa.text("roster_id IS NOT NULL"),
    )
    op.create_table(
        "StudentTransfer",
        sa.Column(
            "account_id",
            sa.Integer(),
            sa.ForeignKey("StudentEnrollment.account_id"),
            nullable=False,
        ),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "from_group_id",
            sa.Integer(),
            sa.ForeignKey("SmallGroup.id"),
            nullable=False,
        ),
        sa.Column(
            "target_group_id",
            sa.Integer(),
            sa.ForeignKey("SmallGroup.id"),
            nullable=False,
        ),
        sa.Column("reason", sa.Unicode(500), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime()),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("User.id")),
    )
    op.create_index(
        "uq_student_transfer_pending",
        "StudentTransfer",
        ["account_id"],
        unique=True,
        sqlite_where=sa.text("status = 'pending'"),
        mssql_where=sa.text("status = 'pending'"),
    )


def downgrade():
    op.drop_table("StudentTransfer")
    op.drop_table("StudentEnrollment")
    op.drop_table("StudentRoster")
