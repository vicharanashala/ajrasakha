"""GDB Coverage Gap Detector
=====================================
Analytics module for identifying coverage gaps in the Golden Dataset / GDB.

Flow:
  fetch disclaimer queries
  → normalize metadata
  → generate semantic embeddings
  → semantic clustering (AgglomerativeClustering with cosine distance)
  → demand analysis (current 7-day vs previous 7-day window)
  → growth analysis
  → priority ranking
  → Top-20 gaps
  → coverage analysis (crop × state × domain)
  → outreach recommendations

All heavy operations are done on-demand.  A simple 5-minute in-memory cache
avoids re-running the full pipeline on every rapid re-request.
"""

from __future__ import annotations

import logging
import re
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Callable, Optional

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.preprocessing import normalize

log = logging.getLogger("gdb_gap_detector")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DISCLAIMER_TAG = "static_dynamic"

PRIORITY_LEVELS = {
    "CRITICAL": 4,
    "HIGH": 3,
    "MEDIUM": 2,
    "LOW": 1,
}

COVERAGE_LEVELS = {
    "STRONG": "STRONG",
    "PARTIAL": "PARTIAL",
    "GAP": "GAP",
}

TOP_N = 20
CLUSTER_DISTANCE_THRESHOLD = 0.35   # cosine distance; tune as needed
MIN_CLUSTER_QUESTIONS = 1           # include even singletons in the gap list
CURRENT_WINDOW_DAYS = 7
PREV_WINDOW_DAYS = 7

# ---------------------------------------------------------------------------
# Lightweight 5-minute in-memory cache
# ---------------------------------------------------------------------------

_CACHE: dict = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


def _cache_get(key: str):
    entry = _CACHE.get(key)
    if entry and (time.time() - entry["ts"]) < _CACHE_TTL_SECONDS:
        return entry["value"]
    return None


def _cache_set(key: str, value):
    _CACHE[key] = {"value": value, "ts": time.time()}


def invalidate_cache():
    """Forcibly clear the in-memory cache (useful for testing / manual refresh)."""
    _CACHE.clear()


# ---------------------------------------------------------------------------
# Step 1 – Fetch disclaimer-triggered queries from MongoDB
# ---------------------------------------------------------------------------

def fetch_disclaimer_queries(collection) -> list[dict]:
    """Return all questions with tag='static_dynamic' from the questions collection.

    Fields projected: question, details (state/district/crop/domain), source,
    createdAt, tag.
    """
    cursor = collection.find(
        {"tag": DISCLAIMER_TAG},
        {
            "_id": 1,
            "question": 1,
            "details": 1,
            "source": 1,
            "createdAt": 1,
            "tag": 1,
        },
    )
    return list(cursor)


# ---------------------------------------------------------------------------
# Step 2 – Normalise metadata from raw question documents
# ---------------------------------------------------------------------------

def _str(val) -> str:
    if val is None:
        return ""
    if isinstance(val, dict):
        # ICropRef shape: {"name": "...", ...}
        return str(val.get("name", "")).strip()
    return str(val).strip()


def normalize_query(doc: dict) -> dict:
    """Flatten a question document into a uniform dict for analysis."""
    details = doc.get("details") or {}
    crop_raw = details.get("crop")
    crop = _str(crop_raw)

    state = _str(details.get("state"))
    district = _str(details.get("district"))

    # domain may be a list or a string
    domain_raw = details.get("domain")
    if isinstance(domain_raw, list):
        domain = ", ".join(str(d) for d in domain_raw if d)
    else:
        domain = _str(domain_raw)

    created_at: Optional[datetime] = doc.get("createdAt")
    if isinstance(created_at, (int, float)):
        created_at = datetime.utcfromtimestamp(created_at).replace(tzinfo=timezone.utc)
    elif isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            log.warning("Ignoring unparseable question createdAt value: %r", created_at)
            created_at = None
    elif created_at is not None and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    return {
        "id": str(doc["_id"]),
        "question": _str(doc.get("question")),
        "source": _str(doc.get("source")),
        "crop": crop,
        "state": state,
        "district": district,
        "domain": domain,
        "created_at": created_at,
    }


