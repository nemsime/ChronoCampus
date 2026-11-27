from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Unicode, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models import Base
from app.db.utc import UTCDateTime, utc_now


class StudentRoster(Base):
    __tablename__ = "StudentRoster"
    __table_args__ = (
        Index("ix_student_roster_term_course", "term_id", "course_group_id"),
        Index(
            "uq_student_roster_term_email",
            "term_id",
            "email",
            unique=True,
            sqlite_where=text("email IS NOT NULL"),
            mssql_where=text("email IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("AcademicTerm.id"))
    course_group_id: Mapped[int] = mapped_column(ForeignKey("CourseGroup.id"))
    small_group_id: Mapped[int] = mapped_column(ForeignKey("SmallGroup.id"))
    surname: Mapped[str] = mapped_column(Unicode(100))
    given_name: Mapped[str] = mapped_column(Unicode(100))
    patronymic: Mapped[str | None] = mapped_column(Unicode(100))
    email: Mapped[str | None] = mapped_column(Unicode(255))


class StudentEnrollment(Base):
    __tablename__ = "StudentEnrollment"
    __table_args__ = (
        Index("ix_student_enrollment_course_confirmed", "course_group_id", "confirmed"),
        Index(
            "uq_student_enrollment_roster",
            "roster_id",
            unique=True,
            sqlite_where=text("roster_id IS NOT NULL"),
            mssql_where=text("roster_id IS NOT NULL"),
        ),
    )

    account_id: Mapped[int] = mapped_column(ForeignKey("User.id"), primary_key=True)
    course_group_id: Mapped[int] = mapped_column(ForeignKey("CourseGroup.id"))
    roster_id: Mapped[int | None] = mapped_column(ForeignKey("StudentRoster.id"))
    surname: Mapped[str] = mapped_column(Unicode(100))
    given_name: Mapped[str] = mapped_column(Unicode(100))
    patronymic: Mapped[str | None] = mapped_column(Unicode(100))
    confirmed: Mapped[bool] = mapped_column(default=False)


class StudentTransfer(Base):
    __tablename__ = "StudentTransfer"
    __table_args__ = (
        Index(
            "uq_student_transfer_pending",
            "account_id",
            unique=True,
            sqlite_where=text("status = 'pending'"),
            mssql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("StudentEnrollment.account_id"))
    from_group_id: Mapped[int] = mapped_column(ForeignKey("SmallGroup.id"))
    target_group_id: Mapped[int] = mapped_column(ForeignKey("SmallGroup.id"))
    reason: Mapped[str] = mapped_column(Unicode(500))
    status: Mapped[str] = mapped_column(String(10), default="pending")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("User.id"))
