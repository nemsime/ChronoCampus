"""Add email verification without locking out existing provisioned accounts."""

import sqlalchemy as sa

from alembic import op

revision = "0005_email_registration"
down_revision = "0004_jobs"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "User",
        sa.Column(
            "email_verified", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.add_column(
        "PasswordResetToken",
        sa.Column("purpose", sa.String(20), nullable=False, server_default="reset"),
    )


def downgrade():
    # Remove named SQL Server default constraints before dropping their columns.
    op.drop_column("PasswordResetToken", "purpose", mssql_drop_default=True)
    op.drop_column("User", "email_verified", mssql_drop_default=True)