def normalize_queries(docs: list[dict]) -> list[dict]:
    return [normalize_query(d) for d in docs]


# ---------------------------------------------------------------------------
# Step 3 – Embed queries
# ---------------------------------------------------------------------------

def embed_queries(
    queries: list[dict],
    embed_fn: Callable[[list[str]], np.ndarray],
) -> np.ndarray:
    """Return an (N, D) float32 embedding matrix.

    ``embed_fn`` accepts a list of strings and returns a 2-D numpy array.
    Using a callable keeps the module testable without loading a real model.
    """
    if not queries:
        return np.zeros((0, 1), dtype=np.float32)

    # Cluster on the farmer's wording only. Metadata is retained on every
    # cluster member for coverage analysis, but must not distort semantic
    # similarity (the same topic can be asked from different states).
    texts = [q["question"] for q in queries]
    raw = embed_fn(texts)
    # Cosine normalise so distance = 1 − cosine_sim
    return normalize(np.array(raw, dtype=np.float32), norm="l2")


# ---------------------------------------------------------------------------
# Step 4 – Cluster by semantic similarity
# ---------------------------------------------------------------------------

def cluster_queries(
    queries: list[dict],
    embeddings: np.ndarray,
    distance_threshold: float = CLUSTER_DISTANCE_THRESHOLD,
) -> list[dict]:
    """Assign a cluster_id to each query based on AgglomerativeClustering.

    Returns the same list of query dicts, each augmented with 'cluster_id'.
    """
    if len(queries) == 0:
        return queries

    if len(queries) == 1:
        q = dict(queries[0])
        q["cluster_id"] = 0
        return [q]

    try:
        # Pairwise cosine distances via precomputed dot-product on L2-normalised vecs
        dot_matrix = embeddings @ embeddings.T
        # Clip to [−1, 1] to guard against floating-point noise
        dot_matrix = np.clip(dot_matrix, -1.0, 1.0)
        distance_matrix = 1.0 - dot_matrix
        np.fill_diagonal(distance_matrix, 0.0)

        agg = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=distance_threshold,
            metric="precomputed",
            linkage="average",
        )
        labels = agg.fit_predict(distance_matrix)
    except Exception as exc:
        log.warning("Clustering failed (%s); assigning singleton clusters.", exc)
        labels = np.arange(len(queries))

    result = []
    for q, label in zip(queries, labels):
        q2 = dict(q)
        q2["cluster_id"] = int(label)
        result.append(q2)
    return result


# ---------------------------------------------------------------------------
# Step 5 – Demand analysis per cluster
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def compute_demand(
    clustered: list[dict],
    now: Optional[datetime] = None,
    current_days: int = CURRENT_WINDOW_DAYS,
    prev_days: int = PREV_WINDOW_DAYS,
) -> dict[int, dict]:
    """For each cluster compute current / previous period demand + growth.

    Returns a mapping: cluster_id → {current, previous, growth}.
    """
    if now is None:
        now = _utcnow()

    current_start = now - timedelta(days=current_days)
    prev_start = now - timedelta(days=current_days + prev_days)

    demand: dict[int, dict] = defaultdict(lambda: {"current": 0, "previous": 0})

    for q in clustered:
        cid = q["cluster_id"]
        ts = q.get("created_at")
        if ts is None:
            demand[cid]["current"] += 1  # unknown date → count in current
            continue
        if ts >= current_start:
            demand[cid]["current"] += 1
        elif ts >= prev_start:
            demand[cid]["previous"] += 1

    for cid, d in demand.items():
        curr = d["current"]
        prev = d["previous"]
        if prev == 0:
            growth = 1.0 if curr > 0 else 0.0
        else:
            growth = (curr - prev) / prev
        d["growth"] = round(growth, 4)

    return dict(demand)


