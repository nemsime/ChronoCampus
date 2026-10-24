"""Add durable queue protocol v1; preserve historical terminal generation runs."""

import sqlalchemy as sa

from alembic import op

revision = "0004_jobs"
down_revision = "0003_observability"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM GenerationRun WHERE status IN ('queued','running','retry_wait')"
        )
    ).scalar():
        raise RuntimeError("legacy_active_runs_require_stopped_cutover")
    op.create_table(
        "BackgroundJob",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("kind", sa.String(length=20), primary_key=False, nullable=False),
        sa.Column("protocol_version", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("state", sa.String(length=20), primary_key=False, nullable=False),
        sa.Column("payload", sa.JSON(), primary_key=False, nullable=False),
        sa.Column("priority", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("available_at", sa.DateTime(), primary_key=False, nullable=False),
        sa.Column("created_at", sa.DateTime(), primary_key=False, nullable=False),
        sa.Column("updated_at", sa.DateTime(), primary_key=False, nullable=False),
        sa.Column("started_at", sa.DateTime(), primary_key=False, nullable=True),
        sa.Column("finished_at", sa.DateTime(), primary_key=False, nullable=True),
        sa.Column("deadline_at", sa.DateTime(), primary_key=False, nullable=True),
        sa.Column("owner_id", sa.String(length=100), primary_key=False, nullable=True),
        sa.Column("lease_until", sa.DateTime(), primary_key=False, nullable=True),
        sa.Column("lease_generation", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("attempt_count", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("max_attempts", sa.Integer(), primary_key=False, nullable=False),
        sa.Column(
            "cancel_requested_at", sa.DateTime(), primary_key=False, nullable=True
        ),
        sa.Column("actor_id", sa.Integer(), primary_key=False, nullable=True),
        sa.Column("request_id", sa.String(length=32), primary_key=False, nullable=True),
        sa.Column("error_code", sa.String(length=80), primary_key=False, nullable=True),
    )
    op.create_index("ix_job_claim", "BackgroundJob", ["kind", "state", "available_at"])
    op.create_table(
        "JobAttempt",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "job_id",
            sa.Integer(),
            sa.ForeignKey("BackgroundJob.id"),
            primary_key=False,
            nullable=False,
        ),
        sa.Column("attempt_number", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("lease_generation", sa.Integer(), primary_key=False, nullable=False),
        sa.Column(
            "worker_instance", sa.String(length=100), primary_key=False, nullable=False
        ),
        sa.Column("started_at", sa.DateTime(), primary_key=False, nullable=False),
        sa.Column("deadline_at", sa.DateTime(), primary_key=False, nullable=False),
        sa.Column("finished_at", sa.DateTime(), primary_key=False, nullable=True),
        sa.Column("outcome", sa.String(length=30), primary_key=False, nullable=True),
        sa.Column("error_code", sa.String(length=80), primary_key=False, nullable=True),
        sa.Column("input_hash", sa.String(length=64), primary_key=False, nullable=True),
        sa.UniqueConstraint("job_id", "attempt_number"),
    )
    op.create_table(
        "QueueAdmission",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=30), primary_key=False, nullable=False),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "ActiveGeneration",
        sa.Column(
            "version_id",
            sa.Integer(),
            sa.ForeignKey("ScheduleVersion.id"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "job_id",
            sa.Integer(),
            sa.ForeignKey("BackgroundJob.id"),
            primary_key=False,
            nullable=False,
        ),
        sa.UniqueConstraint("job_id"),
    )
    op.create_table(
        "JobRequestKey",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("actor_id", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("operation", sa.String(length=60), primary_key=False, nullable=False),
        sa.Column("key", sa.String(length=80), primary_key=False, nullable=False),
        sa.Column(
            "request_hash", sa.String(length=64), primary_key=False, nullable=False
        ),
        sa.Column(
            "job_id",
            sa.Integer(),
            sa.ForeignKey("BackgroundJob.id"),
            primary_key=False,
            nullable=False,
        ),
        sa.UniqueConstraint("actor_id", "operation", "key"),
    )
    op.create_table(
        "WorkerHeartbeat",
        sa.Column(
            "instance_id", sa.String(length=100), primary_key=True, nullable=False
        ),
        sa.Column("role", sa.String(length=30), primary_key=False, nullable=False),
        sa.Column("pid", sa.Integer(), primary_key=False, nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), primary_key=False, nullable=False),
        sa.Column("status", sa.String(length=30), primary_key=False, nullable=False),
        sa.Column(
            "current_job_id",
            sa.Integer(),
            sa.ForeignKey("BackgroundJob.id"),
            primary_key=False,
            nullable=True,
        ),
    )
    op.create_table(
        "MailOutbox",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "job_id",
            sa.Integer(),
            sa.ForeignKey("BackgroundJob.id"),
            primary_key=False,
            nullable=False,
        ),
        sa.Column(
            "reset_token_id",
            sa.Integer(),
            sa.ForeignKey("PasswordResetToken.id"),
            primary_key=False,
            nullable=False,
        ),
        sa.Column(
            "encrypted_payload", sa.UnicodeText(), primary_key=False, nullable=True
        ),
        sa.Column("key_id", sa.String(length=100), primary_key=False, nullable=False),
        sa.Column("expires_at", sa.DateTime(), primary_key=False, nullable=False),
        sa.Column(
            "delivery_state", sa.String(length=30), primary_key=False, nullable=False
        ),
        sa.Column(
            "message_id", sa.String(length=255), primary_key=False, nullable=False
        ),
        sa.UniqueConstraint("job_id"),
    )
    op.create_table(
        "MaintenanceSchedule",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("task_kind", sa.String(length=40), primary_key=False, nullable=False),
        sa.Column("due_bucket", sa.DateTime(), primary_key=False, nullable=False),
        sa.UniqueConstraint("task_kind", "due_bucket"),
    )
    op.bulk_insert(
        sa.table(
            "QueueAdmission", sa.column("name", sa.String)
        ),
        [{"name": "generation"}],
    )
    op.add_column("GenerationRun", sa.Column("job_id", sa.Integer(), nullable=True))
    op.add_column(
        "GenerationRun", sa.Column("snapshot_created_at", sa.DateTime(), nullable=True)
    )
    op.create_foreign_key(
        "fk_generation_run_job", "GenerationRun", "BackgroundJob", ["job_id"], ["id"]
    )
    op.create_index(
        "ux_generation_run_job",
        "GenerationRun",
        ["job_id"],
        unique=True,
        mssql_where=sa.text("job_id IS NOT NULL"),
        sqlite_where=sa.text("job_id IS NOT NULL"),
    )


def downgrade():
    raise RuntimeError("Restore a verified backup rather than discard durable jobs.")
