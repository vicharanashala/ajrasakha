"""
Groups disclaimer-triggered questions into gap clusters and ranks them.
"""

from __future__ import annotations
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from sklearn.cluster import DBSCAN

from app.domain_matching import normalize_domain


@dataclass
class GapCluster:
    cluster_id: int
    crop: str
    state: str
    domain: str
    sample_questions: list[str]
    total_count: int
    count_last_7_days: int
    count_prior_7_days: int

    @property
    def growth_rate(self) -> float:
        # last 7 days vs the 7 before that. If prior week was 0, just
        # return last week's count instead of dividing by zero.
        if self.count_prior_7_days == 0:
            return float(self.count_last_7_days) if self.count_last_7_days > 0 else 0.0
        return self.count_last_7_days / self.count_prior_7_days

    def priority_score(self) -> float:
        # size matters more than growth, but a fast-growing small gap
        # should still be able to rank above a big flat one. growth is
        # capped at 3x so a tiny cluster can't jump to the top just
        # because it doubled from 1 to 2.
        return self.total_count * (1.0 + min(self.growth_rate, 3.0))


def cluster_gap_questions(
    questions: list[dict[str, Any]],
    eps: float = 0.3,
    min_samples: int = 2,
) -> list[GapCluster]:
    """
    Groups questions first by crop/state/domain (reliable metadata already
    on each doc), then within each group, sub-clusters by embedding
    similarity to separate different phrasings of the same question from
    genuinely different questions.

    Doing it in this order matters - if you cluster on embeddings first and
    guess crop/state/domain after, two unrelated topics with similar
    embeddings can get merged into one group and mislabeled. Grouping by
    the real metadata first avoids that.

    Uses DBSCAN instead of k-means since we don't know how many distinct
    phrasings exist in a group ahead of time, and DBSCAN handles one-off
    outlier questions as noise instead of forcing them into a cluster.

    Each question dict needs: question, crop, state, domain, embedding, created_at.
    """
    if not questions:
        return []

    now = datetime.now(timezone.utc)
    one_week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    partitions: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for q in questions:
        partitions[(q["crop"], q["state"], q["domain"])].append(q)

    clusters: list[GapCluster] = []
    next_cluster_id = 0

    for (crop, state, domain), members in partitions.items():
        if len(members) < min_samples:
            continue  # too few to call this a real pattern yet

        embeddings = np.array([m["embedding"] for m in members])
        labels = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine").fit_predict(embeddings)

        sub_groups: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for m, label in zip(members, labels):
            if label == -1:
                continue  # noise, not part of a repeated pattern
            sub_groups[label].append(m)

        for sub_members in sub_groups.values():
            count_last_7 = sum(1 for m in sub_members if m["created_at"] >= one_week_ago)
            count_prior_7 = sum(1 for m in sub_members if two_weeks_ago <= m["created_at"] < one_week_ago)

            clusters.append(GapCluster(
                cluster_id=next_cluster_id,
                crop=crop,
                state=state,
                domain=domain,
                sample_questions=[m["question"] for m in sub_members[:3]],
                total_count=len(sub_members),
                count_last_7_days=count_last_7,
                count_prior_7_days=count_prior_7,
            ))
            next_cluster_id += 1

    return clusters


def rank_gap_report(clusters: list[GapCluster], top_n: int = 20) -> list[GapCluster]:
    """Sorts clusters by priority_score, highest first, capped at top_n."""
    return sorted(clusters, key=lambda c: c.priority_score(), reverse=True)[:top_n]


def build_coverage_heatmap(
    clusters: list[GapCluster],
    gdb_entry_counts: dict[tuple[str, str], int],
) -> list[dict[str, Any]]:
    """
    Computes coverage % per domain+state: gdb_entries / (gdb_entries + gaps).

    Grouped by domain+state, not crop+state+domain - the real gdb_entries
    collection doesn't have a crop field, so that's the finest grain we
    can actually match against. The ranked gap report above still shows
    crop-level detail since that comes from a different collection that
    does have it.

    Domain names don't match exactly between the two collections
    (raw_queries says "Disease", gdb_entries says "Crop Disease" for the
    same thing) so we normalize before matching - see domain_matching.py.
    This is a best-effort fix, not a verified mapping, worth double
    checking with whoever owns the domain list. Display labels still use
    the original (non-normalized) wording from the gap side.
    """
    gap_counts: dict[tuple[str, str], int] = defaultdict(int)
    gap_display_domain: dict[tuple[str, str], str] = {}
    for c in clusters:
        key = (normalize_domain(c.domain), c.state)
        gap_counts[key] += c.total_count
        gap_display_domain.setdefault(key, c.domain)

    gdb_counts: dict[tuple[str, str], int] = defaultdict(int)
    gdb_display_domain: dict[tuple[str, str], str] = {}
    for (raw_domain, state), count in gdb_entry_counts.items():
        key = (normalize_domain(raw_domain), state)
        gdb_counts[key] += count
        gdb_display_domain.setdefault(key, raw_domain)

    all_pairs = set(gap_counts.keys()) | set(gdb_counts.keys())
    if not all_pairs:
        return []

    rows = []
    for key in all_pairs:
        _, state = key
        gaps = gap_counts.get(key, 0)
        gdb_entries = gdb_counts.get(key, 0)
        total = gaps + gdb_entries
        coverage_pct = round((gdb_entries / total) * 100, 1) if total > 0 else 0.0
        display_domain = gap_display_domain.get(key) or gdb_display_domain.get(key)
        rows.append({
            "domain": display_domain,
            "state": state,
            "gap_count": gaps,
            "gdb_entry_count": gdb_entries,
            "coverage_pct": coverage_pct,
            "gap_intensity": round(1 - (coverage_pct / 100), 3),  # for the heatmap color
        })

    return sorted(rows, key=lambda r: r["coverage_pct"])  # worst covered first