# ---------------------------------------------------------------------------
# Step 6 – Build cluster summaries
# ---------------------------------------------------------------------------

def build_cluster_summaries(
    clustered: list[dict],
    demand: dict[int, dict],
) -> list[dict]:
    """Aggregate per-cluster metadata and produce a summary for each cluster."""
    groups: dict[int, list[dict]] = defaultdict(list)
    for q in clustered:
        groups[q["cluster_id"]].append(q)

    summaries = []
    for cid, items in groups.items():
        # Representative question: longest question text (usually most specific)
        rep = max(items, key=lambda x: len(x["question"]))

        # Majority crop / state / domain
        def majority(field: str) -> str:
            vals = [x[field] for x in items if x[field]]
            if not vals:
                return ""
            return max(set(vals), key=vals.count)

        d = demand.get(cid, {"current": 0, "previous": 0, "growth": 0.0})
        total_demand = sum(1 for _ in items)  # total historical count

        summaries.append(
            {
                "cluster_id": cid,
                "size": len(items),
                "representative_question": rep["question"],
                "sample_questions": [x["question"] for x in items[:5]],
                "crop": majority("crop"),
                "state": majority("state"),
                "domain": majority("domain"),
                "current_demand": d["current"],
                "previous_demand": d["previous"],
                "growth": d["growth"],
                "total_demand": total_demand,
            }
        )

    return summaries


# ---------------------------------------------------------------------------
# Step 7 – Priority scoring and ranking
# ---------------------------------------------------------------------------

def score_and_rank(summaries: list[dict], top_n: int = TOP_N) -> list[dict]:
    """Compute a priority_score, priority_level, and rank for each cluster.

    Score formula (simple and explainable):
      base_score = log(1 + current_demand) * 4
      growth_bonus = max(0, growth) * 2
      size_bonus = log(1 + size) * 1
      priority_score = base_score + growth_bonus + size_bonus

    Priority levels:
      CRITICAL  ≥ 8
      HIGH      ≥ 4
      MEDIUM    ≥ 1.5
      LOW       < 1.5
    """
    import math

    for s in summaries:
        curr = max(s["current_demand"], 0)
        growth = max(s.get("growth", 0.0), 0.0)
        size = max(s["size"], 1)
        base = math.log1p(curr) * 4
        growth_bonus = growth * 2
        size_bonus = math.log1p(size) * 1
        score = base + growth_bonus + size_bonus
        s["priority_score"] = round(score, 4)

        if score >= 8:
            level = "CRITICAL"
        elif score >= 4:
            level = "HIGH"
        elif score >= 1.5:
            level = "MEDIUM"
        else:
            level = "LOW"
        s["priority_level"] = level

    ranked = sorted(summaries, key=lambda x: x["priority_score"], reverse=True)
    top = ranked[:top_n]

    for rank, s in enumerate(top, start=1):
        s["rank"] = rank

    return top


# ---------------------------------------------------------------------------
# Step 8 – Coverage analysis (crop × state × domain)
# ---------------------------------------------------------------------------

