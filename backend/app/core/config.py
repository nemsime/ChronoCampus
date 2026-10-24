from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
