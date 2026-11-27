"""Record the published schedule each draft was created from."""

import sqlalchemy as sa

from alembic import op

revision = "0011_schedule_base"
down_revision = "0010_physical_education"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "ScheduleVersion", sa.Column("base_versions", sa.JSON(none_as_null=True), nullable=True)
    )


def downgrade():
    op.drop_column("ScheduleVersion", "base_versions")
