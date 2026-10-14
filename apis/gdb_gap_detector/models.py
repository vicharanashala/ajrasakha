from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional

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

    state: str

    district: list[str] = Field(default_factory=list)

    crop: str | None = None

    season: str | None = None

    domain: list[str] | str | None = None

    language: str = "English"

    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
    )


class SimilarQuestion(BaseModel):
    question: str

    score: float

    state: str | None = None

    crop: str | None = None

    domain: str | list[str] | None = None


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

    gap_type: str

    cluster_id: str

    priority_score: float

    recommendation: str

    similar_questions: List[SimilarQuestion] = Field(default_factory=list)


class GapClusterSummary(BaseModel):

    cluster_id: str

    state: str | None = None

    crop: str | None = None

    domain: list[str] | str | None = None

    size: int

    priority_score: float

    recommendation: str


class WeeklyGapReport(BaseModel):

    generated_at: datetime

    total_gap_events: int

    total_clusters: int

    top_clusters: list[GapClusterSummary]

class BatchAnalyzeRequest(BaseModel):

    queries: list[AnalyzeRequest]

class BatchAnalyzeResponse(BaseModel):

    total_queries: int

    analyzed_at: datetime

    results: list[AnalyzeResponse]

class GapStatistics(BaseModel):

    generated_at: datetime

    total_gap_events: int

    total_clusters: int

    uncovered_queries: int

    average_priority_score: float

class GapCluster(BaseModel):

    cluster_id: str

    centroid: list[float]

    size: int

    state: str | None = None

    district: list[str] = Field(default_factory=list)

    crop: str | None = None

    season: str | None = None

    domain: list[str] | str | None = None

    questions: list[str]

    coverage_score: float = 0.0

    priority_score: float = 0.0

    growth_rate: float = 0.0

    created_at: datetime | None = None

    last_seen: datetime | None = None

    pending_reviews: int = 0