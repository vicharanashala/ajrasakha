from datetime import datetime, timezone
import logging
from motor.motor_asyncio import AsyncIOMotorDatabase
from gdb_gap_detector.pipeline.cluster_quality import evaluate_cluster_quality

from gdb_gap_detector.core.config import settings
from gdb_gap_detector.models import FlaggedEntry, GapReport, GdbEntry
from gdb_gap_detector.pipeline.clusterer import cluster_embeddings
from gdb_gap_detector.pipeline.coverage import calculate_coverage_heatmap
from gdb_gap_detector.pipeline.embedder import get_embedder
from gdb_gap_detector.pipeline.extractor import extract_disclaimer_queries
from gdb_gap_detector.pipeline.overlap import triage_query_overlaps
from gdb_gap_detector.pipeline.reporter import (
    assemble_gap_report,
    save_gap_report_to_db,
)
from gdb_gap_detector.pipeline.scorer import score_clusters
from gdb_gap_detector.pipeline.trend import calculate_trend_deltas

logger = logging.getLogger("gdb_gap_detector.services.pipeline")


async def run_full_pipeline(
    db: AsyncIOMotorDatabase,
    period_days: int = 30,
    write_to_db: bool = False,
) -> GapReport:
    """Service function orchestrating the multi-stage GDB Gap Detection pipeline.

    Stages:
    1. Extractor & Noise Filter
    2. Embedder (Sentence Transformers)
    3. Overlap Triage Model
    4. HDBSCAN Clusterer & Keyword Extraction
    5. Priority Scorer & Level Assigner
    6. Coverage Heatmap & Recommendations
    7. Trend Deltas
    8. Report Assembly & DB Persistence
    """
    logger.info(f"Starting GDB Gap Detector pipeline (period_days={period_days})")

    # Stage 1: Extractor & Noise Filter
    disclaimer_logs, unique_map = await extract_disclaimer_queries(db, period_days=period_days)

    unique_hashes = list(unique_map.keys())
    queries = [unique_map[h]["query"] for h in unique_hashes]

    # Stage 2: Embedder
    embeddings = get_embedder(queries)

    # Stage 3: Overlap Triage Model
    triage_map, summary_counts = triage_query_overlaps(unique_map)

    # Stage 4: HDBSCAN Clusterer
    raw_clusters, cluster_labels = cluster_embeddings(
        unique_hashes,
        unique_map,
        embeddings,
        triage_map,
        return_labels=True,
    )

    cluster_quality = evaluate_cluster_quality(
        embeddings,
        cluster_labels,
    )
    # Fetch Flagged Entries for Quality Boost
    flagged_cursor = db[settings.flagged_entries_collection].find({})
    flagged_entries = [
        FlaggedEntry(**{**doc, "_id": str(doc["_id"])}) async for doc in flagged_cursor
    ]

    # Stage 5: Scorer
    scored_clusters = score_clusters(raw_clusters, flagged_entries)

    # Fetch GDB Entries for Coverage Matrix
    gdb_cursor = db[settings.gdb_entries_collection].find({})
    gdb_entries = [
        GdbEntry(**{**doc, "_id": str(doc["_id"])}) async for doc in gdb_cursor
    ]

    # Stage 6: Coverage Heatmap & Outreach Recommendations
    heatmap_cells, recommendations = calculate_coverage_heatmap(gdb_entries, disclaimer_logs)

    # Stage 7: Trend Deltas
    start_date = datetime.now(timezone.utc)
    scored_clusters, trend_delta = await calculate_trend_deltas(db, scored_clusters, start_date)

    # Stage 8: Assemble GapReport
    report = assemble_gap_report(
        period_days=period_days,
        total_disclaimers=len(disclaimer_logs),
        unique_queries=len(unique_map),
        scored_clusters=scored_clusters,
        heatmap_cells=heatmap_cells,
        recommendations=recommendations,
        overlap_counts=summary_counts,
        trend_delta=trend_delta,
        cluster_quality=cluster_quality,
    )

    if write_to_db:
        await save_gap_report_to_db(db, report)
        logger.info("Pipeline report successfully written to MongoDB.")

    return report
