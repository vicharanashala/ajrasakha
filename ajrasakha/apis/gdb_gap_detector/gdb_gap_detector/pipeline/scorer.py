import logging
from gdb_gap_detector.models import FlaggedEntry, GapCluster, ScoredCluster

logger = logging.getLogger("gdb_gap_detector.scorer")


def score_clusters(
    raw_clusters: list[GapCluster],
    flagged_entries: list[FlaggedEntry] | None = None,
) -> list[ScoredCluster]:
    """Stage 5: Score and prioritize gap clusters using formula:
    Priority = size * geographic_spread * (1 + growth_rate) * (1 + quality_boost + near_miss_boost)
    """
    flagged_domains = set()
    if flagged_entries:
        for fe in flagged_entries:
            if fe.domain:
                flagged_domains.add(fe.domain.strip().lower())

    scored_list: list[ScoredCluster] = []

    for cluster in raw_clusters:
        size = float(cluster.farmer_demand)
        geo_spread = float(max(len(cluster.states), 1))
        growth_rate = 0.0  # Default baseline, enriched by Stage 7 trend analysis

        # Quality Boost (0.5 if domain matches low-helpfulness flagged GDB entries)
        quality_boost = 0.0
        for dom in cluster.domains:
            if dom.strip().lower() in flagged_domains:
                quality_boost = 0.5
                break

        # Near-Miss Boost (0.3 if >= 30% of cluster queries are near-misses)
        near_miss_boost = 0.0
        if cluster.size > 0 and (cluster.near_miss_count / cluster.size) >= 0.3:
            near_miss_boost = 0.3

        # Formula
        priority_score = size * geo_spread * (1.0 + growth_rate) * (1.0 + quality_boost + near_miss_boost)
        priority_score = round(priority_score, 2)

        # Priority Level thresholds
        if priority_score >= 15.0:
            priority_level = "CRITICAL"
            recommended_action = "CRITICAL - Immediate GDB content creation & expert review required."
        elif priority_score >= 8.0:
            priority_level = "HIGH"
            recommended_action = "HIGH - Schedule for expert review this week."
        elif priority_score >= 4.0:
            priority_level = "MEDIUM"
            recommended_action = "MEDIUM - Queue for review in next iteration."
        else:
            priority_level = "LOW"
            recommended_action = "LOW - Monitor demand trend."

        # Dominant Triage Status
        if cluster.near_miss_count >= cluster.real_gap_count and cluster.near_miss_count >= cluster.almost_covered_count:
            triage_status = "near_miss"
        elif cluster.almost_covered_count >= cluster.real_gap_count:
            triage_status = "almost_covered"
        else:
            triage_status = "real_gap"

        scored_cluster = ScoredCluster(
            **cluster.model_dump(),
            growth_rate=growth_rate,
            priority_score=priority_score,
            priority_level=priority_level,
            triage_status=triage_status,
            recommended_action=recommended_action,
            trend_status="baseline",
        )
        scored_list.append(scored_cluster)

    # Sort descending by priority_score
    scored_list.sort(key=lambda c: c.priority_score, reverse=True)
    logger.info(f"Scored {len(scored_list)} clusters.")
    return scored_list
