from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class FeedbackCreate(BaseModel):
    """Schema for creating new feedback (POST body)."""
    gdb_entry_id: str
    farmer_id: str
    response: str  # "1" = helpful, "2" = not helpful
    state: Optional[str] = None
    language: Optional[str] = None
    domain: Optional[str] = None


class FeedbackRecord(BaseModel):
    """Full feedback record as stored in MongoDB."""
    id: str = Field(alias="_id")
    gdb_entry_id: str
    farmer_id: str
    message_id: Optional[str] = None
    response: str  # "1" | "2"
    state: Optional[str] = None
    language: Optional[str] = None
    domain: Optional[str] = None
    timestamp: datetime
    status: str = "captured"

    class Config:
        populate_by_name = True


class WhatsAppSession(BaseModel):
    """Tracks pending feedback state per farmer."""
    farmer_phone: str
    pending_feedback_for: Optional[str] = None  # gdb_entry_id
    last_question: Optional[str] = None
    state: str = "active"  # active | awaiting_feedback | done
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime


class FeedbackStats(BaseModel):
    """Aggregated stats for a group (entry, domain, language, state)."""
    total_responses: int
    helpful_count: int
    not_helpful_count: int
    helpfulness_score: float  # percentage 0–100
