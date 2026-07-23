from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime
from typing import Any

from .models import (
    GapStatistics,
    GapClusterSummary,
    WeeklyGapReport,
)

from .priority import rank_clusters

log = logging.getLogger("gdb_gap_detector.reporting")
# =============================================================================
# Statistics
# =============================================================================


def generate_gap_statistics(
    clusters: list[dict[str, Any]],
) -> GapStatistics:
    """
    Generate overall dashboard statistics.
    """

    total_gap_events = sum(
        c["size"]
        for c in clusters
    )

    average_priority = 0.0

    if clusters:

        average_priority = sum(
            c.get(
                "priority_score",
                0.0,
            )
            for c in clusters
        ) / len(clusters)

    return GapStatistics(

        generated_at=datetime.utcnow(),

        total_gap_events=total_gap_events,

        total_clusters=len(clusters),

        uncovered_queries=total_gap_events,

        average_priority_score=round(
            average_priority,
            2,
        ),
    )
# =============================================================================
# Weekly Report
# =============================================================================


def generate_weekly_gap_report(
    clusters: list[dict[str, Any]],
    top_n: int = 20,
) -> WeeklyGapReport:
    """
    Produce the weekly reviewer report.
    """

    ranked = rank_clusters(
        clusters,
    )

    summaries = []

    for cluster in ranked[:top_n]:

        summaries.append(

            GapClusterSummary(

                cluster_id=cluster["cluster_id"],

                state=cluster.get("state"),

                crop=cluster.get("crop"),

                domain=cluster.get("domain"),

                size=cluster.get("size", 0),

                priority_score=cluster.get(
                    "priority_score",
                    0,
                ),

                recommendation=cluster.get(
                    "recommendation",
                    "",
                ),
            )

        )

    return WeeklyGapReport(

        generated_at=datetime.utcnow(),

        total_gap_events=sum(
            c["size"]
            for c in ranked
        ),

        total_clusters=len(ranked),

        top_clusters=summaries,
    )
# =============================================================================
# State Summary
# =============================================================================


def summarize_by_state(
    clusters: list[dict[str, Any]],
) -> dict[str, int]:

    counter = Counter()

    for cluster in clusters:

        counter[
            cluster.get(
                "state",
                "Unknown",
            )
        ] += cluster.get(
            "size",
            0,
        )

    return dict(counter)
# =============================================================================
# Crop Summary
# =============================================================================


def summarize_by_crop(
    clusters,
):

    counter = Counter()

    for cluster in clusters:

        counter[
            cluster.get(
                "crop",
                "Unknown",
            )
        ] += cluster.get(
            "size",
            0,
        )

    return dict(counter)
# =============================================================================
# Domain Summary
# =============================================================================


def summarize_by_domain(
    clusters,
):

    counter = Counter()

    for cluster in clusters:

        domain = cluster.get(
            "domain",
        )

        if isinstance(domain, list):

            for d in domain:

                counter[d] += cluster.get(
                    "size",
                    0,
                )

        else:

            counter[
                domain
            ] += cluster.get(
                "size",
                0,
            )

    return dict(counter)
# =============================================================================
# Dashboard
# =============================================================================


def export_dashboard_payload(
    clusters,
):

    ranked = rank_clusters(
        clusters,
    )

    return {

        "generated_at":
            datetime.utcnow(),

        "statistics":
            generate_gap_statistics(
                ranked,
            ),

        "state_summary":
            summarize_by_state(
                ranked,
            ),

        "crop_summary":
            summarize_by_crop(
                ranked,
            ),

        "domain_summary":
            summarize_by_domain(
                ranked,
            ),
            
        "coverage_heatmap":
        build_coverage_heatmap(
            ranked,
        ),

        "top_clusters":
            ranked[:20],
    }
# =============================================================================
# JSON Export
# =============================================================================


def export_report_json(
    clusters,
):

    report = generate_weekly_gap_report(
        clusters,
    )

    return report.model_dump()
# =============================================================================
# Coverage Heatmap
# =============================================================================


def build_coverage_heatmap(
    clusters: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Build dashboard heatmap.

    Hierarchy

        State
            └── Crop
                    └── Domain

    Each cell contains coverage statistics.
    """

    heatmap: dict[str, Any] = {}

    for cluster in clusters:

        state = (
            cluster.get("state")
            or "Unknown"
        )

        crop = (
            cluster.get("crop")
            or "Unknown"
        )

        domains = cluster.get(
            "domain",
            [],
        )

        if not isinstance(domains, list):
            domains = [domains]

        if state not in heatmap:
            heatmap[state] = {}

        if crop not in heatmap[state]:
            heatmap[state][crop] = {}

        for domain in domains:

            if domain not in heatmap[state][crop]:

                heatmap[state][crop][domain] = {

                    "clusters": 0,

                    "gap_events": 0,

                    "average_priority": 0.0,

                    "average_coverage": 0.0,
                }

            cell = heatmap[state][crop][domain]

            cell["clusters"] += 1

            cell["gap_events"] += cluster.get(
                "size",
                0,
            )

            cell["average_priority"] += cluster.get(
                "priority_score",
                0.0,
            )

            cell["average_coverage"] += cluster.get(
                "coverage_score",
                0.0,
            )

    #
    # Compute averages
    #

    for state in heatmap.values():

        for crop in state.values():

            for cell in crop.values():

                count = max(
                    cell["clusters"],
                    1,
                )

                cell["average_priority"] = round(
                    cell["average_priority"] / count,
                    2,
                )

                cell["average_coverage"] = round(
                    cell["average_coverage"] / count,
                    2,
                )

    return heatmap