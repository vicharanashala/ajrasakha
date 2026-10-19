"""Weekly GDB Gap Report job (Project 6).

    python -m pipeline.run_gap_report [--period-days N] [--dry-run]

Steps
  1. read disclaimer-triggered queries from the seed DBs (read-only) and upsert the
     normalised copies into ace_insights.disclaimer_queries
  2. embed (cached), cluster, score -> ace_insights.clusters
  3. coverage heatmap vs the GDB -> ace_insights.coverage_heatmap
  4. assemble the report -> ace_insights.gap_reports
  5. record the run -> ace_insights.job_runs

Only aggregate numbers are printed (no farmer identifiers, no query text).
"""

from __future__ import annotations

import logging
import sys
import time
import uuid
from datetime import UTC, datetime

import typer
from pymongo.database import Database
from rich.console import Console
from rich.table import Table

from backend.app.clock import utcnow
from backend.app.config import Settings, get_settings
from backend.app.db import (
    COL_CLUSTERS,
    COL_DISCLAIMERS,
    COL_GAP_REPORTS,
    COL_HEATMAP,
    COL_JOB_RUNS,
    ensure_indexes,
    get_output_db,
    get_source_db,
)
from backend.app.ingest import load_disclaimer_queries, load_gdb_entries
from backend.app.models import DisclaimerQuery, GapReport, GdbEntry
from backend.app.services.clustering import cluster_queries
from backend.app.services.coverage import build_heatmap
from backend.app.services.embeddings import embed_texts
from backend.app.services.gap_report import build_report
from backend.app.services.gap_scoring import period_bounds, score_clusters

log = logging.getLogger("pipeline.gap_report")

# Cluster titles / keywords can be Hindi etc.; the Windows console defaults to cp1252.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")
cli = typer.Typer(add_completion=False)


def run_gap_pipeline(
    queries: list[DisclaimerQuery],
    entries: list[GdbEntry],
    settings: Settings,
    out_db: Database | None,
    period_days: int | None = None,
    now: datetime | None = None,
) -> GapReport:
    """Pure orchestration; ``out_db=None`` means dry-run (nothing written)."""
    now = now or utcnow()
    period_days = period_days or settings.gap_report_period_days or 30
    run_id = now.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:6]

    start, end = period_bounds(queries, period_days, now)
    windowed = [q for q in queries if start <= q.timestamp <= end]

    # Not every unanswered query is evidence of a missing GDB entry: off-topic
    # questions ("how do I earn money fast") and synthetic test traffic would
    # otherwise inflate the gap counts. Both are excluded and reported separately.
    excluded_domains = settings.excluded_domain_set
    excluded_channels = settings.excluded_channel_set
    n_off_topic = sum(1 for q in windowed if q.domain in excluded_domains)
    n_test = sum(
        1
        for q in windowed
        if q.domain not in excluded_domains and (q.channel or "").lower() in excluded_channels
    )
    in_window = [
        q
        for q in windowed
        if q.domain not in excluded_domains and (q.channel or "").lower() not in excluded_channels
    ]
    log.info(
        "run %s: %d disclaimer queries, %d in the %d-day window, %d analysed "
        "(excluded %d off-topic, %d test traffic)",
        run_id,
        len(queries),
        len(windowed),
        period_days,
        len(in_window),
        n_off_topic,
        n_test,
    )

    embeddings = embed_texts([q.query for q in in_window], cache_db=out_db)
    raw = cluster_queries(
        in_window,
        embeddings,
        distance_threshold=settings.cluster_distance_threshold,
        min_cluster_size=settings.min_cluster_size or 2,
    )
    clusters = score_clusters(raw, in_window, settings.gap_weights, start, end, run_id, now)
    coverage = build_heatmap(in_window, entries, settings.coverage_good, settings.coverage_partial)
    # Same coverage model at crop granularity, for the crop x state x domain view.
    crop_coverage = build_heatmap(
        in_window, entries, settings.coverage_good, settings.coverage_partial, by_crop=True
    )
    report = build_report(
        run_id,
        in_window,
        clusters,
        coverage,
        period_days,
        start,
        end,
        settings.gap_top_n,
        now,
        crop_coverage=crop_coverage,
        excluded_non_agricultural=n_off_topic,
        excluded_test_traffic=n_test,
    )

    if out_db is not None:
        ensure_indexes(out_db)
        for q in queries:  # keep the full normalised set, not just the window
            out_db[COL_DISCLAIMERS].update_one(
                {"source_ref": q.source_ref}, {"$set": q.model_dump()}, upsert=True
            )
        if clusters:
            out_db[COL_CLUSTERS].insert_many(
                [{"run_id": run_id, **c.model_dump()} for c in clusters]
            )
        out_db[COL_HEATMAP].insert_one(
            {
                "run_id": run_id,
                "generated_at": now,
                "dimension": "domain_state",
                **coverage.model_dump(),
            }
        )
        out_db[COL_HEATMAP].insert_one(
            {
                "run_id": run_id,
                "generated_at": now,
                "dimension": "domain_state_crop",
                **crop_coverage.model_dump(),
            }
        )
        out_db[COL_GAP_REPORTS].insert_one(report.model_dump())
    return report


