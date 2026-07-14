"""GDB Coverage Gap Detector: read-only analytics over farmer questions.

Finds clusters of farmer questions the GDB could not answer (the AI agent's
"static_dynamic" disclaimer path — see ai/ajrasakha/agents/plan_executor.py
should_expert_queue_reply / QuestionService.ts isDisclaimer tagging) and turns
them into a weekly, demand-ranked gap report plus a crop x state x domain
coverage heatmap.

Design notes:
- Read-only. Nothing here ever writes to the `questions` collection.
- No invented collections: "gap" questions are `tag == "static_dynamic"` +
  `source in (AJRASAKHA, WHATSAPP)` on the existing `questions` collection —
  there is no separate disclaimer log in this codebase.
- No new ML infra: clustering reuses whatever embedding function the caller
  already has loaded (acc_api's SentenceTransformer), and duplicate/overlap
  checking against the GDB reuses the existing golden-search API instead of
  standing up a second hybrid-search + reranker + NLI pipeline.
- This module has no import-time side effects (no Mongo/model construction),
  so it can be unit tested with plain Python fixtures.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import numpy as np

# --- The real "gap" signal on the existing `questions` collection ----------
# tag="static_dynamic" is set by the Node backend (QuestionService.ts) when
# only dynamic/non-knowledge-base tools ran and the 2-hour disclaimer was
# sent — i.e. the GDB had no answer. See ai/ajrasakha/agents/plan_executor.py
# should_expert_queue_reply for the AI-side trigger.
GAP_TAG = "static_dynamic"
GAP_SOURCES = ("AJRASAKHA", "WHATSAPP")
ANSWERED_STATUS = "closed"

DEFAULT_SIMILARITY_THRESHOLD = 0.82
DEFAULT_PERIOD_DAYS = 7
DEFAULT_LOOKBACK_DAYS = 30
DEFAULT_TOP_N_GAPS = 20

_UNKNOWN = "Unknown"

_STOPWORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to",
    "for", "of", "and", "or", "what", "why", "how", "when", "where", "which",
    "my", "i", "do", "does", "can", "should", "it", "this", "that", "with",
    "from", "not", "will", "get", "has", "have", "there", "any", "please",
    "help", "know", "want", "need",
})
_WORD_RE = re.compile(r"[a-zA-Z']+")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _question_text(doc: dict) -> str:
    return (doc.get("question") or doc.get("text") or "").strip()


def _crop_of(details: dict) -> str:
    return (details.get("normalised_crop") or details.get("crop") or _UNKNOWN).strip() or _UNKNOWN


def _state_of(details: dict) -> str:
    return (details.get("state") or _UNKNOWN).strip() or _UNKNOWN


def _domains_of(details: dict) -> list[str]:
    domains = details.get("domain")
    if isinstance(domains, list) and domains:
        cleaned = [str(d).strip() for d in domains if str(d).strip()]
        return cleaned or [_UNKNOWN]
    if isinstance(domains, str) and domains.strip():
        return [domains.strip()]
    return [_UNKNOWN]


# ---------------------------------------------------------------------------
# Mongo access (thin — logic below operates on plain dicts/arrays so it can
# be unit tested without a live database).
# ---------------------------------------------------------------------------


def gap_question_filter(since: datetime | None = None) -> dict:
    """Read-only Mongo filter for disclaimer-triggered farmer questions."""
    query: dict = {"tag": GAP_TAG, "source": {"$in": list(GAP_SOURCES)}}
    if since is not None:
        query["createdAt"] = {"$gte": since}
    return query


def fetch_gap_questions(collection, *, since: datetime | None = None) -> list[dict]:
    """Fetch unanswered disclaimer-triggered questions. Never writes."""
    cursor = collection.find(
        gap_question_filter(since),
        {"question": 1, "text": 1, "details": 1, "createdAt": 1},
    )
    return list(cursor)


def _crop_state_domain_group_id() -> dict:
    return {
        "crop": {"$ifNull": ["$details.normalised_crop", {"$ifNull": ["$details.crop", _UNKNOWN]}]},
        "state": {"$ifNull": ["$details.state", _UNKNOWN]},
        "domain": {"$ifNull": ["$details.domain", _UNKNOWN]},
    }


def _aggregate_counts_by_cell(collection, match: dict) -> dict[tuple[str, str, str], int]:
    pipeline = [
        {"$match": match},
        {"$unwind": {"path": "$details.domain", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": _crop_state_domain_group_id(), "count": {"$sum": 1}}},
    ]
    counts: dict[tuple[str, str, str], int] = {}
    for row in collection.aggregate(pipeline):
        cell = row["_id"]
        counts[(cell["crop"], cell["state"], cell["domain"])] = row["count"]
    return counts


def fetch_gdb_coverage_counts(collection) -> dict[tuple[str, str, str], int]:
    """All-time answered-question counts per (crop, state, domain) — the GDB."""
    return _aggregate_counts_by_cell(collection, {"status": ANSWERED_STATUS})


def fetch_all_time_gap_counts(collection) -> dict[tuple[str, str, str], int]:
    """All-time gap-question counts per cell, for the coverage heatmap."""
    return _aggregate_counts_by_cell(collection, gap_question_filter())


def fetch_gap_window_counts(
    collection, *, window_start: datetime, window_end: datetime
) -> dict[tuple[str, str, str], int]:
    """Gap-question counts per cell within [window_start, window_end)."""
    match = gap_question_filter(window_start)
    match["createdAt"]["$lt"] = window_end
    return _aggregate_counts_by_cell(collection, match)


# ---------------------------------------------------------------------------
# Coverage heatmap
# ---------------------------------------------------------------------------


@dataclass
class HeatmapCell:
    crop: str
    state: str
    domain: str
    gdb_count: int
    gap_count: int
    coverage_score: float
    status: str  # "good" | "partial" | "gap"


def _cell_status(coverage_score: float, gdb_count: int) -> str:
    if gdb_count == 0:
        return "gap"
    if coverage_score >= 0.7:
        return "good"
    return "partial"


def build_coverage_heatmap(
    gdb_counts: dict[tuple[str, str, str], int],
    gap_counts: dict[tuple[str, str, str], int],
) -> list[HeatmapCell]:
    """Combine GDB-answered vs gap counts into one crop x state x domain grid."""
    cells: list[HeatmapCell] = []
    for cell_key in set(gdb_counts) | set(gap_counts):
        crop, state, domain = cell_key
        gdb_count = gdb_counts.get(cell_key, 0)
        gap_count = gap_counts.get(cell_key, 0)
        total = gdb_count + gap_count
        coverage_score = (gdb_count / total) if total else 0.0
        cells.append(HeatmapCell(
            crop=crop,
            state=state,
            domain=domain,
            gdb_count=gdb_count,
            gap_count=gap_count,
            coverage_score=round(coverage_score, 4),
            status=_cell_status(coverage_score, gdb_count),
        ))
    return cells


# ---------------------------------------------------------------------------
# Clustering — greedy cosine-similarity clustering.
# ---------------------------------------------------------------------------


def _cosine_sim_matrix(vectors: np.ndarray) -> np.ndarray:
    norm = vectors / (np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9)
    return norm @ norm.T


def cluster_by_similarity(
    embeddings: np.ndarray,
    *,
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> list[list[int]]:
    """Greedy single-pass clustering by cosine similarity to the cluster seed.

    ponytail: O(n^2) similarity matrix — fine for a single (crop, state)
    partition of a 30-day gap window (tens to low hundreds of rows), not for
    the whole corpus. If a partition regularly exceeds a few thousand rows,
    swap in scikit-learn DBSCAN over the same embeddings.
    """
    n = embeddings.shape[0]
    if n == 0:
        return []
    sims = _cosine_sim_matrix(embeddings)
    assigned = [-1] * n
    clusters: list[list[int]] = []
    for i in range(n):
        if assigned[i] != -1:
            continue
        cluster = [i]
        assigned[i] = len(clusters)
        for j in range(i + 1, n):
            if assigned[j] == -1 and sims[i, j] >= threshold:
                cluster.append(j)
                assigned[j] = len(clusters)
        clusters.append(cluster)
    return clusters


def _most_common_domain(cluster_docs: list[dict]) -> str:
    counter: Counter[str] = Counter()
    for doc in cluster_docs:
        counter.update(_domains_of(doc.get("details") or {}))
    return counter.most_common(1)[0][0] if counter else _UNKNOWN


def _tokenize(text: str) -> set[str]:
    return {w.lower() for w in _WORD_RE.findall(text or "") if w.lower() not in _STOPWORDS and len(w) > 2}


def extract_missing_keywords(cluster_texts: list[str], representative_text: str, top_n: int = 5) -> list[str]:
    """Words common across the cluster's variations but absent from the
    representative question — the specifics a GDB content writer should add.
    """
    rep_words = _tokenize(representative_text)
    counter: Counter[str] = Counter()
    for text in cluster_texts:
        counter.update(_tokenize(text) - rep_words)
    return [word for word, _ in counter.most_common(top_n)]


def priority_score(cluster_size: int, growth_rate: float) -> float:
    """Demand x Deficit ranking: farmer demand (cluster size) boosted by how
    fast the gap is growing. A flat/shrinking gap still ranks by raw demand.
    """
    return round(cluster_size * (1.0 + max(growth_rate, 0.0)), 3)


def priority_level(score: float) -> str:
    if score >= 20:
        return "CRITICAL"
    if score >= 10:
        return "HIGH"
    if score >= 4:
        return "MEDIUM"
    return "LOW"


def _growth_rate(current: int, previous: int) -> float:
    if previous <= 0:
        return 1.0 if current > 0 else 0.0
    return (current - previous) / previous


@dataclass
class GapCluster:
    cluster_id: str
    representative_text: str
    size: int
    sample_questions: list[str]
    crop: str
    state: str
    domain: str
    keywords: list[str]
    growth_rate: float
    priority_score: float
    priority_level: str


def build_gap_clusters(
    gap_docs: list[dict],
    embeddings: np.ndarray,
    *,
    current_counts: dict[tuple[str, str, str], int],
    previous_counts: dict[tuple[str, str, str], int],
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    max_samples: int = 5,
) -> list[GapCluster]:
    """Partition gap questions by (crop, state), cluster within each partition
    by semantic similarity, and score every cluster by farmer demand x growth.
    """
    partitions: dict[tuple[str, str], list[int]] = {}
    for idx, doc in enumerate(gap_docs):
        details = doc.get("details") or {}
        key = (_crop_of(details), _state_of(details))
        partitions.setdefault(key, []).append(idx)

    clusters: list[GapCluster] = []
    for (crop, state), indices in partitions.items():
        partition_docs = [gap_docs[i] for i in indices]
        partition_embeddings = embeddings[indices]
        for local_cluster in cluster_by_similarity(partition_embeddings, threshold=similarity_threshold):
            cluster_docs = [partition_docs[i] for i in local_cluster]
            texts = [_question_text(d) for d in cluster_docs]
            representative = max(texts, key=len) if texts else ""
            domain = _most_common_domain(cluster_docs)

            cell_key = (crop, state, domain)
            current = current_counts.get(cell_key, 0)
            previous = previous_counts.get(cell_key, 0)
            growth = _growth_rate(current, previous)
            score = priority_score(len(cluster_docs), growth)

            clusters.append(GapCluster(
                cluster_id=f"{crop}|{state}|{domain}|{len(clusters)}",
                representative_text=representative,
                size=len(cluster_docs),
                sample_questions=texts[:max_samples],
                crop=crop,
                state=state,
                domain=domain,
                keywords=extract_missing_keywords(texts, representative),
                growth_rate=round(growth, 3),
                priority_score=score,
                priority_level=priority_level(score),
            ))

    clusters.sort(key=lambda c: c.priority_score, reverse=True)
    return clusters


# ---------------------------------------------------------------------------
# Outreach recommendations — cheap derivation from the heatmap, no LLM call.
# ---------------------------------------------------------------------------


@dataclass
class OutreachRecommendation:
    target_state: str
    focus_domain: str
    gap_questions: int
    recommendation: str
    priority: str


def build_outreach_recommendations(
    heatmap: list[HeatmapCell], *, top_n: int = 10
) -> list[OutreachRecommendation]:
    gap_cells = sorted(
        (c for c in heatmap if c.status in ("gap", "partial") and c.gap_count > 0),
        key=lambda c: c.gap_count,
        reverse=True,
    )[:top_n]
    return [
        OutreachRecommendation(
            target_state=c.state,
            focus_domain=c.domain,
            gap_questions=c.gap_count,
            recommendation=(
                f"{c.gap_count} unanswered {c.domain} questions for {c.crop} in {c.state} "
                f"({'no GDB coverage' if c.status == 'gap' else 'weak GDB coverage'}) — "
                "prioritize for content team / field visit."
            ),
            priority="HIGH" if c.status == "gap" else "MEDIUM",
        )
        for c in gap_cells
    ]


# ---------------------------------------------------------------------------
# Report orchestration
# ---------------------------------------------------------------------------


def build_gap_report(
    *,
    questions_collection,
    embed_fn: Callable[[list[str]], np.ndarray],
    period_days: int = DEFAULT_PERIOD_DAYS,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    top_n_gaps: int = DEFAULT_TOP_N_GAPS,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> dict[str, Any]:
    """Build one weekly gap report. Read-only against `questions_collection`.

    `embed_fn` takes a list of question texts and returns an (n, d) array of
    embeddings — inject the caller's already-loaded SentenceTransformer so
    this module never manages its own model.
    """
    now = _now()
    current_start = now - timedelta(days=period_days)
    previous_start = current_start - timedelta(days=period_days)
    lookback_start = now - timedelta(days=lookback_days)

    gap_docs = fetch_gap_questions(questions_collection, since=lookback_start)
    gdb_counts = fetch_gdb_coverage_counts(questions_collection)
    all_time_gap_counts = fetch_all_time_gap_counts(questions_collection)
    heatmap = build_coverage_heatmap(gdb_counts, all_time_gap_counts)

    current_counts = fetch_gap_window_counts(questions_collection, window_start=current_start, window_end=now)
    previous_counts = fetch_gap_window_counts(
        questions_collection, window_start=previous_start, window_end=current_start
    )

    if gap_docs:
        texts = [_question_text(d) for d in gap_docs]
        embeddings = np.asarray(embed_fn(texts))
        clusters = build_gap_clusters(
            gap_docs,
            embeddings,
            current_counts=current_counts,
            previous_counts=previous_counts,
            similarity_threshold=similarity_threshold,
        )
    else:
        clusters = []

    top_gaps = clusters[:top_n_gaps]
    outreach = build_outreach_recommendations(heatmap)

    domain_gap_totals: Counter[str] = Counter()
    state_gap_totals: Counter[str] = Counter()
    for cell in heatmap:
        if cell.status in ("gap", "partial"):
            domain_gap_totals[cell.domain] += cell.gap_count
            state_gap_totals[cell.state] += cell.gap_count

    return {
        "report_type": "weekly",
        "period_days": period_days,
        "start_date": current_start,
        "end_date": now,
        "generated_at": now,
        "total_disclaimers": len(gap_docs),
        "unique_queries": len({_question_text(d) for d in gap_docs}),
        "clusters_found": len(clusters),
        "top_gaps": [
            {
                "cluster_id": c.cluster_id,
                "cluster_name": c.representative_text,
                "size": c.size,
                "keywords": c.keywords,
                "sample_queries": c.sample_questions,
                "domains": [c.domain],
                "states": [c.state],
                "crop": c.crop,
                "growth_rate": c.growth_rate,
                "priority_score": c.priority_score,
                "farmer_demand": c.size,
                "recommended_action": f"Draft a GDB answer for {c.crop} / {c.domain} in {c.state}.",
                "priority_level": c.priority_level,
            }
            for c in top_gaps
        ],
        "coverage_stats": {
            "heatmap": [
                {
                    "crop": c.crop,
                    "state": c.state,
                    "domain": c.domain,
                    "gdb_count": c.gdb_count,
                    "disclaimer_count": c.gap_count,
                    "coverage_score": c.coverage_score,
                    "status": c.status,
                }
                for c in heatmap
            ],
            "total_combinations": len(heatmap),
            "covered": sum(1 for c in heatmap if c.status == "good"),
            "partial": sum(1 for c in heatmap if c.status == "partial"),
            "gaps": sum(1 for c in heatmap if c.status == "gap"),
        },
        "outreach_recommendations": [
            {
                "target_state": o.target_state,
                "focus_domain": o.focus_domain,
                "gap_questions": o.gap_questions,
                "recommendation": o.recommendation,
                "priority": o.priority,
            }
            for o in outreach
        ],
        "domains_with_gaps": [
            {"domain": domain, "gap_count": count}
            for domain, count in domain_gap_totals.most_common()
        ],
        "states_with_gaps": [
            {"state": state, "gap_count": count}
            for state, count in state_gap_totals.most_common()
        ],
    }
