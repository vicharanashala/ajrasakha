from datetime import datetime, timezone
from typing import Any
from pydantic import BaseModel, Field


class DisclaimerLog(BaseModel):
    """Pydantic model representing an extracted disclaimer log document.

    CRITICAL PRIVACY DIRECTIVE: Notice `farmer_id` is absent by design.
    Extraction uses MongoDB projection `{"farmer_id": 0}` so PII never enters memory.
    """

    id: str | None = Field(default=None, alias="_id")
    query: str
    query_hash: str | None = None
    query_normalized: str | None = None
    source: str | None = "unknown"
    language: str | None = "English"
    state: str | None = "None"
    domain: str | None = "General"
    confidence: float | None = None
    best_match_id: str | None = None
    best_match_score: float | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "unanswered"
    is_off_topic: bool | None = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class GdbEntry(BaseModel):
    """Pydantic model representing a Golden Database (GDB) entry."""

    id: str = Field(alias="_id")
    question: str
    answer: str | None = None
    domain: str | None = "General"
    language: str | None = "English"
    state: str | None = "None"
    keywords: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class FlaggedEntry(BaseModel):
    """Pydantic model representing GDB entries flagged for low helpfulness or gaps."""

    id: str = Field(alias="_id")
    gdb_entry_id: str | None = None
    question: str | None = None
    domain: str | None = "General"
    helpful_count: int = 0
    unhelpful_count: int = 0
    helpfulness_score: float = 0.0
    status: str = "flagged"
    flag_reason: str = "low_helpfulness"
    flagged_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