def _print_summary(report: GapReport, con: Console) -> None:
    con.print(
        f"[bold]run[/] {report.run_id}  window {report.start_date:%Y-%m-%d} -> {report.end_date:%Y-%m-%d}"
        f"  disclaimers={report.total_disclaimers} unique={report.unique_queries} clusters={report.clusters_found}"
    )
    cov = report.coverage_stats
    con.print(
        f"coverage cells={cov.total_combinations} good={cov.covered} partial={cov.partial} gap={cov.gaps}"
        f"  (excluded {report.excluded_non_agricultural} off-topic, "
        f"{report.excluded_test_traffic} test)"
    )
    t = Table(title=f"Top {len(report.top_gaps)} gaps")
    for col in ("#", "cluster", "size", "farmers", "growth", "score", "priority", "states"):
        t.add_column(col)
    for i, g in enumerate(report.top_gaps, 1):
        t.add_row(
            str(i),
            g.cluster_name,
            str(g.size),
            str(g.farmer_demand),
            f"{g.growth_rate:+.0%}",
            f"{g.priority_score:.0f}",
            g.priority_level,
            ", ".join(g.states[:3]),
        )
    con.print(t)
    if report.outreach_recommendations:
        t2 = Table(title="Outreach recommendations")
        for col in ("state", "domain", "gap queries", "priority"):
            t2.add_column(col)
        for r in report.outreach_recommendations:
            t2.add_row(r.target_state, r.focus_domain, str(r.gap_questions), r.priority)
        con.print(t2)


@cli.command()
def main(
    period_days: int | None = typer.Option(None, help="override the profile's report window"),
    dry_run: bool = typer.Option(False, help="compute but write nothing to Mongo"),
) -> None:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level, format="%(levelname)s %(name)s: %(message)s")
    for noisy in ("httpx", "httpcore", "huggingface_hub", "transformers", "sentence_transformers"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    con = Console()
    started = time.time()

    fb_db = get_source_db(settings.source_db_feedback)
    gap_db = get_source_db(settings.source_db_gap)
    queries = load_disclaimer_queries(fb_db, gap_db)
    entries = load_gdb_entries(fb_db)
    out_db = None if dry_run else get_output_db()

    report = run_gap_pipeline(queries, entries, settings, out_db, period_days)
    _print_summary(report, con)

    if out_db is not None:
        out_db[COL_JOB_RUNS].insert_one(
            {
                "job": "gap_report",
                "run_id": report.run_id,
                "started_at": datetime.fromtimestamp(started, UTC).replace(tzinfo=None),
                "finished_at": utcnow(),
                "duration_s": round(time.time() - started, 1),
                "inputs": {"disclaimers": len(queries), "gdb_entries": len(entries)},
                "outputs": {
                    "clusters": report.clusters_found,
                    "heatmap_cells": report.coverage_stats.total_combinations,
                },
                "profile": settings.ace_profile,
            }
        )
    con.print(f"done in {time.time() - started:.1f}s{' (dry run)' if dry_run else ''}")


if __name__ == "__main__":
    cli()
