"""Add durable audit and generation progress without changing existing schedules."""

import sqlalchemy as sa
from alembic import op

revision = "0003_observability"
down_revision = "0002_exceptions"
branch_labels = None
depends_on = None


def upgrade():
    for column in (
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("request_id", sa.String(32), nullable=True),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("progress", sa.JSON(), nullable=True),
        sa.Column("comparison_hash", sa.String(64), nullable=True),
    ):
        op.add_column("GenerationRun", column)
    op.create_table(
        "AuditEvent",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("request_id", sa.String(32), nullable=True),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("resource", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=False),
    )
    op.create_index("ix_AuditEvent_created_at", "AuditEvent", ["created_at"])
    op.create_index("ix_AuditEvent_request_id", "AuditEvent", ["request_id"])


def downgrade():
    raise RuntimeError("Restore a verified backup rather than discard audit history.")
