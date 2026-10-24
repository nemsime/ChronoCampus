"""Protocol v1 durable queue schema; no worker side effects at import time."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    String,
    UnicodeText,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models import Base


class BackgroundJob(Base):
    __tablename__ = "BackgroundJob"
    __table_args__ = (Index("ix_job_claim", "kind", "state", "available_at"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    protocol_version: Mapped[int] = mapped_column(default=1)
    state: Mapped[str] = mapped_column(String(20), default="queued")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    priority: Mapped[int] = mapped_column(default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime)
    owner_id: Mapped[str | None] = mapped_column(String(100))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime)
    lease_generation: Mapped[int] = mapped_column(default=0)
    attempt_count: Mapped[int] = mapped_column(default=0)
    max_attempts: Mapped[int] = mapped_column(default=3)
    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime)
    actor_id: Mapped[int | None]
    request_id: Mapped[str | None] = mapped_column(String(32))
    error_code: Mapped[str | None] = mapped_column(String(80))


class JobAttempt(Base):
    __tablename__ = "JobAttempt"
    __table_args__ = (UniqueConstraint("job_id", "attempt_number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("BackgroundJob.id"))
    attempt_number: Mapped[int]
    lease_generation: Mapped[int]
    worker_instance: Mapped[str] = mapped_column(String(100))
    started_at: Mapped[datetime] = mapped_column(DateTime)
    deadline_at: Mapped[datetime] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    outcome: Mapped[str | None] = mapped_column(String(30))
    error_code: Mapped[str | None] = mapped_column(String(80))
    input_hash: Mapped[str | None] = mapped_column(String(64))


class QueueAdmission(Base):
    __tablename__ = "QueueAdmission"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)


class ActiveGeneration(Base):
    __tablename__ = "ActiveGeneration"
    version_id: Mapped[int] = mapped_column(
        ForeignKey("ScheduleVersion.id"), primary_key=True
    )
    job_id: Mapped[int] = mapped_column(ForeignKey("BackgroundJob.id"), unique=True)


class JobRequestKey(Base):
    __tablename__ = "JobRequestKey"
    __table_args__ = (UniqueConstraint("actor_id", "operation", "key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int]
    operation: Mapped[str] = mapped_column(String(60))
    key: Mapped[str] = mapped_column(String(80))
    request_hash: Mapped[str] = mapped_column(String(64))
    job_id: Mapped[int] = mapped_column(ForeignKey("BackgroundJob.id"))


class WorkerHeartbeat(Base):
    __tablename__ = "WorkerHeartbeat"
    instance_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    role: Mapped[str] = mapped_column(String(30))
    pid: Mapped[int]
    last_seen_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(30))
    current_job_id: Mapped[int | None] = mapped_column(ForeignKey("BackgroundJob.id"))


class MailOutbox(Base):
    __tablename__ = "MailOutbox"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("BackgroundJob.id"), unique=True)
    reset_token_id: Mapped[int] = mapped_column(ForeignKey("PasswordResetToken.id"))
    encrypted_payload: Mapped[str | None] = mapped_column(UnicodeText)
    key_id: Mapped[str] = mapped_column(String(100))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    delivery_state: Mapped[str] = mapped_column(String(30))
    message_id: Mapped[str] = mapped_column(String(255))


class MaintenanceSchedule(Base):
    __tablename__ = "MaintenanceSchedule"
    __table_args__ = (UniqueConstraint("task_kind", "due_bucket"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    task_kind: Mapped[str] = mapped_column(String(40))
    due_bucket: Mapped[datetime] = mapped_column(DateTime)


Index(
    "ux_generation_run_job",
    Base.metadata.tables["GenerationRun"].c.job_id,
    unique=True,
    mssql_where=text("job_id IS NOT NULL"),
    sqlite_where=text("job_id IS NOT NULL"),
)
