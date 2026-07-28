from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class GDBEntry(BaseModel):
    """GDB knowledge base entry with computed helpfulness metrics."""
    id: str = Field(alias="_id")
    question: str
    answer: str
    domain: str
    language: str
    state: str
    keywords: List[str] = []
    # Computed/aggregated fields (updated by feedback pipeline)
    helpfulness_score: float = 0.0
    total_responses: int = 0
    helpful_count: int = 0
    not_helpful_count: int = 0
    is_flagged: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


class FlaggedEntry(BaseModel):
    """GDB entry that has been auto-flagged for re-review."""
    id: Optional[str] = Field(None, alias="_id")
    gdb_entry_id: str
    domain: Optional[str] = None
    language: Optional[str] = None
    total_responses: int
    helpful_count: int
    not_helpful_count: int
    helpfulness_score: float
    priority_score: float  # total_responses * (100 - helpfulness_score)
    status: str = "flagged"  # flagged | under_review | resolved
    flagged_at: datetime = Field(default_factory=datetime.utcnow)
    last_feedback_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    # Populated from gdb_entries
    question: Optional[str] = None
    answer: Optional[str] = None

    class Config:
        populate_by_name = True
