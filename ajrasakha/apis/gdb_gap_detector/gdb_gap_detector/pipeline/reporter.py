from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from gdb_gap_detector.core import settings
from gdb_gap_detector.models import (
    CoverageCell,
    CoverageHeatmap,
    CoverageStats,
    DisclaimerLog,
    GapReport,
    GdbEntry,
    OutreachRecommendation,
    OverlapSummary,
    ScoredCluster,
    TrendDelta,
)

logger = logging.getLogger("gdb_gap_detector.reporter")


def assemble_gap_report(
    period_days: int,
    total_disclaimers: int,
    unique_queries: int,
    scored_clusters: list[ScoredCluster],
    heatmap_cells: list[CoverageCell],
    recommendations: list[OutreachRecommendation],
    overlap_counts: dict[str, int],
    trend_delta: TrendDelta | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> GapReport:
    """Assemble final GapReport model matching MongoDB gap_reports contract."""

    delta = trend_delta or TrendDelta()


    now = datetime.now(timezone.utc)
    e_date = end_date or now
    if e_date.tzinfo is None:
        e_date = e_date.replace(tzinfo=timezone.utc)

    s_date = start_date or (e_date - timedelta(days=period_days))
    if s_date.tzinfo is None:
        s_date = s_date.replace(tzinfo=timezone.utc)

    # Extract distinct domains and states with gaps
    domains_with_gaps = sorted(
        list({cell.domain for cell in heatmap_cells if cell.status == "gap"})
    )
    states_with_gaps = sorted(
        list({cell.state for cell in heatmap_cells if cell.status == "gap"})
    )

    overlap_summary = OverlapSummary(
        real_gap=overlap_counts.get("real_gap", 0),
        near_miss=overlap_counts.get("near_miss", 0),
        almost_covered=overlap_counts.get("almost_covered", 0),
    )

    report = GapReport(
        report_type="weekly_gap_report",
        period_days=period_days,
        start_date=s_date,
        end_date=e_date,
        generated_at=now,
        total_disclaimers=total_disclaimers,
        unique_queries=unique_queries,
        clusters_found=len(scored_clusters),
        top_gaps=scored_clusters,
        heatmap=CoverageHeatmap(cells=heatmap_cells),
        outreach_recommendations=recommendations,
        domains_with_gaps=domains_with_gaps,
        states_with_gaps=states_with_gaps,
        overlap_summary=overlap_summary,
        trend_delta=delta,
    )
    return report


def generate_markdown_report(report: GapReport) -> str:
    """Generate human-readable natural language Markdown report for agri & outreach teams."""

    md = []
    md.append("# 🌾 Weekly GDB Coverage Gap Report")
    md.append(f"**Generated:** {report.generated_at.strftime('%Y-%m-%d %H:%M UTC')} | "
              f"**Analysis Period:** {report.period_days} Days ({report.start_date.strftime('%Y-%m-%d')} to {report.end_date.strftime('%Y-%m-%d')})\n")

    md.append("## 📊 Executive Summary")
    md.append(f"- **Total Disclaimers Triggered:** {report.total_disclaimers}")
    md.append(f"- **Unique Unanswered Questions:** {report.unique_queries}")
    md.append(f"- **Semantic Clusters Found:** {report.clusters_found}")
    md.append(f"- **GDB Gap Triage Breakdown:** `{report.overlap_summary.real_gap} True Gaps` | "
              f"`{report.overlap_summary.near_miss} Near-Misses (Fastest Wins)` | "
              f"`{report.overlap_summary.almost_covered} Almost Covered`\n")

    if report.trend_delta.new_clusters or report.trend_delta.growing_clusters:
        md.append("### 📈 Trend Highlights")
        if report.trend_delta.new_clusters:
            md.append(f"- 🆕 **New Emerging Gaps:** {', '.join(report.trend_delta.new_clusters)}")
        if report.trend_delta.growing_clusters:
            md.append(f"- 📈 **Rapidly Growing Gaps (+30%):** {', '.join(report.trend_delta.growing_clusters)}")
        if report.trend_delta.resolved_clusters:
            md.append(f"- ✅ **Recently Resolved Gaps:** {', '.join(report.trend_delta.resolved_clusters)}")
        md.append("")

    md.append("## 🚨 Prioritized Top Coverage Gaps (Ranked by Farmer Demand)")
    md.append("| # | Priority | Score | Topic Cluster | Demand | Triage Status | Trend | Sample Query |")
    md.append("|---|---|---|---|---|---|---|---|")

    for idx, gap in enumerate(report.top_gaps[:20], 1):
        sample = (gap.sample_queries[0] if gap.sample_queries else "N/A").replace("|", "-")
        trend_icon = "🆕" if gap.trend_status == "NEW" else ("📈" if gap.trend_status == "GROWING" else "➡️")
        triage_badge = f"`{gap.triage_status}`"
        md.append(
            f"| {idx} | **{gap.priority_level}** | {gap.priority_score} | {gap.cluster_name} | "
            f"{gap.farmer_demand} | {triage_badge} | {trend_icon} {gap.trend_status} | {sample} |"
        )

    md.append("\n## 🗺️ Outreach Team Field Recommendations")
    if not report.outreach_recommendations:
        md.append("No critical regional coverage gaps identified.")
    else:
        for rec in report.outreach_recommendations[:10]:
            md.append(f"- **[{rec.priority}] {rec.target_state} - {rec.focus_domain}:** {rec.recommendation}")

    md.append("\n---\n*Report generated automatically by GDB Coverage Gap Detector Microservice.*")
    return "\n".join(md)


async def save_gap_report_to_db(
    db: AsyncIOMotorDatabase,
    report: GapReport,
    collection_name: str | None = None,
) -> str:
    """Idempotently save GapReport to MongoDB gap_reports collection using (start_date, end_date) upsert."""
    coll_name = collection_name or settings.gap_reports_collection
    collection = db[coll_name]

    doc_data = report.model_dump(by_alias=True)
    if "_id" in doc_data and doc_data["_id"] is None:
        del doc_data["_id"]

    query = {
        "report_type": report.report_type,
        "start_date": report.start_date,
        "end_date": report.end_date,
    }

    result = await collection.update_one(query, {"$set": doc_data}, upsert=True)
    logger.info(f"Saved GapReport to MongoDB collection '{coll_name}'. Upsert ID: {result.upserted_id}")
    return str(result.upserted_id or "updated")
