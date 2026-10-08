"""Turn raw clusters into scored ``GapCluster`` documents.

    gap_score = w_f * frequency + w_t * trend + w_p * farmers + w_g * geography   (0..1)

* frequency  - cluster size relative to the largest cluster in the run
* trend      - growth of weekly counts (recent half vs earlier half), squashed to 0..1
* farmers    - unique farmers relative to the largest cluster's unique farmers
* geography  - number of distinct states relative to the max across clusters

Weights come from ``Settings.gap_weights`` (sum to 1). Priority levels are cut at
fixed gap_score bands so they are comparable across weekly runs.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta

from backend.app.clock import utcnow
from backend.app.models import DisclaimerQuery, GapCluster, PriorityLevel
from backend.app.services.clustering import RawCluster


def priority_from_score(score: float) -> PriorityLevel:
    if score >= 0.75:
        return "CRITICAL"
    if score >= 0.55:
        return "HIGH"
    if score >= 0.35:
        return "MEDIUM"
    return "LOW"


def weekly_counts(timestamps: list[datetime], start: datetime, end: datetime) -> list[int]:
    """Counts per ISO week bucket from ``start`` to ``end`` (oldest -> newest)."""
    if end < start:
        return []
    n_weeks = max(1, (end - start).days // 7 + 1)
    counts = [0] * n_weeks
    for ts in timestamps:
        if ts < start or ts > end:
            continue
        counts[min((ts - start).days // 7, n_weeks - 1)] += 1
    return counts


def growth_rate(counts: list[int]) -> float:
    """Relative growth of the recent half of the window vs the earlier half.
    +1.0 = doubled, 0 = flat, -0.5 = halved. New clusters (no earlier data) -> +1.0."""
    if len(counts) < 2:
        return 0.0
    half = len(counts) // 2
    earlier, recent = sum(counts[:half]), sum(counts[half:])
    if earlier == 0:
        return 1.0 if recent > 0 else 0.0
    return (recent - earlier) / earlier


def trend_score(rate: float) -> float:
    """Squash growth rate into 0..1: -100 % -> 0, flat -> 0.5, +100 % -> 1."""
    return max(0.0, min(1.0, 0.5 + rate / 2.0))


def score_clusters(
    raw: list[RawCluster],
    queries: list[DisclaimerQuery],
    weights: dict[str, float],
    period_start: datetime,
    period_end: datetime,
    run_id: str,
    now: datetime | None = None,
) -> list[GapCluster]:
    now = now or utcnow()
    if not raw:
        return []

    sizes = [len(c.member_idx) for c in raw]
    farmers = [
        len({queries[i].farmer_key for i in c.member_idx if queries[i].farmer_key}) for c in raw
    ]
    states = [len({queries[i].state for i in c.member_idx if queries[i].state}) for c in raw]
    max_size, max_farmers, max_states = max(sizes), max(farmers) or 1, max(states) or 1

    out: list[GapCluster] = []
    for pos, c in enumerate(raw):
        members = [queries[i] for i in c.member_idx]
        ts = [q.timestamp for q in members]
        counts = weekly_counts(ts, period_start, period_end)
        rate = growth_rate(counts)
        f_score = sizes[pos] / max_size
        t_score = trend_score(rate)
        p_score = farmers[pos] / max_farmers
        g_score = states[pos] / max_states
        gap = (
            weights["frequency"] * f_score
            + weights["trend"] * t_score
            + weights["farmers"] * p_score
            + weights["geography"] * g_score
        )
        out.append(
            GapCluster(
                cluster_id=f"{run_id}-c{pos + 1:03d}",
                title=c.title,
                size=sizes[pos],
                representative_queries=[queries[i].query for i in c.representative_idx],
                keywords=c.keywords,
                crop_distribution=dict(Counter(q.crop for q in members if q.crop)),
                state_distribution=dict(Counter(q.state for q in members if q.state)),
                domain_distribution=dict(Counter(q.domain for q in members if q.domain)),
                language_distribution=dict(Counter(q.language for q in members if q.language)),
                unique_farmers=farmers[pos],
                first_seen=min(ts) if ts else None,
                last_seen=max(ts) if ts else None,
                weekly_counts=counts,
                growth_rate=round(rate, 3),
                frequency_score=round(f_score, 3),
                trend_score=round(t_score, 3),
                farmers_score=round(p_score, 3),
                geography_score=round(g_score, 3),
                gap_score=round(gap, 3),
                priority_level=priority_from_score(gap),
                created_at=now,
            )
        )
    out.sort(key=lambda c: (-c.gap_score, -c.size, c.title))
    return out


def period_bounds(queries: list[DisclaimerQuery], period_days: int, now: datetime | None = None):
    """[start, end] for the report: the last ``period_days`` ending at the newest query
    (so a stale sample still produces a sensible window)."""
    now = now or utcnow()
    end = max((q.timestamp for q in queries), default=now)
    end = min(end, now)
    return end - timedelta(days=period_days), end
