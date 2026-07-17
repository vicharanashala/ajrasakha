from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


GapType = Literal[
    "NO_MATCH",
    "LOCATION_GAP",
    "CROP_GAP",
    "DOMAIN_GAP",
    "PARTIAL_MATCH",
]


class AnalyzeRequest(BaseModel):
    question: str

    farmer_id: Optional[str] = None
    message_id: Optional[str] = None

    state: Optional[str] = None
    language: Optional[str] = None

    domain: Optional[str] = None

    timestamp: Optional[datetime] = None


class SimilarQuestion(BaseModel):
    question_id: str
    similarity_score: float


class GapEvent(BaseModel):
    question: str

    crop: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None

    intent: Optional[str] = None
    domain: Optional[str] = None

    gap_type: GapType

    coverage_score: float

    cluster_id: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)


class AnalyzeResponse(BaseModel):
    covered: bool

    coverage_score: float

    gap_type: GapType

    cluster_id: Optional[str] = None

    priority_score: float

    recommendation: str

    similar_questions: List[SimilarQuestion] = []


class ClusterSummary(BaseModel):
    cluster_id: str

    size: int

    crop: Optional[str]

    state: Optional[str]

    dominant_intent: Optional[str]

    average_priority: float


class WeeklyGapReport(BaseModel):
    generated_at: datetime = Field(default_factory=datetime.utcnow)

    total_gap_events: int

    total_clusters: int

    top_clusters: List[ClusterSummary]