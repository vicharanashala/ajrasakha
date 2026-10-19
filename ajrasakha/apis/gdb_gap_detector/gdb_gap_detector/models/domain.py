from datetime import datetime, timezone
from typing import Any
from pydantic import BaseModel, Field


class GapCluster(BaseModel):
    """Raw cluster derived from HDBSCAN stage."""

    cluster_id: str
    cluster_name: str
    size: int
    keywords: list[str] = Field(default_factory=list)
    sample_queries: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    states: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    first_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    farmer_demand: int = 1
    is_miscellaneous: bool = False
    near_miss_count: int = 0
    real_gap_count: int = 0
    almost_covered_count: int = 0


class ScoredCluster(GapCluster):
    """Enriched cluster after Scorer stage."""

    growth_rate: float = 0.0
    priority_score: float = 0.0
    priority_level: str = "LOW"  # CRITICAL, HIGH, MEDIUM, LOW
    triage_status: str = "real_gap"  # real_gap, near_miss, almost_covered
    recommended_action: str = ""
    trend_status: str = "baseline"  # NEW, GROWING, SHRINKING, baseline
class CoverageCell(BaseModel):
    """Cell in Coverage Heatmap Matrix (Domain x State)."""

    domain: str
    state: str
    gdb_count: int = 0
    disclaimer_count: int = 0
    coverage_score: float = 0.0
    status: str = "gap"  # gap, partial, good


class CoverageHeatmap(BaseModel):
    """Coverage Heatmap grid and outreach recommendations."""

    cells: list[CoverageCell] = Field(default_factory=list)
    total_gdb_entries: int = 0
    total_disclaimers: int = 0
    overall_coverage_pct: float = 0.0
    outreach_recommendations: list[str] = Field(default_factory=list)


# Type Aliases for backwards compatibility
CoverageStats = CoverageHeatmap


class OutreachRecommendation(BaseModel):
    """Outreach recommendation object."""

    priority: str = "MEDIUM"
    target_state: str = ""
    focus_domain: str = ""
    recommendation: str = ""
    gap_questions: int = 0


class OverlapSummary(BaseModel):
    """Summary counts of overlap triage statuses."""

    real_gap: int = 0
    near_miss: int = 0
    almost_covered: int = 0


class TrendDelta(BaseModel):
    """Summary of cluster trend movements across pipeline runs."""

    new_clusters: list[str] = Field(default_factory=list)
    growing_clusters: list[str] = Field(default_factory=list)
    shrinking_clusters: list[str] = Field(default_factory=list)
    resolved_clusters: list[str] = Field(default_factory=list)


class GapReport(BaseModel):
    """Final Gap Detector Report object."""

    id: str | None = Field(default=None, alias="_id")
    report_type: str = "weekly_gap_report"
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    start_date: datetime
    end_date: datetime
    period_days: int = 30
    total_disclaimers: int = 0
    total_disclaimers_analyzed: int = 0
    unique_queries: int = 0
    total_unique_queries: int = 0
    noise_queries_filtered: int = 0
    clusters_found: int = 0
    cluster_quality: dict[str, Any] = Field(default_factory=dict)
    total_clusters_found: int = 0
    top_gaps: list[ScoredCluster] = Field(default_factory=list)
    heatmap: CoverageHeatmap = Field(default_factory=CoverageHeatmap)
    outreach_recommendations: list[Any] = Field(default_factory=list)
    domains_with_gaps: list[str] = Field(default_factory=list)
    states_with_gaps: list[str] = Field(default_factory=list)
    overlap_summary: OverlapSummary = Field(default_factory=OverlapSummary)
    trend_delta: TrendDelta = Field(default_factory=TrendDelta)
    summary_markdown: str = ""
