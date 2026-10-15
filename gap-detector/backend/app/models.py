"""Internal pydantic models.

Two disclaimer sources (``farmer_feedback.disclaimer_logs`` and
``gdb_gap_detector.raw_queries``) are normalised into ``DisclaimerQuery``; the
Golden DB into ``GdbEntry``. Output documents mirror the seed collections' field
names (``gap_reports``, ``clusters``) so existing readers can consume them unchanged.

Privacy: farmer identifiers are never stored raw - ``farmer_key`` is a short
salted hash used only to count unique farmers per cluster.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------- #
# Ingested / normalised inputs
# --------------------------------------------------------------------------- #


class GdbEntry(BaseModel):
    entry_id: str
    question: str
    answer: str
    domain: str | None = None
    domain_raw: str | None = None
    language: str | None = None
    language_code: str | None = None
    state: str | None = None
    crop: str | None = None
    keywords: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DisclaimerQuery(BaseModel):
    """A farmer question the bot could not answer from the GDB (2-hour disclaimer sent)."""

    source_ref: str
    source: Literal["disclaimer_logs", "raw_queries"]
    query: str
    query_normalized: str
    farmer_key: str | None = None
    channel: str | None = None  # web / telegram / chat / whatsapp / unknown / test
    language: str | None = None
    language_code: str | None = None
    state: str | None = None
    domain: str | None = None
    domain_raw: str | None = None
    crop: str | None = None
    confidence: float | None = None
    best_match_id: str | None = None
    best_match_score: float | None = None
    timestamp: datetime
    status: str = "unanswered"


# --------------------------------------------------------------------------- #
# Project 6 outputs (shapes mirror gdb_gap_detector.clusters + farmer_feedback.gap_reports)
# --------------------------------------------------------------------------- #

PriorityLevel = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]


class GapCluster(BaseModel):
    cluster_id: str
    title: str
    size: int
    representative_queries: list[str]
    keywords: list[str] = Field(default_factory=list)
    crop_distribution: dict[str, int] = Field(default_factory=dict)
    state_distribution: dict[str, int] = Field(default_factory=dict)
    domain_distribution: dict[str, int] = Field(default_factory=dict)
    language_distribution: dict[str, int] = Field(default_factory=dict)
    unique_farmers: int = 0
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    weekly_counts: list[int] = Field(default_factory=list)  # oldest -> newest
    growth_rate: float = 0.0
    frequency_score: float = 0.0
    trend_score: float = 0.0
    farmers_score: float = 0.0
    geography_score: float = 0.0
    gap_score: float = 0.0
    priority_level: PriorityLevel = "LOW"
    created_at: datetime


class TopGap(BaseModel):
    cluster_id: str
    cluster_name: str
    size: int
    keywords: list[str]
    sample_queries: list[str]
    domains: list[str]
    states: list[str]
    crops: list[str] = Field(default_factory=list)
    growth_rate: float
    priority_score: float
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    farmer_demand: int
    recommended_action: str
    priority_level: PriorityLevel


class HeatmapCell(BaseModel):
    domain: str
    state: str
    crop: str | None = None
    gdb_count: int
    disclaimer_count: int
    coverage_score: float  # percent 0..100
    status: Literal["good", "partial", "gap"]


class CoverageStats(BaseModel):
    heatmap: list[HeatmapCell]
    total_combinations: int
    covered: int
    partial: int
    gaps: int


class OutreachRecommendation(BaseModel):
    target_state: str
    focus_domain: str
    gap_questions: int
    recommendation: str
    priority: PriorityLevel


class GapReport(BaseModel):
    report_type: Literal["weekly_gap_report"] = "weekly_gap_report"
    run_id: str
    period_days: int
    start_date: datetime
    end_date: datetime
    generated_at: datetime
    total_disclaimers: int
    unique_queries: int
    clusters_found: int
    #: Queries received in the window but excluded from the analysis, by reason.
    excluded_non_agricultural: int = 0
    excluded_test_traffic: int = 0
    top_gaps: list[TopGap]
    coverage_stats: CoverageStats
    outreach_recommendations: list[OutreachRecommendation]
    domains_with_gaps: list[dict[str, Any]]  # {domain, gap_count} - seed shape
    states_with_gaps: list[dict[str, Any]]  # {state, gap_count}
    crops_with_gaps: list[dict[str, Any]] = Field(default_factory=list)  # {crop, gap_count}
    #: domain x state x crop cells, for the crop-level view of the same coverage model
    crop_coverage: CoverageStats | None = None
