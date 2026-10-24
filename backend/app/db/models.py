"""Persistent domain model. Legacy catalog names/keys remain stable during migration."""

from datetime import date, datetime, time

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    JSON,
    String,
    Time,
    Unicode,
    UnicodeText,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Faculty(Base):
    __tablename__ = "Faculty"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Unicode(150))
    code: Mapped[str] = mapped_column(Unicode(20), unique=True)


class Major(Base):
    __tablename__ = "Major"
    __table_args__ = (UniqueConstraint("major_code", "study_form"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    faculty_id: Mapped[int] = mapped_column(ForeignKey("Faculty.id"))
    name: Mapped[str] = mapped_column(Unicode(150))
    major_code: Mapped[int]
    study_form: Mapped[str] = mapped_column(Unicode(10))
    duration_yrs: Mapped[int]


class CourseGroup(Base):
    __tablename__ = "CourseGroup"
    id: Mapped[int] = mapped_column(primary_key=True)
    major_id: Mapped[int] = mapped_column(ForeignKey("Major.id"))
    admission_year: Mapped[int]
    group_code: Mapped[str] = mapped_column(Unicode(20), unique=True)
    capacity: Mapped[int]


class SmallGroup(Base):
    __tablename__ = "SmallGroup"
    __table_args__ = (UniqueConstraint("course_group_id", "label"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    course_group_id: Mapped[int] = mapped_column(ForeignKey("CourseGroup.id"))
    label: Mapped[str] = mapped_column(Unicode(50))
    capacity: Mapped[int]


class LabGroup(Base):
    __tablename__ = "LabGroup"
    __table_args__ = (UniqueConstraint("small_group_id", "label"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    small_group_id: Mapped[int] = mapped_column(ForeignKey("SmallGroup.id"))
    label: Mapped[str] = mapped_column(Unicode(50))
    capacity: Mapped[int]


class Building(Base):
    __tablename__ = "Building"
    id: Mapped[int] = mapped_column(primary_key=True)
    building_number: Mapped[int] = mapped_column(unique=True)
    name: Mapped[str | None] = mapped_column(Unicode(100))
    address: Mapped[str | None] = mapped_column(Unicode(200))


class Room(Base):
    __tablename__ = "Room"
    id: Mapped[int] = mapped_column(primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("Building.id"))
    room_number: Mapped[str] = mapped_column(Unicode(20), unique=True)
    floor_number: Mapped[int]
    room_on_floor: Mapped[int]
    capacity: Mapped[int]
    room_type: Mapped[str] = mapped_column(Unicode(20))


class Equipment(Base):
    __tablename__ = "EquipmentType"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Unicode(100), unique=True)
    description: Mapped[str | None] = mapped_column(Unicode(500))


class RoomEquipment(Base):
    __tablename__ = "RoomEquipment"
    room_id: Mapped[int] = mapped_column(ForeignKey("Room.id"), primary_key=True)
    equipment_type_id: Mapped[int] = mapped_column(
        ForeignKey("EquipmentType.id"), primary_key=True
    )
    quantity: Mapped[int]


class LessonType(Base):
    __tablename__ = "LessonType"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(Unicode(20), unique=True)


class Subject(Base):
    __tablename__ = "Subject"
    __table_args__ = (UniqueConstraint("name", "lesson_type_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Unicode(150))
    # Legacy linkage remains readable. New curriculum components carry their own type.
    lesson_type_id: Mapped[int | None] = mapped_column(ForeignKey("LessonType.id"))


class Account(Base):
    __tablename__ = "User"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(Unicode(255), unique=True)
    password_hash: Mapped[str] = mapped_column(Unicode(255))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime)
    display_name: Mapped[str | None] = mapped_column(Unicode(150))
    role: Mapped[str | None] = mapped_column(String(20))
    must_change_password: Mapped[bool] = mapped_column(default=True)
    course_group_id: Mapped[int | None] = mapped_column(ForeignKey("CourseGroup.id"))
    small_group_id: Mapped[int | None] = mapped_column(ForeignKey("SmallGroup.id"))
    lab_group_id: Mapped[int | None] = mapped_column(ForeignKey("LabGroup.id"))


class UserSession(Base):
    __tablename__ = "UserSession"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("User.id"))
    session_token: Mapped[str] = mapped_column(Unicode(500), unique=True)
    ip_address: Mapped[str | None] = mapped_column(Unicode(45))
    user_agent: Mapped[str | None] = mapped_column(Unicode(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    is_revoked: Mapped[bool] = mapped_column(default=False)


class ResetToken(Base):
    __tablename__ = "PasswordResetToken"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("User.id"))
    token: Mapped[str] = mapped_column(Unicode(255), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class RateLimit(Base):
    __tablename__ = "AuthRateLimit"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    attempts: Mapped[int]


class CalendarConfig(Base):
    __tablename__ = "CalendarConfig"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Unicode(150))
    study_form: Mapped[str] = mapped_column(String(10))
    first_start: Mapped[time] = mapped_column(Time)
    lesson_minutes: Mapped[int]
    break_minutes: Mapped[int]
    break_overrides: Mapped[dict] = mapped_column(JSON, default=dict)
    weekdays: Mapped[list] = mapped_column(JSON, default=list)
    ordinary_slots: Mapped[int]
    operating_end: Mapped[time | None] = mapped_column(Time)
    academic_hours_per_lesson: Mapped[int | None]
    academic_hour_minutes: Mapped[int | None]
    teaching_weeks: Mapped[int] = mapped_column(default=16)
    confirmed: Mapped[bool] = mapped_column(default=False)
    quality_weights: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "teacher_gaps": 1,
            "daily_overload": 1,
            "lecture_order": 1,
            "preferences": 1,
        },
    )
    lecture_order: Mapped[str] = mapped_column(String(20), default="unconfirmed")


class Term(Base):
    __tablename__ = "AcademicTerm"
    __table_args__ = (CheckConstraint("ends_on >= starts_on", name="ck_term_dates"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Unicode(150))
    academic_year: Mapped[str] = mapped_column(Unicode(20))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    calendar_id: Mapped[int] = mapped_column(ForeignKey("CalendarConfig.id"))
    holiday_policy: Mapped[str] = mapped_column(String(20), default="exempt")
    confirmed: Mapped[bool] = mapped_column(default=False)
    search_seconds: Mapped[int] = mapped_column(default=60)


class TeachingPeriod(Base):
    __tablename__ = "TeachingPeriod"
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("AcademicTerm.id"))
    course_group_id: Mapped[int | None] = mapped_column(ForeignKey("CourseGroup.id"))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)


class Holiday(Base):
    __tablename__ = "CalendarHoliday"
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("AcademicTerm.id"))
    day: Mapped[date] = mapped_column(Date)
    name: Mapped[str] = mapped_column(Unicode(150))


class ExtraPermission(Base):
    __tablename__ = "ExtraLessonPermission"
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("AcademicTerm.id"))
    course_group_id: Mapped[int | None] = mapped_column(ForeignKey("CourseGroup.id"))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    weekday: Mapped[int | None]
    slots: Mapped[list] = mapped_column(JSON)
    from_time: Mapped[time] = mapped_column(Time)
    until_time: Mapped[time] = mapped_column(Time)
    reason: Mapped[str] = mapped_column(Unicode(500))


class Availability(Base):
    __tablename__ = "ResourceAvailability"
    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int | None] = mapped_column(ForeignKey("User.id"))
    room_id: Mapped[int | None] = mapped_column(ForeignKey("Room.id"))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    weekday: Mapped[int | None]
    parity: Mapped[str] = mapped_column(String(20), default="every")
    from_time: Mapped[time] = mapped_column(Time)
    until_time: Mapped[time] = mapped_column(Time)
    kind: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(Unicode(500))