def compute_coverage(
    disclaimer_queries: list[dict],
    golden_collection,
) -> list[dict]:
    """Classify each (crop, state, domain) combination as STRONG / PARTIAL / GAP.

    Logic:
      GDB entry count for (crop, state, domain):
        ≥ 5  → STRONG
        1–4  → PARTIAL
        0    → GAP
    """
    # Aggregate demand dimensions from disclaimer queries
    combos: dict[tuple, int] = defaultdict(int)
    for q in disclaimer_queries:
        crop = q["crop"] or "Unknown"
        state = q["state"] or "Unknown"
        domain_raw = q["domain"] or "Unknown"
        # handle multi-domain strings
        for dom in domain_raw.split(","):
            dom = dom.strip() or "Unknown"
            combos[(crop, state, dom)] += 1

    # For each unique (crop, state, domain) check GDB coverage
    coverage_rows = []
    for (crop, state, domain), demand_count in combos.items():
        gdb_count = _count_golden_entries(golden_collection, crop, state, domain)

        if gdb_count >= 5:
            level = "STRONG"
        elif gdb_count >= 1:
            level = "PARTIAL"
        else:
            level = "GAP"

        coverage_rows.append(
            {
                "crop": crop,
                "state": state,
                "domain": domain,
                "unanswered_demand": demand_count,
                "gdb_entry_count": gdb_count,
                "coverage_level": level,
            }
        )

    # Sort by GAP first, then by demand descending
    coverage_level_order = {"GAP": 0, "PARTIAL": 1, "STRONG": 2}
    coverage_rows.sort(
        key=lambda r: (coverage_level_order[r["coverage_level"]], -r["unanswered_demand"])
    )

    return coverage_rows


def _count_golden_entries(golden_collection, crop: str, state: str, domain: str) -> int:
    """Count GDB entries matching crop/state/domain (case-insensitive)."""
    try:
        crop_pattern = f"^{re.escape(crop)}$"
        state_pattern = f"^{re.escape(state)}$"
        domain_pattern = re.escape(domain)
        query: dict = {}
        conditions = []

        if crop and crop.lower() not in ("unknown", ""):
            conditions.append(
                {
                    "$or": [
                        {"metadata.Crop": {"$regex": crop_pattern, "$options": "i"}},
                        {"metadata.crop": {"$regex": crop_pattern, "$options": "i"}},
                    ]
                }
            )

        if state and state.lower() not in ("unknown", ""):
            conditions.append(
                {
                    "$or": [
                        {"metadata.State": {"$regex": state_pattern, "$options": "i"}},
                        {"metadata.state": {"$regex": state_pattern, "$options": "i"}},
                    ]
                }
            )

        if domain and domain.lower() not in ("unknown", ""):
            conditions.append(
                {
                    "$or": [
                        {"metadata.Category": {"$regex": domain_pattern, "$options": "i"}},
                        {"metadata.category": {"$regex": domain_pattern, "$options": "i"}},
                    ]
                }
            )

        if conditions:
            query = {"$and": conditions}

        return golden_collection.count_documents(query)
    except Exception as exc:
        log.warning("GDB count query failed: %s", exc)
        return 0


# ---------------------------------------------------------------------------
# Step 9 – Outreach recommendations
# ---------------------------------------------------------------------------

def generate_outreach_recommendations(
    coverage_rows: list[dict],
    top_n: int = 10,
) -> list[dict]:
    """Return top-N outreach focus areas based on unanswered demand and coverage gaps.

    Focus: GAP regions first, then PARTIAL, sorted by demand descending.
    """
    # Weight: GAP gaps are most urgent; PARTIAL gaps also matter
    gap_rows = [r for r in coverage_rows if r["coverage_level"] == "GAP"]
    partial_rows = [r for r in coverage_rows if r["coverage_level"] == "PARTIAL"]

    gap_rows.sort(key=lambda r: -r["unanswered_demand"])
    partial_rows.sort(key=lambda r: -r["unanswered_demand"])

    candidates = gap_rows + partial_rows
    top = candidates[:top_n]

    recs = []
    for r in top:
        urgency = (
            "URGENT"
            if r["coverage_level"] == "GAP" and r["unanswered_demand"] >= 3
            else "MODERATE"
            if r["coverage_level"] == "GAP"
            else "ADVISORY"
        )
        recs.append(
            {
                "state": r["state"],
                "crop": r["crop"],
                "domain": r["domain"],
                "unanswered_demand": r["unanswered_demand"],
                "coverage_severity": r["coverage_level"],
                "gdb_entry_count": r["gdb_entry_count"],
                "urgency": urgency,
                "recommendation": (
                    f"Field engagement recommended in {r['state']} for "
                    f"{r['crop']} {r['domain']} queries "
                    f"({r['unanswered_demand']} unanswered, "
                    f"GDB coverage: {r['coverage_level']})."
                ),
            }
        )

    return recs


