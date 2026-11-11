"""Assemble the weekly GDB Gap Report from scored clusters + coverage heatmap.

Output shape mirrors the seed ``farmer_feedback.gap_reports`` documents so anyone
already reading those can consume ours unchanged.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime

from backend.app.clock import utcnow
from backend.app.models import (
    CoverageStats,
    DisclaimerQuery,
    GapCluster,
    GapReport,
    OutreachRecommendation,
    PriorityLevel,
    TopGap,
)
from backend.app.services.coverage import gaps_by


def recommended_action(cluster: GapCluster) -> str:
    crop = next(iter(cluster.crop_distribution), None)
    domain = next(iter(cluster.domain_distribution), None) or "General Agriculture"
    top_states = ", ".join(k for k, _ in Counter(cluster.state_distribution).most_common(2))
    subject = f"{crop} {domain.lower()}" if crop else domain.lower()
    where = f" for {top_states}" if top_states else ""
    if cluster.growth_rate >= 0.5:
        urgency = "Rising demand - "
    elif cluster.priority_level in ("CRITICAL", "HIGH"):
        urgency = "High demand - "
    else:
        urgency = ""
    return (
        f"{urgency}commission {max(1, cluster.size // 5)} expert-validated GDB entr"
        f"{'y' if cluster.size // 5 <= 1 else 'ies'} on {subject}{where}; "
        f"{cluster.unique_farmers} farmer(s) asked {cluster.size} time(s)."
    )


def to_top_gap(c: GapCluster) -> TopGap:
    return TopGap(
        cluster_id=c.cluster_id,
        cluster_name=c.title,
        size=c.size,
        keywords=c.keywords,
        sample_queries=c.representative_queries,
        domains=[k for k, _ in Counter(c.domain_distribution).most_common()],
        states=[k for k, _ in Counter(c.state_distribution).most_common()],
        crops=[k for k, _ in Counter(c.crop_distribution).most_common()],
        growth_rate=c.growth_rate,
        priority_score=round(c.gap_score * 100, 1),
        first_seen=c.first_seen,
        last_seen=c.last_seen,
        farmer_demand=c.unique_farmers or c.size,
        recommended_action=recommended_action(c),
        priority_level=c.priority_level,
    )


def outreach_recommendations(
    coverage: CoverageStats, clusters: list[GapCluster], top_n: int = 10
) -> list[OutreachRecommendation]:
    """One recommendation per (state, domain) gap cell, ranked by disclaimer volume."""
    gap_cells = [c for c in coverage.heatmap if c.status == "gap" and c.state != "Unknown"]
    # aggregate crop-level cells up to (state, domain)
    agg: Counter = Counter()
    for cell in gap_cells:
        agg[(cell.state, cell.domain)] += cell.disclaimer_count
    if not agg:
        return []
    max_n = max(agg.values())
    out: list[OutreachRecommendation] = []
    for (state, domain), n in agg.most_common(top_n):
        share = n / max_n
        prio: PriorityLevel = (
            "CRITICAL"
            if share >= 0.75
            else "HIGH"
            if share >= 0.5
            else "MEDIUM"
            if share >= 0.25
            else "LOW"
        )
        related = [
            c.title
            for c in clusters
            if state in c.state_distribution and domain in c.domain_distribution
        ][:2]
        topic = f" (e.g. {'; '.join(related)})" if related else ""
        out.append(
            OutreachRecommendation(
                target_state=state,
                focus_domain=domain,
                gap_questions=n,
                recommendation=(
                    f"Plan field engagement in {state} on {domain.lower()}{topic}: "
                    f"{n} unanswered farmer queries with no matching GDB entry."
                ),
                priority=prio,
            )
        )
    return out


def build_report(
    run_id: str,
    queries: list[DisclaimerQuery],
    clusters: list[GapCluster],
    coverage: CoverageStats,
    period_days: int,
    start: datetime,
    end: datetime,
    top_n: int,
    now: datetime | None = None,
    crop_coverage: CoverageStats | None = None,
    excluded_non_agricultural: int = 0,
    excluded_test_traffic: int = 0,
) -> GapReport:
    now = now or utcnow()
    return GapReport(
        run_id=run_id,
        period_days=period_days,
        start_date=start,
        end_date=end,
        generated_at=now,
        total_disclaimers=len(queries),
        unique_queries=len({q.query_normalized for q in queries}),
        clusters_found=len(clusters),
        excluded_non_agricultural=excluded_non_agricultural,
        excluded_test_traffic=excluded_test_traffic,
        top_gaps=[to_top_gap(c) for c in clusters[:top_n]],
        coverage_stats=coverage,
        outreach_recommendations=outreach_recommendations(coverage, clusters),
        domains_with_gaps=gaps_by(coverage.heatmap, "domain"),
        states_with_gaps=[r for r in gaps_by(coverage.heatmap, "state") if r["state"] != "Unknown"],
        crops_with_gaps=(
            [r for r in gaps_by(crop_coverage.heatmap, "crop") if r["crop"]]
            if crop_coverage
            else []
        ),
        crop_coverage=crop_coverage,
    )
