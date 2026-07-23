from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

log = logging.getLogger("gdb_gap_detector.priority")


# =============================================================================
# Weight Configuration
# =============================================================================

WEIGHTS = {

    "farmer_demand": 0.30,

    "growth": 0.20,

    "spread": 0.15,

    "coverage": 0.15,

    "recency": 0.10,

    "backlog": 0.10,
}
# =============================================================================
# Public API
# =============================================================================


def calculate_priority(
    cluster: dict[str, Any],
) -> float:
    """
    Compute overall priority score.

    Returns

        0–100
    """

    farmer = _score_farmer_demand(
        cluster,
    )

    growth = _score_growth(
        cluster,
    )

    spread = _score_spread(
        cluster,
    )

    coverage = _score_coverage(
        cluster,
    )

    recency = _score_recency(
        cluster,
    )

    backlog = _score_backlog(
        cluster,
    )

    score = (

        farmer * WEIGHTS["farmer_demand"]

        +

        growth * WEIGHTS["growth"]

        +

        spread * WEIGHTS["spread"]

        +

        coverage * WEIGHTS["coverage"]

        +

        recency * WEIGHTS["recency"]

        +

        backlog * WEIGHTS["backlog"]

    )

    return round(
        score,
        2,
    )
# =============================================================================
# Farmer Demand
# =============================================================================


def _score_farmer_demand(
    cluster: dict[str, Any],
) -> float:
    """
    Score based on the number of unanswered
    farmer queries in the cluster.

    Saturates at 100.
    """

    size = cluster.get("size", 0)

    #
    # Linear saturation.
    # Tune threshold later.
    #

    return min(
        size * 2,
        100.0,
    )
# =============================================================================
# Growth
# =============================================================================


def _score_growth(
    cluster: dict[str, Any],
) -> float:
    """
    Score clusters that are rapidly growing.

    growth_rate should already be computed
    during weekly clustering.
    """

    growth = cluster.get(
        "growth_rate",
        0.0,
    )

    return max(
        0.0,
        min(
            growth * 100,
            100.0,
        ),
    )
# =============================================================================
# Geographic Spread
# =============================================================================


def _score_spread(
    cluster: dict[str, Any],
) -> float:
    """
    Clusters affecting multiple districts
    deserve higher priority.
    """

    districts = cluster.get(
        "districts",
        [],
    )

    return min(
        len(districts) * 10,
        100.0,
    )
# =============================================================================
# Coverage
# =============================================================================


def _score_coverage(
    cluster: dict[str, Any],
) -> float:
    """
    Lower GDB coverage
    → higher priority.
    """

    coverage = cluster.get(
        "coverage_score",
        0.0,
    )

    return (
        1.0 - coverage
    ) * 100
# =============================================================================
# Recency
# =============================================================================


def _score_recency(
    cluster: dict[str, Any],
) -> float:
    """
    Recent unanswered questions are
    more valuable than very old ones.
    """

    updated = cluster.get(
        "last_seen",
    )

    if updated is None:
        return 50.0

    days = (
        datetime.utcnow() - updated
    ).days

    score = 100 - (days * 3)

    return max(
        score,
        0.0,
    )
# =============================================================================
# Reviewer Backlog
# =============================================================================


def _score_backlog(
    cluster: dict[str, Any],
) -> float:
    """
    Penalize clusters already under review.
    """

    pending = cluster.get(
        "pending_reviews",
        0,
    )

    return max(
        100 - pending * 5,
        0,
    )
# =============================================================================
# Ranking
# =============================================================================


def rank_clusters(
    clusters: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Compute priority for every cluster
    and return highest priority first.
    """

    ranked = []

    for cluster in clusters:

        cluster["priority_score"] = (
            calculate_priority(
                cluster
            )
        )

        ranked.append(cluster)

    ranked.sort(
        key=lambda c: c["priority_score"],
        reverse=True,
    )

    return ranked
