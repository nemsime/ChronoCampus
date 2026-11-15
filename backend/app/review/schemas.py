from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SuggestionStatus = Literal["open", "accepted", "rejected", "implemented", "withdrawn"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SuggestionInput(Input):
    version_id: int = Field(gt=0)
    kind: Literal["move", "room", "cancel", "other"]
    occurrence_id: int | None = Field(default=None, gt=0)
    course_group_id: int | None = Field(default=None, gt=0)
    proposed_day: date | None = None
    proposed_slot: int | None = Field(default=None, ge=1, le=144)
    proposed_room_id: int | None = Field(default=None, gt=0)
    title: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1, max_length=5000)


class CommentInput(Input):
    content: str = Field(min_length=1, max_length=5000)


class DecisionInput(Input):
    status: Literal["accepted", "rejected"]
    note: str | None = Field(default=None, max_length=1000)
    expected_status: SuggestionStatus


class ImplementedInput(Input):
    version_id: int = Field(gt=0)
    expected_status: SuggestionStatus
