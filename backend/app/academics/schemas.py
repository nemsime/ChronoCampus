from datetime import date, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class FacultyInput(Input):
    name: str = Field(min_length=1, max_length=150)
    code: str = Field(min_length=1, max_length=20)


class MajorInput(Input):
    faculty_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=150)
    major_code: int = Field(gt=0)
    study_form: Literal["present", "remote"]
    duration_yrs: int = Field(ge=1, le=10)


class GroupInput(Input):
    major_id: int = Field(gt=0)
    admission_year: int = Field(ge=2000, le=2200)
    group_code: str = Field(min_length=1, max_length=20)
    capacity: int = Field(gt=0, le=2000)


class SmallGroupInput(Input):
    course_group_id: int = Field(gt=0)
    label: str = Field(min_length=1, max_length=50)
    capacity: int = Field(gt=0, le=2000)


class LabGroupInput(Input):
    small_group_id: int = Field(gt=0)
    label: str = Field(min_length=1, max_length=50)
    capacity: int = Field(gt=0, le=2000)


class BuildingInput(Input):
    building_number: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=100)
    address: str = Field(default="", max_length=200)


class RoomInput(Input):
    building_id: int = Field(gt=0)
    room_number: str = Field(min_length=1, max_length=20)
    floor_number: int = Field(ge=-5, le=100)
    room_on_floor: int = Field(gt=0)
    capacity: int = Field(gt=0, le=2000)
    room_type: Literal["lecture_hall", "classroom", "lab", "language_lab"]
    equipment_ids: list[int] = Field(default_factory=list, max_length=100)


class EquipmentInput(Input):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)


class SubjectInput(Input):
    name: str = Field(min_length=1, max_length=150)


class AccountInput(Input):
    email: str = Field(min_length=3, max_length=255)
    display_name: str = Field(min_length=1, max_length=150)
    role: Literal["admin", "lecturer", "student"]
    is_active: bool = True
    password: str | None = Field(default=None, min_length=12, max_length=256)
    course_group_id: int | None = None
    small_group_id: int | None = None
    lab_group_id: int | None = None


class CalendarInput(Input):
    name: str = Field(min_length=1, max_length=150)
    study_form: Literal["present", "remote"]
    first_start: time
    lesson_minutes: int = Field(ge=10, le=240)
    break_minutes: int = Field(ge=0, le=120)
    break_overrides: dict[str, int] = Field(default_factory=dict)
    weekdays: list[int] = Field(min_length=1, max_length=7)
    ordinary_slots: int = Field(ge=1, le=144)
    operating_end: time | None = None
    academic_hours_per_lesson: int | None = Field(default=None, ge=1, le=8)
    academic_hour_minutes: int | None = Field(default=None, ge=1, le=120)
    teaching_weeks: int = Field(default=16, ge=1, le=53)
    confirmed: bool = False
    quality_weights: dict[str, int] = Field(
        default_factory=lambda: {
            "teacher_gaps": 1,
            "daily_overload": 1,
            "lecture_order": 1,
            "preferences": 1,
        }
    )
    lecture_order: Literal["unconfirmed", "same_day", "off"] = "unconfirmed"

    @model_validator(mode="after")
    def validate_configuration(self):
        if set(self.quality_weights) != {
            "teacher_gaps",
            "daily_overload",
            "lecture_order",
            "preferences",
        } or any(not 0 <= w <= 100 for w in self.quality_weights.values()):
            raise ValueError("invalid_quality_weights")
        if any(d not in range(7) for d in self.weekdays) or len(
            set(self.weekdays)
        ) != len(self.weekdays):
            raise ValueError("invalid_weekdays")
        if any(
            not k.isdigit() or int(k) < 1 or not 0 <= v <= 120
            for k, v in self.break_overrides.items()
        ):
            raise ValueError("invalid_breaks")
        if self.operating_end and self.operating_end <= self.first_start:
            raise ValueError("invalid_operating_hours")
        if self.confirmed and not self.academic_hours_per_lesson:
            raise ValueError("academic_units_required")
        return self


class TermInput(Input):
    name: str = Field(min_length=1, max_length=150)
    academic_year: str = Field(min_length=1, max_length=20)
    starts_on: date
    ends_on: date
    calendar_id: int = Field(gt=0)
    holiday_policy: Literal["unconfirmed", "strict", "exempt"] = "exempt"
    confirmed: bool = False
    search_seconds: int = Field(default=60, ge=1, le=600)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.ends_on < self.starts_on or (self.ends_on - self.starts_on).days > 370:
            raise ValueError("invalid_dates")
        if self.confirmed and self.holiday_policy == "unconfirmed":
            raise ValueError("holiday_policy_required")
        return self


class PeriodInput(Input):
    term_id: int = Field(gt=0)
    course_group_id: int | None = None
    starts_on: date
    ends_on: date


class HolidayInput(Input):
    term_id: int = Field(gt=0)
    day: date
    name: str = Field(min_length=1, max_length=150)


class ExtraInput(PeriodInput):
    weekday: int | None = Field(default=None, ge=0, le=6)
    slots: list[int] = Field(min_length=1, max_length=144)
    from_time: time
    until_time: time
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_intervals(self):
        if self.until_time <= self.from_time or any(
            s < 1 or s > 144 for s in self.slots
        ):
            raise ValueError("invalid_interval")
        return self


class AvailabilityInput(Input):
    teacher_id: int | None = None
    room_id: int | None = None
    starts_on: date
    ends_on: date
    weekday: int | None = Field(default=None, ge=0, le=6)
    parity: Literal["every", "numerator", "denominator"] = "every"
    from_time: time
    until_time: time
    kind: Literal["unavailable", "preferred"]
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_interval(self):
        if bool(self.teacher_id) == bool(self.room_id):
            raise ValueError("one_resource_required")
        if self.ends_on < self.starts_on or self.until_time <= self.from_time:
            raise ValueError("invalid_interval")
        return self


class WorkloadInput(Input):
    term_id: int = Field(gt=0)
    course_group_id: int = Field(gt=0)
    small_group_id: int | None = None
    lab_group_id: int | None = None
    subject_id: int = Field(gt=0)
    teacher_id: int = Field(gt=0)
    lesson_type: Literal["lecture", "practical", "lab"]
    semester_hours: int = Field(gt=0, le=1000)
    assessment: Literal["none", "exam", "credit"] = "none"
    equipment_ids: list[int] = Field(default_factory=list, max_length=100)
    preferred_daily_max: int | None = Field(default=None, ge=1, le=24)
