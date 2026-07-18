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
            "Existing complete AjraSakha answer. When it contains the exact "
            "'👤 Answered by:' marker or a standalone underscore-divider line, "
            "only the preceding answer body is shortened; the footer is preserved "
            "verbatim."
        ),
    )
    expected_character_count: int = Field(
        ...,
        strict=True,
        gt=0,
        le=MAX_TARGET_CHARACTERS,
        description=(
            "Desired answer-body length in Unicode code points after input "
            "normalization; 50 characters above or below are accepted. Preserved "
            "footer text is excluded from this limit."
        ),
        examples=[500],
    )

    @field_validator("original_query", "answer", mode="before")
    @classmethod
    def normalize_text_fields(cls, value: object) -> object:
        return _normalize_input_text(value)


class ShortenAnswerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    short_answer: str = Field(
        description=(
            "Exact selected answer-body source segments plus any preserved footer. "
            "Contains no model-authored prose."
        )
    )
    full_answer: str = Field(
        description=(
            "The complete normalized input answer, including any preserved footer."
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
    footer_character_count: int = Field(
        description=(
            "Unicode code point count of the preserved footer beginning with a "
            "recognized AjraSakha footer boundary. This is excluded from all "
            "answer-body length fields and tolerance checks."
        )
    )
    changed: bool
    rewrite_attempts: int
    model: str