class Workload(Base):
    __tablename__ = "CurriculumComponent"
    __table_args__ = (CheckConstraint("semester_hours > 0", name="ck_load_hours"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("AcademicTerm.id"))
    course_group_id: Mapped[int] = mapped_column(ForeignKey("CourseGroup.id"))
    small_group_id: Mapped[int | None] = mapped_column(ForeignKey("SmallGroup.id"))
    lab_group_id: Mapped[int | None] = mapped_column(ForeignKey("LabGroup.id"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("Subject.id"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("User.id"))
    lesson_type: Mapped[str] = mapped_column(String(20))
    semester_hours: Mapped[int]
    assessment: Mapped[str] = mapped_column(String(20), default="none")
    equipment_ids: Mapped[list] = mapped_column(JSON, default=list)
    preferred_daily_max: Mapped[int | None]


class Occurrence(Base):
    __tablename__ = "LessonOccurrence"
    __table_args__ = (UniqueConstraint("component_id", "ordinal"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    component_id: Mapped[int] = mapped_column(ForeignKey("CurriculumComponent.id"))
    ordinal: Mapped[int]


class ScheduleVersion(Base):
    __tablename__ = "ScheduleVersion"
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("AcademicTerm.id"))
    name: Mapped[str] = mapped_column(Unicode(150))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    revision: Mapped[int] = mapped_column(default=1)
    cohort_ids: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    report: Mapped[dict] = mapped_column(JSON, default=dict)
    configuration: Mapped[dict] = mapped_column(JSON, default=dict)


class Assignment(Base):
    __tablename__ = "LessonAssignment"
    __table_args__ = (UniqueConstraint("version_id", "occurrence_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("ScheduleVersion.id"))
    occurrence_id: Mapped[int] = mapped_column(ForeignKey("LessonOccurrence.id"))
    day: Mapped[date] = mapped_column(Date)
    slot: Mapped[int]
    starts_at: Mapped[time] = mapped_column(Time)
    ends_at: Mapped[time] = mapped_column(Time)
    room_id: Mapped[int] = mapped_column(ForeignKey("Room.id"))
    pinned: Mapped[bool] = mapped_column(default=False)
    cancelled: Mapped[bool] = mapped_column(default=False)


class PublishedGroup(Base):
    __tablename__ = "PublishedGroupSchedule"
    term_id: Mapped[int] = mapped_column(
        ForeignKey("AcademicTerm.id"), primary_key=True
    )
    course_group_id: Mapped[int] = mapped_column(
        ForeignKey("CourseGroup.id"), primary_key=True
    )
    version_id: Mapped[int] = mapped_column(ForeignKey("ScheduleVersion.id"))


class Disruption(Base):
    __tablename__ = "LessonDisruption"
    __table_args__ = (UniqueConstraint("version_id", "occurrence_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("ScheduleVersion.id"))
    occurrence_id: Mapped[int] = mapped_column(ForeignKey("LessonOccurrence.id"))
    original_day: Mapped[date] = mapped_column(Date)
    original_slot: Mapped[int]
    reason: Mapped[str] = mapped_column(Unicode(500))


class GenerationRun(Base):
    __tablename__ = "GenerationRun"
    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("ScheduleVersion.id"))
    source_revision: Mapped[int]
    status: Mapped[str] = mapped_column(String(30))
    seed: Mapped[int]
    algorithm: Mapped[str] = mapped_column(String(20))
    input_hash: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)


class Note(Base):
    __tablename__ = "PersonalLessonNote"
    __table_args__ = (UniqueConstraint("user_id", "occurrence_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("User.id"))
    occurrence_id: Mapped[int] = mapped_column(ForeignKey("LessonOccurrence.id"))
    content: Mapped[str] = mapped_column(UnicodeText)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Feedback(Base):
    __tablename__ = "FeedbackThread"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("User.id"))
    subject: Mapped[str] = mapped_column(Unicode(150))
    status: Mapped[str] = mapped_column(String(20), default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FeedbackMessage(Base):
    __tablename__ = "FeedbackMessage"
    id: Mapped[int] = mapped_column(primary_key=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("FeedbackThread.id"))
    author_id: Mapped[int] = mapped_column(ForeignKey("User.id"))
    content: Mapped[str] = mapped_column(UnicodeText)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DataRevision(Base):
    """Serializes catalog edits, publication and job application across processes."""

    __tablename__ = "ApplicationRevision"
    id: Mapped[int] = mapped_column(primary_key=True)
    revision: Mapped[int]
