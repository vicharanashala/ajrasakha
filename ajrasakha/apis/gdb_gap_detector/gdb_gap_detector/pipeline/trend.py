from datetime import datetime, timezone
import logging
from typing import Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from gdb_gap_detector.core import settings
from gdb_gap_detector.models import ScoredCluster, TrendDelta

logger = logging.getLogger("gdb_gap_detector.trend")


async def calculate_trend_deltas(
    db: AsyncIOMotorDatabase,
    current_clusters: list[ScoredCluster],
    current_start_date: datetime,
    gap_reports_collection: str | None = None,
) -> tuple[list[ScoredCluster], TrendDelta]:
    """Stage 7: Compare current clusters against previous gap report to compute trend deltas."""
    coll_name = gap_reports_collection or settings.gap_reports_collection
    collection = db[coll_name]

    # Query most recent previous report
    query = {
        "report_type": "weekly_gap_report",
        "end_date": {"$lt": current_start_date},
    }
    previous_report_doc = await collection.find_one(query, sort=[("end_date", -1)])

    trend_delta = TrendDelta()

    if not previous_report_doc:
        logger.info("No prior gap report found in DB (First Run Baseline).")
        for cluster in current_clusters:
            cluster.trend_status = "baseline"
        return current_clusters, trend_delta

    # Extract previous top gaps
    prev_gaps: list[dict[str, Any]] = previous_report_doc.get("top_gaps", [])
    prev_cluster_map: dict[str, float] = {}

    for p in prev_gaps:
        c_id = p.get("cluster_id") or p.get("cluster_name")
        score = p.get("priority_score", 0.0)
        if c_id:
            prev_cluster_map[c_id] = score

    current_cluster_ids = set()

    # Compare current clusters against previous
    for cluster in current_clusters:
        c_id = cluster.cluster_id
        current_cluster_ids.add(c_id)

        if c_id not in prev_cluster_map and cluster.cluster_name not in prev_cluster_map:
            # NEW Cluster
            cluster.trend_status = "NEW"
            cluster.growth_rate = 1.0  # 100% growth
            trend_delta.new_clusters.append(cluster.cluster_name)
        else:
            prev_score = prev_cluster_map.get(c_id) or prev_cluster_map.get(cluster.cluster_name, 1.0)
            if prev_score <= 0:
                prev_score = 1.0

            growth = (cluster.priority_score - prev_score) / prev_score
            cluster.growth_rate = round(growth, 2)

            if growth >= 0.30:
                cluster.trend_status = "GROWING"
                trend_delta.growing_clusters.append(cluster.cluster_name)
            elif growth <= -0.30:
                cluster.trend_status = "SHRINKING"
                trend_delta.shrinking_clusters.append(cluster.cluster_name)
            else:
                cluster.trend_status = "STABLE"

            # Re-calculate priority score with growth rate
            cluster.priority_score = round(
                cluster.priority_score * (1.0 + max(cluster.growth_rate, 0.0)), 2
            )

    # Check for RESOLVED clusters (were in previous top_gaps, but absent now)
    for prev_id in prev_cluster_map:
        if prev_id not in current_cluster_ids and not any(c.cluster_name == prev_id for c in current_clusters):
            trend_delta.resolved_clusters.append(prev_id)

    # Re-sort clusters by updated priority score
    current_clusters.sort(key=lambda c: c.priority_score, reverse=True)
    logger.info(
        f"Trend Deltas: {len(trend_delta.new_clusters)} NEW, "
        f"{len(trend_delta.growing_clusters)} GROWING, "
        f"{len(trend_delta.shrinking_clusters)} SHRINKING, "
        f"{len(trend_delta.resolved_clusters)} RESOLVED."
    )
    return current_clusters, trend_delta