# ---------------------------------------------------------------------------
# Public entry point: build_gap_report
# ---------------------------------------------------------------------------

def build_gap_report(
    reviewer_collection,
    golden_collection,
    embed_fn: Callable[[list[str]], np.ndarray],
    *,
    use_cache: bool = True,
    distance_threshold: float = CLUSTER_DISTANCE_THRESHOLD,
    now: Optional[datetime] = None,
) -> dict:
    """Generate the full GDB Coverage Gap report.

    Parameters
    ----------
    reviewer_collection:
        PyMongo collection for the reviewer questions DB.
    golden_collection:
        PyMongo collection for the golden dataset DB.
    embed_fn:
        Callable(list[str]) → np.ndarray — injectable for testing.
    use_cache:
        Whether to return a cached result if one exists.
    distance_threshold:
        Agglomerative clustering distance threshold.
    now:
        Override "current time" for testing deterministic windows.
    """
    CACHE_KEY = "gap_report"

    if use_cache:
        cached = _cache_get(CACHE_KEY)
        if cached is not None:
            log.info("[gap_report] Returning cached report.")
            return cached

    t0 = time.perf_counter()
    log.info("[gap_report] Generating fresh report …")

    # 1. Fetch
    raw_docs = fetch_disclaimer_queries(reviewer_collection)
    log.info("[gap_report] Fetched %d disclaimer queries.", len(raw_docs))

    if not raw_docs:
        report = _empty_report()
        if use_cache:
            _cache_set(CACHE_KEY, report)
        return report

    # 2. Normalise
    queries = normalize_queries(raw_docs)

    # 3. Embed
    embeddings = embed_queries(queries, embed_fn)

    # 4. Cluster
    clustered = cluster_queries(queries, embeddings, distance_threshold=distance_threshold)

    # 5. Demand
    demand = compute_demand(clustered, now=now)

    # 6. Summaries
    summaries = build_cluster_summaries(clustered, demand)

    # 7. Rank / Top-20
    top_gaps = score_and_rank(summaries, top_n=TOP_N)

    # 8. Coverage
    coverage = compute_coverage(queries, golden_collection)

    # 9. Outreach
    outreach = generate_outreach_recommendations(coverage)

    # KPI aggregates
    total_unanswered = len(queries)
    priority_gaps = len([g for g in top_gaps if g["priority_level"] in ("CRITICAL", "HIGH")])
    fastest_growing = (
        max(top_gaps, key=lambda g: g.get("growth", 0), default={}).get(
            "representative_question", ""
        )
        if top_gaps
        else ""
    )
    regions_with_gaps = len(
        {r["state"] for r in coverage if r["coverage_level"] == "GAP"}
    )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "kpis": {
            "total_unanswered_queries": total_unanswered,
            "priority_gaps": priority_gaps,
            "fastest_growing_topic": fastest_growing,
            "regions_with_gaps": regions_with_gaps,
        },
        "top_gaps": top_gaps,
        "coverage": coverage,
        "outreach_recommendations": outreach,
    }

    elapsed = (time.perf_counter() - t0) * 1000
    log.info("[gap_report] Report generated in %.0f ms.", elapsed)

    if use_cache:
        _cache_set(CACHE_KEY, report)

    return report


def _empty_report() -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "kpis": {
            "total_unanswered_queries": 0,
            "priority_gaps": 0,
            "fastest_growing_topic": "",
            "regions_with_gaps": 0,
        },
        "top_gaps": [],
        "coverage": [],
        "outreach_recommendations": [],
    }
