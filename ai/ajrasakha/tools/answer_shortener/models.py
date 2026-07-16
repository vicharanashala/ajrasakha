"""Pydantic request and response contracts."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


MAX_QUERY_CHARACTERS = 4_000
MAX_ANSWER_CHARACTERS = 30_000
MAX_TARGET_CHARACTERS = 30_000


def _normalize_input_text(value: object) -> object:
    if not isinstance(value, str):
        return value
    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


class ShortenAnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    original_query: str = Field(
        ...,
        min_length=1,
        max_length=MAX_QUERY_CHARACTERS,
        description="The farmer's original query used to decide which answer details matter.",
        examples=["How much urea should I apply to wheat?"],
    )
    answer: str = Field(
        ...,
        min_length=1,
        max_length=MAX_ANSWER_CHARACTERS,
        description=(
            "Existing AjraSakha answer body whose exact source segments may be "
            "selected. Footers are added later."
        ),
    )
    expected_character_count: int = Field(
        ...,
        strict=True,
        gt=0,
        le=MAX_TARGET_CHARACTERS,
        description=(
            "Desired output length in Unicode code points after input normalization; "
            "50 characters above or below are accepted."
        ),
        examples=[500],
    )

    @field_validator("original_query", "answer", mode="before")
    @classmethod
    def normalize_text_fields(cls, value: object) -> object:
        return _normalize_input_text(value)


class ShortenAnswerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shortened_answer: str = Field(
        description=(
            "Exact selected source segments joined by server-owned blank lines; "
            "contains no model-authored prose."
        )
    )
    status: Literal["shortened", "unchanged_within_tolerance"]
    original_character_count: int
    expected_character_count: int
    minimum_character_count: int
    maximum_character_count: int
    actual_character_count: int
    tolerance: int
    within_tolerance: bool
    changed: bool
    rewrite_attempts: int
    model: str
