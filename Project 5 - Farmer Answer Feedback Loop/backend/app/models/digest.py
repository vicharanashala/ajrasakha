from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class BreakdownItem(BaseModel):
    name: str
    total_responses: int
    helpful_count: int
    not_helpful_count: int
    helpfulness_score: float


class LowestRatedEntry(BaseModel):
    gdb_entry_id: str
    domain: Optional[str] = None
    total_responses: int
    helpfulness_score: float
    question: Optional[str] = None


class WeeklyDigest(BaseModel):
    """Weekly summary of feedback with GROQ-generated insights."""
    id: Optional[str] = Field(None, alias="_id")
    week_start: datetime
    week_end: datetime
    total_feedback_count: int
    total_helpful: int
    total_not_helpful: int
    overall_helpfulness_score: float
    lowest_rated_entries: List[LowestRatedEntry] = []
    domain_breakdown: List[BreakdownItem] = []
    language_breakdown: List[BreakdownItem] = []
    state_breakdown: List[BreakdownItem] = []
    # GROQ-generated fields
    groq_analysis: Optional[str] = None
    groq_recommendations: Optional[List[str]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
