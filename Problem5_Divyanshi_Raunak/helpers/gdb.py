from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class GDBMetrics(BaseModel):
    total_queries: int = 0
    total_feedback: int = 0
    upvotes: int = 0
    downvotes: int = 0
    helpful_ratio: float = 0.0
    voice_feedback_count: int = 0
    last_feedback_at: Optional[str] = None

class GDBEntryBase(BaseModel):
    crop: str
    domain: str
    sub_domain: Optional[str] = ""
    question_en: str
    question_hi: str
    answer_en: str
    answer_hi: str
    technical_level: str = "Medium"
    status: str = "ACTIVE" # ACTIVE, FLAGGED_REVIEW, IN_REVISION, RE_VALIDATED

class GDBEntry(GDBEntryBase):
    id: str = Field(alias="_id")
    metrics: GDBMetrics = Field(default_factory=GDBMetrics)
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    class Config:
        populate_by_name = True
