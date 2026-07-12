from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from enum import Enum

# --- Enums ---

class FeedbackResponse(str, Enum):
    HELPFUL = "1"
    NOT_HELPFUL = "2"

# --- Feedback Models ---

class FeedbackCreate(BaseModel):
    farmer_phone: str
    question_id: str
    answer_id: str
    language: Optional[str] = None
    response: FeedbackResponse

class Feedback(BaseModel):
    id: str
    farmer_phone: str
    question_id: str
    answer_id: str
    domain: str
    state: str
    language: Optional[str] = None
    response: FeedbackResponse
    created_at: datetime

# --- Stats Models ---

class DomainStats(BaseModel):
    domain: str
    total: int
    helpful: int
    not_helpful: int
    helpfulness_rate: float

class LanguageStats(BaseModel):
    language: str
    total: int
    helpful: int
    not_helpful: int
    helpfulness_rate: float

class StateStats(BaseModel):
    state: str
    total: int
    helpful: int
    not_helpful: int
    helpfulness_rate: float

class DashboardResponse(BaseModel):
    total_responses: int
    overall_helpful: int
    overall_not_helpful: int
    overall_helpfulness_rate: float
    by_domain: List[DomainStats]
    by_language: List[LanguageStats]
    by_state: List[StateStats]

# --- Flagging Models ---

class FlaggedEntry(BaseModel):
    answer_id: str
    domain: str
    total_responses: int
    helpfulness_rate: float
    reason: str

class FlaggedResponse(BaseModel):
    flagged_count: int
    threshold_used: float
    min_responses_used: int
    entries: List[FlaggedEntry]

# --- Digest Models ---

class DigestEntry(BaseModel):
    rank: int
    answer_id: str
    domain: str
    language: Optional[str] = None
    state: str
    total_responses: int
    helpfulness_rate: float

class DigestResponse(BaseModel):
    generated_at: datetime
    total_entries_analysed: int
    entries_below_threshold: int
    top_n: int
    entries: List[DigestEntry]

# --- Sample Questions Model (for Test Panel dropdown) ---

class QuestionSample(BaseModel):
    question_id: str
    answer_id: str
    question_text: str
    domain: str
    state: str
