from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    sqlserver_connection_string: SecretStr = SecretStr("")
    db_timeout_seconds: int = Field(default=5, ge=1, le=60)
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    database_url: SecretStr = SecretStr("")
    session_hours: int = Field(default=12, ge=1, le=168)
    cookie_secure: bool = True
    public_url: str = "http://localhost:3000"
    reset_minutes: int = Field(default=30, ge=5, le=120)
    university_email_domains: list[str] = []
    mail_mode: str = "disabled"
    mail_directory: Path = Path(__file__).resolve().parents[2] / ".mail"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_from: str = ""
    diagnostic_log_directory: Path = Path(__file__).resolve().parents[2] / ".logs"
    diagnostic_log_max_bytes: int = Field(default=5_000_000, ge=100_000, le=100_000_000)
    diagnostic_log_backups: int = Field(default=5, ge=1, le=30)
    diagnostic_debug: bool = False
    metrics_token: SecretStr = SecretStr("")
    metrics_token_file: Path | None = None
    worker_role: Literal["api", "coordinator", "io"] = "api"
    worker_instance_id: str = Field(default="", pattern=r"^[A-Za-z0-9_-]{0,100}$")
    sql_pool_size: int = Field(default=5, ge=1, le=20)
    job_lease_seconds: int = Field(default=60, ge=15, le=300)
    job_heartbeat_seconds: int = Field(default=10, ge=1, le=30)
    job_poll_seconds: float = Field(default=1.0, ge=0.1, le=5)
    job_max_attempts: int = Field(default=3, ge=1, le=5)
    generation_queue_limit: int = Field(default=4, ge=1, le=20)
    solver_grace_seconds: int = Field(default=180, ge=10, le=600)
    solver_memory_mb: int = Field(default=2048, ge=256, le=16384)
    solver_input_max_bytes: int = Field(default=16_777_216, ge=1024, le=67_108_864)
    solver_output_max_bytes: int = Field(default=67_108_864, ge=1024, le=134_217_728)
    mail_keys_file: Path = Path(__file__).resolve().parents[2] / ".secrets/mail-keys.json"

    @model_validator(mode="after")
    def heartbeat_fits_lease(self):
        if self.job_heartbeat_seconds * 2 >= self.job_lease_seconds:
            raise ValueError("job_heartbeat_seconds must be less than half job_lease_seconds")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
