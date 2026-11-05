from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class FeedbackResponse(str, Enum):
    HELPFUL = "1"
    NOT_HELPFUL = "2"


class FeedbackStatus(str, Enum):
    PENDING = "pending"
    CAPTURED = "captured"
    EXPIRED = "expired"


class FlagStatus(str, Enum):
    FLAGGED = "flagged"
    IN_REVIEW = "in_review"
    RESOLVED = "resolved"


class FeedbackSchema(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    gdb_entry_id: str
    farmer_id: str
    message_id: str
    response: FeedbackResponse
    state: Optional[str] = None
    language: Optional[str] = None
    domain: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    status: FeedbackStatus = FeedbackStatus.CAPTURED

    class Config:
        populate_by_name = True
        use_enum_values = True


class MessageTrackingSchema(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    message_id: str
    gdb_entry_id: str
    farmer_id: str
    content: str
    state: Optional[str] = None
    language: Optional[str] = None
    domain: Optional[str] = None
    feedback_requested: bool = True
    feedback_received: bool = False
    feedback_response: Optional[FeedbackResponse] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    feedback_received_at: Optional[datetime] = None
    expires_at: datetime

    class Config:
        populate_by_name = True
        use_enum_values = True


class FlaggedEntrySchema(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    gdb_entry_id: str
    domain: Optional[str] = None
    language: Optional[str] = None
    total_responses: int
    helpful_count: int
    not_helpful_count: int
    helpfulness_score: float
    priority_score: float
    status: FlagStatus = FlagStatus.FLAGGED
    flagged_at: datetime = Field(default_factory=datetime.utcnow)
    last_feedback_at: Optional[datetime] = None
    review_notes: Optional[str] = None

    class Config:
        populate_by_name = True
        use_enum_values = True


class WeeklyDigestSchema(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    week_start: datetime
    week_end: datetime
    total_feedback_count: int
    total_helpful: int
    total_not_helpful: int
    overall_helpfulness_score: float
    lowest_rated_entries: List[Dict[str, Any]]
    domain_breakdown: List[Dict[str, Any]]
    language_breakdown: List[Dict[str, Any]]
    state_breakdown: List[Dict[str, Any]]
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True


class DashboardStats(BaseModel):
    total_feedback: int
    helpful_count: int
    not_helpful_count: int
    helpfulness_score: float
    total_gdb_entries: int
    flagged_entries_count: int
    this_week_feedback: int
    this_week_helpfulness: float


class GDBEntryStats(BaseModel):
    gdb_entry_id: str
    domain: Optional[str] = None
    language: Optional[str] = None
    state: Optional[str] = None
    total_responses: int
    helpful_count: int
    not_helpful_count: int
    helpfulness_score: float
    status: Optional[str] = None
    last_feedback_at: Optional[datetime] = None