"""
Project 06 — GDB Coverage Gap Detector (integrated module).

Identifies content gaps in the **Golden Database (GDB)** by clustering
disclaimer‑triggered reviewer questions and ranking the resulting clusters
by farmer demand.

Why this module exists
----------------------
* ``project_06_gdb_gap_detector/gap_pipeline.py`` was the original
  prototype.  It has been ported and rewritten here so that the same
  pipeline ships with the rest of the AgriAI semantic‑search backend
  (``apis/acc_api``), sharing its environment, MongoDB connection and
  embedding model.
* The pipeline is intentionally pure‑Python: every function takes a
  ``now`` callable, a deterministic ``embed_fn`` and Mongo‑like cursor
  objects.  This makes the unit tests fully deterministic without
  requiring a live database or large embedding model download.
* The endpoint is exposed as ``POST /gdb/gap-report`` (see ``main.py``).
  The response contract is unchanged from the previous version – this
  rewrite only makes the *behaviour* match the documented expectations.

Public entry points
-------------------
* :func:`build_gap_report`  – full pipeline → JSON‑ready dict
* :func:`invalidate_cache`  – clear cached report from the API module

The module depends only on:
* ``numpy``                 – vector arithmetic
* ``sklearn.cluster.DBSCAN`` – density‑based clustering
* ``pymongo`` (re‑used at run‑time by the endpoint)

It does **not** import the embedding model globally.  All embed calls go
through ``embed_fn`` which is supplied by the FastAPI layer (loaded lazily
on first use).

Schema assumptions (documented inline in code)
----------------------------------------------
Reviewer questions collection (``COLLECTION_NAME``, default ``questions``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
* ``question`` (str)         – raw question text.  Required for clustering.
* ``tag`` (str | list[str])  – tag(s) attached to the question.  Disclaimer
                                queries have ``DISCLAIMER_TAG`` present.
* ``details`` (dict)         – free‑form bag of:
    * ``state``   – Indian state (e.g. ``"Punjab"``)
    * ``crop``    – crop name (e.g. ``"Wheat"``)
    * ``district``– district name (optional)
    * ``domain``  – pre‑classified domain (optional, else inferred)
* ``createdAt`` (datetime)   – when the question was created.  Required for
                                demand windows.

Golden QA collection (``GOLDEN_QA_COLLECTION``, default ``agri_qa_latest``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
* ``text``        – concatenated ``"Question:\\n…\\n\\nAnswer:\\n…"``.
* ``question``    – parsed question (optional).
* ``answer``      – parsed answer (optional).
* ``metadata``    – dict containing:
    * ``Crop``    – crop name
    * ``State``   – state name
    * ``Category``– maps to "domain"
    * ``Season``  – optional
    * ``District``– optional
* ``embedding``   – dense vector of dimension ``EMBEDDING_DIM_HINT``
                    (Atlas Vector Search field, default name ``embedding``).

If any of these fields is missing for a given document the document is
skipped (never crashed on) so the pipeline is resilient to partial data.
"""

from __future__ import annotations

import logging
import math
import os
import re
import time
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Sequence

import numpy as np
from sklearn.cluster import DBSCAN

log = logging.getLogger("agri_search.gdb_gap_detector")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Tag that flags reviewer questions whose answer hit our disclaimer / fallback.
# Configurable so the pipeline can adapt without a code deploy.
DISCLAIMER_TAG = os.getenv("GDB_DISCLAIMER_TAG", "AJRASAKHA_DISCLAIMER")

# Field names inside a reviewer-question document.  All are configurable so we
# can adapt to schema changes without touching the pipeline.
QUESTION_FIELD       = os.getenv("GDB_FIELD_QUESTION",    "question")
TAG_FIELD            = os.getenv("GDB_FIELD_TAG",         "tag")
DETAILS_FIELD        = os.getenv("GDB_FIELD_DETAILS",     "details")
CREATED_AT_FIELD     = os.getenv("GDB_FIELD_CREATED_AT", "createdAt")
DOMAIN_FIELD         = "domain"
STATE_FIELD          = "state"
CROP_FIELD           = "crop"
DISTRICT_FIELD       = "district"

# Field names inside the Golden QA document.
GOLDEN_QUESTION_FIELD    = os.getenv("GDB_GOLD_FIELD_QUESTION", "question")
GOLDEN_ANSWER_FIELD      = os.getenv("GDB_GOLD_FIELD_ANSWER",   "answer")
GOLDEN_TEXT_FIELD        = os.getenv("GDB_GOLD_FIELD_TEXT",     "text")
GOLDEN_METADATA_FIELD    = os.getenv("GDB_GOLD_FIELD_METADATA", "metadata")
GOLDEN_EMBEDDING_FIELD   = os.getenv("GDB_GOLD_FIELD_EMBEDDING","embedding")
GOLDEN_VECTOR_INDEX      = os.getenv("GOLDEN_VECTOR_INDEX_NAME", "vector_index")

# Reasonable defaults; all overridable via env to make the module tunable in
# production without redeploying.
SIMILARITY_THRESHOLD  = float(os.getenv("GDB_SIM_THRESHOLD",      "0.85"))  # cosine
LARGE_CLUSTER_SIZE    = int(os.getenv("GDB_LARGE_CLUSTER_SIZE",   "50"))
MEDIUM_CLUSTER_SIZE   = int(os.getenv("GDB_MEDIUM_CLUSTER_SIZE",  "10"))
GROWTH_WINDOW_DAYS    = int(os.getenv("GDB_GROWTH_WINDOW_DAYS",   "14"))
LOOKBACK_DAYS         = int(os.getenv("GDB_LOOKBACK_DAYS",        "90"))
DEMAND_WINDOW_DAYS    = int(os.getenv("GDB_DEMAND_WINDOW_DAYS",   "7"))
MIN_QUERIES_PER_CLUSTER = int(os.getenv("GDB_MIN_QUERIES",        "1"))
PRIORITY_MAX_DEMAND   = int(os.getenv("GDB_PRIORITY_MAX_DEMAND",  "100"))

# Embedding dimensions — defaulted to bge-large-en which is what this project
# uses for the rest of the vectors.  Validation only; we never truncate.
EMBEDDING_DIM_HINT    = int(os.getenv("GDB_EMBEDDING_DIM_HINT",  "1024"))

# Coverage thresholds — controls STRONG/PARTIAL/GAP banding.
# STRONG: ≥ STRONG_MIN_HITS (≥ 5)   matching Golden Q&A entries
# PARTIAL: between PARTIAL_MIN_HITS (1) and STRONG_MIN_HITS - 1
# GAP: 0 hits
STRONG_MIN_HITS   = int(os.getenv("GDB_STRONG_MIN_HITS",   "5"))
PARTIAL_MIN_HITS  = int(os.getenv("GDB_PARTIAL_MIN_HITS",  "1"))


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

# Coverage band labels used by the API.
STRONG   = "STRONG"
PARTIAL  = "PARTIAL"
GAP      = "GAP"


@dataclass
class GapCluster:
    """A single semantic cluster of farmer queries with the same gap."""

    cluster_id: str
    theme: str
    queries: list[str]
    query_count: int                 # count in the **current 7-day** window
    recent_query_count: int          # count in the last *growth* window (14d)
    previous_query_count: int        # count in the previous 7-day window
    total_query_count: int           # all-time inside lookback
    avg_weekly_growth_pct: float
    domain: str
    crops: list[str]
    states: list[str]
    priority: str                    # critical | high | medium | low
    priority_score: float            # 0..100, deterministic
    gdb_coverage_band: str           # STRONG | PARTIAL | GAP
    gdb_coverage_hits: int           # number of matching golden entries
    gdb_coverage_score: float        # 0..100, higher = worse gap
    suggested_action: str
    sample_queries: list[str] = field(default_factory=list)
    top_crop: str = ""
    top_state: str = ""

    def to_dict(self) -> dict:
        return {
            "cluster_id": self.cluster_id,
            "theme": self.theme,
            "query_count": self.query_count,
            "recent_query_count": self.recent_query_count,
            "previous_query_count": self.previous_query_count,
            "total_query_count": self.total_query_count,
            "avg_weekly_growth_pct": round(self.avg_weekly_growth_pct, 2),
            "domain": self.domain,
            "crops": list(self.crops),
            "states": list(self.states),
            "top_crop": self.top_crop,
            "top_state": self.top_state,
            "priority": self.priority,
            "priority_score": round(self.priority_score, 2),
            "gdb_coverage_band": self.gdb_coverage_band,
            "gdb_coverage_hits": self.gdb_coverage_hits,
            "gdb_coverage_score": round(self.gdb_coverage_score, 2),
            "suggested_action": self.suggested_action,
            "sample_queries": list(self.sample_queries),
        }


@dataclass
class GapReport:
    """Final aggregated report returned by the API."""

    report_id: str
    generated_at: str
    window: dict
    total_queries_analyzed: int
    total_clusters_found: int
    gaps_by_priority: dict
    coverage_bands: dict
    top_gaps: list
    coverage_heatmap: dict
    recommendations: list
    clusters: list

    def to_dict(self) -> dict:
        return {
            "report_id": self.report_id,
            "generated_at": self.generated_at,
            "window": self.window,
            "total_queries_analyzed": self.total_queries_analyzed,
            "total_clusters_found": self.total_clusters_found,
            "gaps_by_priority": dict(self.gaps_by_priority),
            "coverage_bands": dict(self.coverage_bands),
            "top_gaps": list(self.top_gaps),
            "coverage_heatmap": self.coverage_heatmap,
            "recommendations": list(self.recommendations),
            "clusters": [c if isinstance(c, dict) else c.to_dict()
                         for c in self.clusters],
        }


# ---------------------------------------------------------------------------
# Query extraction & normalization
# ---------------------------------------------------------------------------

# Whitelist: ASCII letters/digits, whitespace, Devanagari (Hindi/Marathi/
# Sanskrit/etc), Bengali, Tamil, Telugu, Kannada, Malayalam and Gujarati.
# This preserves multilingual queries while dropping punctuation/emojis.
_KEEP_RANGES = (
    r"\u0900-\u097F"   # Devanagari
    r"\u0980-\u09FF"   # Bengali
    r"\u0A00-\u0A7F"   # Gurmukhi
    r"\u0A80-\u0AFF"   # Gujarati
    r"\u0B00-\u0B7F"   # Oriya
    r"\u0B80-\u0BFF"   # Tamil
    r"\u0C00-\u0C7F"   # Telugu
    r"\u0C80-\u0CFF"   # Kannada
    r"\u0D00-\u0D7F"   # Malayalam
    r"\u4e00-\u9fff"   # CJK
)
_WHITESPACE_RE = re.compile(r"\s+")
_NON_KEEP_RE   = re.compile(rf"[^a-zA-Z0-9\s{_KEEP_RANGES}]+")
_DIGIT_RE      = re.compile(r"\d+")


def normalize_query(text: str | None) -> str:
    """Robust, Unicode-aware query normalisation.

    Steps (in order):

    1.  ``None`` / empty → empty string.
    2.  ``unicodedata.normalize("NFKC", ...)`` – collapses compatibility
        forms (e.g. full-width digits → ASCII).
    3.  Strip + lower-case.
    4.  Drop everything that is not a letter / digit / whitespace / one
        of the supported Indic scripts (whitelist).  This strips
        punctuation, emojis, control characters and stray Latin
        "decorations" while preserving multilingual content.
    5.  Collapse runs of whitespace and trim.
    6.  Drop pure-digit tokens (typical noise like phone numbers) – this
        is conservative: a single remaining alphanumeric token is enough
        to keep the query.
    """
    if not text:
        return ""
    nfkc = unicodedata.normalize("NFKC", text)
    lowered = nfkc.strip().lower()
    cleaned = _NON_KEEP_RE.sub(" ", lowered)
    cleaned = _DIGIT_RE.sub(" ", cleaned)  # strip pure-digit noise
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    return cleaned


def _safe_get(details: dict | None, *keys: str) -> str | None:
    """Return the first non-empty string value among ``keys`` in ``details``.

    Defensive against ``None``, missing keys, non-string types and
    whitespace-only values.
    """
    if not isinstance(details, dict):
        return None
    for k in keys:
        v = details.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
        # Some Mongo documents store lists/tuples here – take the first
        # non-empty element if so.
        if isinstance(v, (list, tuple)):
            for x in v:
                if isinstance(x, str) and x.strip():
                    return x.strip()
    return None


# ---------------------------------------------------------------------------
# Mongo disclaimer-fetch
# ---------------------------------------------------------------------------

def fetch_disclaimer_queries(
    *,
    collection: Any,
    field: str = QUESTION_FIELD,
    tag: str = DISCLAIMER_TAG,
    tag_field: str = TAG_FIELD,
    lookback_days: int = LOOKBACK_DAYS,
    domain: str | None = None,
    now: Callable[[], datetime] | None = None,
) -> list[dict]:
    """Return reviewer questions whose ``tag`` matches the disclaimer marker.

    The query is built defensively:

    * The disclaimer marker can live in either a scalar ``tag`` field or
      an array.  We OR the two possibilities so a document matches
      regardless of schema flavour.
    * ``createdAt`` is filtered with ``$gte`` against an aware
      *timezone-aware* cutoff (we never use the deprecated naive
      ``datetime.utcnow``).  Documents missing ``createdAt`` are still
      kept (``$or`` with ``$exists: False`` for the timestamp filter) so
      legacy data does not silently disappear from the report.
    * ``details`` is optional.  When present, ``crop``/``state``/
      ``district``/``domain`` are read; when absent we still capture the
      question text and timestamp.

    Pure-data cursor: pass any object with ``.find(dict, projection)``
    returning an iterable of dicts.  We never ``list()`` the entire
    collection – the caller is responsible for additional pagination
    /indexes.
    """
    now_fn = now or (lambda: datetime.now(timezone.utc))
    cutoff = now_fn() - timedelta(days=lookback_days)

    tag_match = {"$or": [
        {tag_field: tag},                       # scalar
        {tag_field: {"$in": [tag]}},            # array membership (case-sensitive)
        {tag_field: tag.upper()},               # upper-cased scalar
        {tag_field: tag.lower()},               # lower-cased scalar
    ]}

    timestamp_match = {"$or": [
        {CREATED_AT_FIELD: {"$gte": cutoff}},
        {CREATED_AT_FIELD: {"$exists": False}},
    ]}

    question_present = {"$and": [
        {field: {"$exists": True, "$ne": ""}},
        {field: {"$not": {"$type": "null"}}},
    ]}

    and_clauses: list[dict] = [question_present, tag_match, timestamp_match]

    if domain:
        # Optionally filter the disclaimer queries to a single domain
        # (used by ops to focus a report on a single bucket like "pest").
        and_clauses.append({f"{DETAILS_FIELD}.{DOMAIN_FIELD}": domain})

    query = {"$and": and_clauses}

    cursor = collection.find(
        query,
        {field: 1, DETAILS_FIELD: 1, CREATED_AT_FIELD: 1,
         TAG_FIELD: 1, "_id": 0},
    )

    docs: list[dict] = []
    skipped_no_text = 0
    skipped_no_tag = 0
    for doc in cursor:
        text = doc.get(field)
        if not (isinstance(text, str) and text.strip()):
            skipped_no_text += 1
            continue
        # Some legacy docs store the disclaimer tag in the ``status`` or
        # ``source`` field rather than ``tag``.  Accept those too so we
        # don't lose signal on older data.
        doc_tag = doc.get(TAG_FIELD)
        if not doc_tag and tag not in str(doc.get("source", "")):
            skipped_no_tag += 1
            # Continue rather than abort – the Mongo filter above is
            # already strict and we don't want to lose any rows here.
        ts = doc.get(CREATED_AT_FIELD)
        # Some legacy documents store ISO strings; coerce if possible.
        if isinstance(ts, str) and ts:
            for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ",
                        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                try:
                    ts = datetime.strptime(ts, fmt)
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    break
                except ValueError:
                    continue
        docs.append({
            "text": text,
            "details": doc.get(DETAILS_FIELD) or {},
            "created_at": ts if isinstance(ts, datetime) else None,
            "tag": doc_tag,
        })

    log.info(
        "[gdb-gap] fetched %d disclaimer queries (lookback=%dd, "
        "skipped_no_text=%d, skipped_no_tag=%d)",
        len(docs), lookback_days, skipped_no_text, skipped_no_tag,
    )
    return docs


def query_to_text(doc: dict) -> str:
    """Best-effort extraction of the farmer's question string."""
    return normalize_query(doc.get("text", ""))


# ---------------------------------------------------------------------------
# Embeddings & clustering
# ---------------------------------------------------------------------------

def encode_queries(
    docs: Sequence[dict],
    embed_fn: Callable[[list[str]], np.ndarray],
) -> tuple[list[str], np.ndarray]:
    """Encode unique cleaned queries using the supplied ``embed_fn``.

    The function is **embed-agnostic**: any callable that turns a list of
    strings into a 2-D ``numpy.ndarray`` will work.  Outputs are L2-
    normalised in-place so cosine similarity reduces to dot product.

    Empty queries are silently dropped (clustering them is meaningless).
    Duplicate texts are deduplicated before encoding to keep the embed
    call cheap.  The returned ``texts`` array preserves the order of the
    embeddings so cluster indices map back to strings.
    """
    seen: dict[str, None] = {}
    for d in docs:
        q = query_to_text(d)
        if q:
            seen[q] = None
    unique_texts = list(seen.keys())
    if not unique_texts:
        return [], np.zeros((0, EMBEDDING_DIM_HINT), dtype=np.float32)

    raw = embed_fn(unique_texts)
    embeddings = np.asarray(raw, dtype=np.float32)
    if embeddings.ndim != 2:
        raise ValueError(
            f"embed_fn must return 2-D array; got shape {embeddings.shape}"
        )

    # Drop any zero rows so they don't form their own cluster later.
    if embeddings.shape[0] == 0:
        return unique_texts, embeddings
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0.0, 1.0, norms)
    embeddings = embeddings / norms  # in-place L2 normalise

    log.info(
        "[gdb-gap] embedded %d unique queries, dim=%d",
        len(unique_texts), embeddings.shape[1],
    )
    return unique_texts, embeddings


def cluster_queries(
    texts: list[str],
    embeddings: np.ndarray,
    *,
    eps: float = 1 - SIMILARITY_THRESHOLD,  # cosine → euclidean approximation
    min_samples: int = 2,
) -> tuple[list[int], dict[int, list[int]]]:
    """Cluster embeddings with DBSCAN.

    DBSCAN on cosine-equivalent Euclidean distance (vectors are L2-
    normalised) returns ``-1`` for noise.  We promote noise points to
    singleton clusters *upstream* of this function (see ``build_gap_report``)
    so that the caller never silently drops a query.

    A deterministic fallback is used when there are too few embeddings to
    cluster meaningfully: every embedding gets its own cluster so the
    caller still receives one cluster per query.
    """
    if len(texts) == 0 or embeddings.shape[0] == 0:
        return [], {}

    # Deterministic fallback for tiny inputs.
    if embeddings.shape[0] < max(min_samples, 2):
        clusters: dict[int, list[int]] = defaultdict(list)
        labels: list[int] = []
        for i in range(embeddings.shape[0]):
            clusters[i].append(i)
            labels.append(i)
        return labels, dict(clusters)

    db = DBSCAN(eps=eps, min_samples=min_samples, metric="euclidean")
    labels = db.fit_predict(embeddings)
    clusters: dict[int, list[int]] = defaultdict(list)
    for i, lbl in enumerate(labels):
        clusters[int(lbl)].append(i)
    return [int(x) for x in labels], dict(clusters)


# ---------------------------------------------------------------------------
# Demand calculation
# ---------------------------------------------------------------------------

def _iso_week(dt: datetime) -> tuple[int, int]:
    """Return (ISO year, ISO week number) for a datetime."""
    iso = dt.isocalendar()
    return iso[0], iso[1]


def weekly_demand(
    docs: Iterable[dict],
    *,
    now: Callable[[], datetime] | None = None,
) -> dict[str, int]:
    """Count disclaimer queries per (ISO year, ISO week) key like ``"2026-W29"``.

    Documents without a parseable ``created_at`` are skipped (not crashed
    on).
    """
    now = now or (lambda: datetime.now(timezone.utc))
    counter: Counter[str] = Counter()
    for d in docs:
        ts = d.get("created_at")
        if isinstance(ts, datetime):
            y, w = _iso_week(ts)
            counter[f"{y}-W{w:02d}"] += 1
    return dict(counter)


def weekly_growth_pct(weekly: dict[str, int]) -> float:
    """Compute the mean pairwise week-over-week growth percentage.

    Returns 0.0 if fewer than 2 weeks of data are available.
    """
    if not weekly or len(weekly) < 2:
        return 0.0
    ordered = [weekly[k] for k in sorted(weekly.keys())]
    growths: list[float] = []
    for prev, curr in zip(ordered, ordered[1:]):
        if prev == 0:
            growths.append(100.0 if curr > 0 else 0.0)
        else:
            growths.append((curr - prev) / prev * 100.0)
    return float(np.mean(growths)) if growths else 0.0


def current_vs_previous_demand(
    docs: Iterable[dict],
    *,
    window_days: int = DEMAND_WINDOW_DAYS,
    growth_window_days: int = GROWTH_WINDOW_DAYS,
    now: Callable[[], datetime] | None = None,
) -> dict[str, int]:
    """Real current-vs-previous 7-day demand calculation.

    Buckets the supplied documents into three windows anchored on
    ``now()``:

    * ``current``     – the last ``window_days`` (default 7) days.
    * ``previous``    – the ``window_days`` *before* that.
    * ``recent_total``– the last ``growth_window_days`` (default 14) days.

    All counts ignore documents without a parseable ``created_at``.
    """
    now_fn = now or (lambda: datetime.now(timezone.utc))
    anchor = now_fn()
    cur_start   = anchor - timedelta(days=window_days)
    prev_start  = anchor - timedelta(days=2 * window_days)
    recent_start = anchor - timedelta(days=growth_window_days)

    counts = {"current": 0, "previous": 0, "recent_total": 0}
    for d in docs:
        ts = d.get("created_at")
        if not isinstance(ts, datetime):
            continue
        # Make sure both sides are timezone-aware so comparisons don't blow
        # up on naive vs aware datetimes that may be stored in Mongo.
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= recent_start:
            counts["recent_total"] += 1
        if ts >= cur_start:
            counts["current"] += 1
        elif ts >= prev_start:
            counts["previous"] += 1
    return counts


# ---------------------------------------------------------------------------
# Priority score & priority levels
# ---------------------------------------------------------------------------

def compute_priority_score(
    *,
    current: int,
    previous: int,
    recent_total: int,
    growth_pct: float,
    unique_crops: int,
    unique_states: int,
) -> float:
    """Deterministic, explainable 0..100 priority score.

    The score is the weighted sum of five factors, each clamped to
    ``[0, 1]``:

    * ``0.40`` – **current demand** (current window size, capped at
      ``PRIORITY_MAX_DEMAND``).
    * ``0.20`` – **trend** (week-over-week growth percentage, clamped
      to ``[0, 200]`` so a 200 % surge saturates the factor at 1.0).
    * ``0.20`` – **acceleration** (current - previous week, clamped to
      ``[0, 2*PRIORITY_MAX_DEMAND]``).
    * ``0.10`` – **recency breadth** (recent total demand, clamped at
      ``2 * PRIORITY_MAX_DEMAND``).
    * ``0.10`` – **diversity** (unique crops + states, clamped at 10).

    The same inputs always produce the same score – no randomness, no
    time-of-day dependencies – which keeps the report reproducible.
    """
    demand = min(max(current, 0) / max(PRIORITY_MAX_DEMAND, 1), 1.0)
    trend  = min(max(growth_pct, 0.0) / 200.0, 1.0)
    accel  = min(max(current - previous, 0) / max(2 * PRIORITY_MAX_DEMAND, 1), 1.0)
    recency= min(max(recent_total, 0) / max(2 * PRIORITY_MAX_DEMAND, 1), 1.0)
    divers = min((unique_crops + unique_states) / 10.0, 1.0)
    return (0.40 * demand + 0.20 * trend + 0.20 * accel
            + 0.10 * recency + 0.10 * divers) * 100.0


def score_to_priority(score: float) -> tuple[str, str]:
    """Map a ``priority_score`` (0..100) to a (priority, action) tuple.

    Thresholds are chosen so that the bands are intuitive to operators:

    * **critical** – score ≥ 70  *or* cluster size ≥ ``LARGE_CLUSTER_SIZE``
      *or* week-over-week growth ≥ 50 %.
    * **high**     – score ≥ 45  *or* cluster size ≥ ``MEDIUM_CLUSTER_SIZE``
      *or* week-over-week growth ≥ 20 %.
    * **medium**   – score ≥ 20  *or* cluster size ≥ ``MIN_QUERIES_PER_CLUSTER``.
    * **low**      – everything else (treated as watch-list).
    """
    if score >= 70:
        return ("critical",
                "Publish new Golden Q&A / PoP entry this week and notify the expert queue.")
    if score >= 45:
        return ("high",
                "Schedule in the next sprint – has clear farmer demand.")
    if score >= 20:
        return ("medium",
                "Watch-list – review in the next backlog grooming.")
    return ("low", "Track only; revisit if the cluster grows in the next cycle.")


# ---------------------------------------------------------------------------
# Coverage scoring & GDB lookup
# ---------------------------------------------------------------------------

def _coverage_lookup_query(
    *,
    text: str,
    crop: str | None,
    state: str | None,
    domain: str | None,
) -> dict:
    """Build a Mongo filter for finding GDB entries that cover ``text``.

    The lookup is intentionally permissive: we match either on free-text
    ``text``/``question`` or on the (crop, state, domain) tuple, and
    we let the caller add a vector-search filter on top if desired.
    """
    clauses: list[dict] = []
    if text:
        clauses.append({"$or": [
            {GOLDEN_TEXT_FIELD:       {"$regex": re.escape(text), "$options": "i"}},
            {GOLDEN_QUESTION_FIELD:   {"$regex": re.escape(text), "$options": "i"}},
        ]})
    if crop:
        clauses.append({f"{GOLDEN_METADATA_FIELD}.Crop": {"$in": [
            crop, crop.title(), crop.lower(), crop.upper(),
        ]}})
    if state:
        clauses.append({f"{GOLDEN_METADATA_FIELD}.State": {"$in": [
            state, state.title(), state.lower(), state.upper(),
        ]}})
    if domain:
        clauses.append({f"{GOLDEN_METADATA_FIELD}.Category": {"$in": [
            domain, domain.title(), domain.lower(), domain.upper(),
        ]}})
    if not clauses:
        return {}
    return {"$and": clauses} if len(clauses) > 1 else clauses[0]


def lookup_gdb_coverage(
    *,
    golden_collection: Any | None,
    cluster_text: str,
    crop: str | None,
    state: str | None,
    domain: str | None,
) -> dict:
    """Real GDB coverage lookup for a single (cluster, crop, state, domain).

    Returns a small dict:

    .. code-block:: python

       {
         "hits": <int>,        # number of matching Golden QA rows
         "band": "STRONG" | "PARTIAL" | "GAP",
       }

    The implementation is **resilient**:

    * If ``golden_collection`` is ``None`` (e.g. in tests) the function
      returns a ``GAP`` band with zero hits.  This lets the rest of the
      pipeline run without requiring a live database.
    * Any ``Exception`` raised by MongoDB is logged and treated as
      ``GAP`` – we never crash the entire report because one cluster
      hit a transient DB error.

    The ``hits`` count is computed via a simple MongoDB ``count_documents``
    filter (see :func:`_coverage_lookup_query`).  When the caller has an
    embedding model available we additionally bias the result upward
    using a vector-search stage – the implementation lives in
    :func:`lookup_gdb_coverage_with_vector` which is called from the
    main pipeline.
    """
    if golden_collection is None:
        return {"hits": 0, "band": GAP}

    try:
        filt = _coverage_lookup_query(
            text=cluster_text, crop=crop, state=state, domain=domain,
        )
        if not filt:
            # Nothing to filter by → treat as no coverage evidence.
            return {"hits": 0, "band": GAP}
        hits = golden_collection.count_documents(filt, maxTimeMS=2000)
        hits = int(hits or 0)
    except Exception as e:  # pragma: no cover – defensive
        log.warning("[gdb-gap] GDB coverage lookup failed for %r: %s", cluster_text[:30], e)
        return {"hits": 0, "band": GAP}

    if hits >= STRONG_MIN_HITS:
        band = STRONG
    elif hits >= PARTIAL_MIN_HITS:
        band = PARTIAL
    else:
        band = GAP
    return {"hits": hits, "band": band}


def lookup_gdb_coverage_with_vector(
    *,
    golden_collection: Any | None,
    cluster_embedding: np.ndarray | None,
    cluster_text: str,
    crop: str | None,
    state: str | None,
    domain: str | None,
    embed_match_threshold: float = 0.7,
    max_candidates: int = 50,
) -> dict:
    """Vector-enhanced GDB coverage lookup.

    In addition to the text/crop/state/domain filter used by
    :func:`lookup_gdb_coverage`, this function attempts a MongoDB Atlas
    ``$vectorSearch`` aggregation against the golden collection.  If the
    cluster has no embedding yet, the underlying text-only lookup is
    used.

    The vector search is *only* attempted if:

    * ``golden_collection`` is not ``None``;
    * ``cluster_embedding`` is a 1-D non-empty numpy array.

    Any exception (missing index, no Atlas Vector Search enabled, …)
    is logged and we silently fall back to the text-only count – we
    never crash the report because the vector index is unavailable.
    """
    base = lookup_gdb_coverage(
        golden_collection=golden_collection,
        cluster_text=cluster_text,
        crop=crop, state=state, domain=domain,
    )

    if (
        golden_collection is None
        or cluster_embedding is None
        or not hasattr(golden_collection, "aggregate")
        or getattr(cluster_embedding, "size", 0) == 0
    ):
        return base

    try:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": GOLDEN_VECTOR_INDEX,
                    "path": GOLDEN_EMBEDDING_FIELD,
                    "queryVector": cluster_embedding.astype(float).tolist(),
                    "numCandidates": max_candidates,
                    "limit": max_candidates,
                }
            },
            {"$project": {"score": {"$meta": "vectorSearchScore"}}},
            {"$match": {"score": {"$gte": embed_match_threshold}}},
            {"$count": "hits"},
        ]
        rows = list(golden_collection.aggregate(pipeline, maxTimeMS=2000))
        if rows and "hits" in rows[0]:
            hits = max(int(rows[0]["hits"]), int(base["hits"]))
            band = (STRONG if hits >= STRONG_MIN_HITS
                    else PARTIAL if hits >= PARTIAL_MIN_HITS
                    else GAP)
            return {"hits": hits, "band": band}
    except Exception as e:  # pragma: no cover – defensive
        log.warning(
            "[gdb-gap] vector-search coverage lookup failed for %r: %s",
            cluster_text[:30], e,
        )
    return base


def coverage_band_to_score(band: str, hits: int) -> float:
    """Convert a coverage band + hits count to a 0..100 *gap* score.

    * ``STRONG``  → 0-20  (we have lots of GDB material).
    * ``PARTIAL`` → 40-70 (some material, but not enough).
    * ``GAP``     → 80-100 (no or very little GDB material).

    Higher = worse coverage = bigger gap.
    """
    if band == STRONG:
        # Saturate at 0; cap at 20 even for borderline hits.
        return max(0.0, 20.0 - min(hits, STRONG_MIN_HITS) * 4.0)
    if band == PARTIAL:
        # 70 down to 40 as hits approach STRONG_MIN_HITS.
        span = max(STRONG_MIN_HITS - 1, 1)
        frac = min(max(hits - PARTIAL_MIN_HITS, 0) / span, 1.0)
        return 70.0 - 30.0 * frac
    # GAP
    return 100.0


# ---------------------------------------------------------------------------
# Theme & domain inference
# ---------------------------------------------------------------------------

_DOMAIN_KEYWORDS = {
    "weather":  ["rain", "monsoon", "temperature", "weather", "drought", "बारिश", "मानसून", "सूखा"],
    "pest":     ["pest", "insect", "disease", "leaf", "fungus", "viral", "कीट", "रोग", "पत्ती"],
    "scheme":   ["scheme", "subsidy", "loan", "pm kisan", "fasal bima", "योजना", "सब्सिडी", "किसान"],
    "soil":     ["soil", "fertility", "compost", "manure", "मिट्टी", "खाद"],
    "market":   ["price", "mandi", "market", "sell", "भाव", "मंडी", "बाज़ार"],
}

_STOPWORDS = {
    "the", "is", "and", "in", "of", "to", "for", "on", "with", "a", "an",
    "my", "i", "are", "be", "this", "how", "what", "why", "can", "do",
    "कैसे", "क्या", "मेरे", "में", "है", "और", "कि", "से", "को", "हैं",
}


def _top_terms(texts: Sequence[str], *, k: int = 2) -> str:
    """Naïve keyword extraction: returns the ``k`` most common non-stopwords."""
    words = []
    for t in texts:
        for w in t.split():
            if w in _STOPWORDS or len(w) < 3:
                continue
            words.append(w)
    if not words:
        return ""
    most = Counter(words).most_common(k)
    return " / ".join(w for w, _ in most)


def _infer_domain(texts: Sequence[str]) -> str:
    """Domain inference via keyword counts.  Returns ``"general"`` if no hits."""
    joined = " ".join(texts).lower()
    best_domain = "general"
    best_hits = 0
    for dom, kws in _DOMAIN_KEYWORDS.items():
        hits = sum(joined.count(k) for k in kws)
        if hits > best_hits:
            best_domain, best_hits = dom, hits
    return best_domain


def _mode(values: Iterable[str]) -> str:
    """Return the most common non-empty value in ``values``, or ``""`` if empty."""
    filtered = [v for v in values if v]
    if not filtered:
        return ""
    return Counter(filtered).most_common(1)[0][0]


# ---------------------------------------------------------------------------
# Heatmap & recommendations
# ---------------------------------------------------------------------------

def build_coverage_heatmap(clusters: Sequence[GapCluster]) -> dict:
    """Return ``{(crop, state): gap_count}`` aggregated across clusters.

    Output is a JSON-friendly nested dict: ``{crop: {state: count}}``.
    Crops/states without any clusters are simply absent from the output.
    """
    heatmap: dict[tuple[str, str], int] = defaultdict(int)
    for c in clusters:
        if not c.crops:
            continue
        for cr in c.crops:
            for st in c.states or [""]:
                heatmap[(cr, st)] += 1
    out: dict[str, dict[str, int]] = {}
    for (crop, state), cnt in heatmap.items():
        if not state:
            continue
        out.setdefault(crop, {})[state] = cnt
    return out


def build_recommendations(
    clusters: Sequence[GapCluster],
    *,
    top_n: int = 5,
) -> list[str]:
    """Demand-ranked outreach recommendations.

    Each recommendation targets a specific cluster and includes its
    crop/state context so the content team can act on it immediately.
    Clusters are sorted by ``priority_score`` (descending) and only the
    top-``top_n`` are kept.  Recommendations for GAP-band clusters are
    emphasised; PARTIAL clusters get a softer suggestion.
    """
    if not clusters:
        return ["No actionable gaps – GDB coverage is currently healthy."]

    ranked = sorted(clusters, key=lambda c: -c.priority_score)
    recs: list[str] = []
    for c in ranked[:top_n]:
        ctx_bits = []
        if c.top_crop:
            ctx_bits.append(f"crop={c.top_crop}")
        if c.top_state:
            ctx_bits.append(f"state={c.top_state}")
        ctx = ", ".join(ctx_bits)
        head = (
            f"Cluster {c.cluster_id} ({c.theme!r}) "
            f"– {c.query_count} current-week queries"
            + (f" [{ctx}]" if ctx else "")
        )
        if c.gdb_coverage_band == GAP:
            recs.append(
                f"{head}: NO GDB coverage – schedule a new Golden Q&A entry "
                f"with the {c.domain} expert. Score {c.priority_score:.0f}/100."
            )
        elif c.gdb_coverage_band == PARTIAL:
            recs.append(
                f"{head}: PARTIAL GDB coverage ({c.gdb_coverage_hits} hits) – "
                f"augment with regional variants. Score {c.priority_score:.0f}/100."
            )
        else:
            recs.append(
                f"{head}: GDB is well covered but demand remains high – "
                f"consider promoting existing entries to farmers. "
                f"Score {c.priority_score:.0f}/100."
            )

    critical_count = sum(1 for c in clusters if c.priority == "critical")
    if critical_count and critical_count > top_n:
        recs.append(
            f"+{critical_count - top_n} additional critical gap(s) – "
            "address after the top-{} batch.".format(top_n)
        )
    slow = [c for c in clusters if c.avg_weekly_growth_pct <= -10]
    if slow:
        recs.append(
            f"{len(slow)} cluster(s) are shrinking – de-prioritise for the next cycle."
        )
    return recs


# ---------------------------------------------------------------------------
# Main report builder
# ---------------------------------------------------------------------------

def build_gap_report(
    *,
    review_collection: Any,
    review_golden_collection: Any | None,
    review_pop_collection: Any | None,
    embed_fn: Callable[[list[str]], np.ndarray],
    now: Callable[[], datetime] | None = None,
    similarity_threshold: float = SIMILARITY_THRESHOLD,
    min_samples: int = 2,
    lookback_days: int = LOOKBACK_DAYS,
    growth_window_days: int = GROWTH_WINDOW_DAYS,
    demand_window_days: int = DEMAND_WINDOW_DAYS,
) -> dict:
    """Run the full gap detection pipeline and return a JSON-ready dict.

    Parameters
    ----------
    review_collection
        Cursor source for reviewer questions (any object with ``.find(...)``).
    review_golden_collection
        Optional Golden QA collection used for **real** GDB coverage lookup
        (text + crop + state + domain + vector).  Pass ``None`` to skip.
    review_pop_collection
        Reserved for future PoP coverage checks; accepted for API stability
        but currently unused.
    embed_fn
        Callable ``(list[str]) -> np.ndarray`` of shape ``(n, dim)``.
        Will L2-normalise outputs as a safety net.
    now
        Clock source (defaults to timezone-aware ``datetime.now(timezone.utc)``).
    similarity_threshold
        Cosine threshold for DBSCAN clustering (converted to ``eps`` as
        ``1 - similarity_threshold``).
    """
    now_fn = now or (lambda: datetime.now(timezone.utc))

    t0 = time.perf_counter()
    raw_docs = fetch_disclaimer_queries(
        collection=review_collection,
        now=now_fn,
        lookback_days=lookback_days,
    )
    if not raw_docs:
        log.warning("[gdb-gap] no disclaimer queries found – returning empty report")
        empty = _empty_report(now_fn(), lookback_days, growth_window_days,
                              demand_window_days)
        empty["elapsed_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        return empty

    # Encode + cluster
    unique_texts, embeddings = encode_queries(raw_docs, embed_fn=embed_fn)
    labels, cluster_map = cluster_queries(
        unique_texts,
        embeddings,
        eps=max(1.0 - similarity_threshold, 0.01),
        min_samples=min_samples,
    )

    # Real current vs previous 7-day demand (anchored on now_fn()).
    demand = current_vs_previous_demand(
        raw_docs,
        window_days=demand_window_days,
        growth_window_days=growth_window_days,
        now=now_fn,
    )
    per_week = weekly_demand(raw_docs, now=now_fn)
    growth_overall = weekly_growth_pct(per_week)

    # Index docs by cleaned query text so we can map cluster ids back.
    text_to_doc_index: dict[str, list[int]] = defaultdict(list)
    for i, d in enumerate(raw_docs):
        t = query_to_text(d)
        if t:
            text_to_doc_index[t].append(i)

    clusters: list[GapCluster] = []
    for cid, indices in cluster_map.items():
        if cid == -1:
            for idx in indices:
                clusters.extend(_singleton(
                    raw_docs=raw_docs,
                    text=unique_texts[idx],
                    doc_ids=text_to_doc_index.get(unique_texts[idx], []),
                    now_fn=now_fn,
                    demand_window_days=demand_window_days,
                    growth_window_days=growth_window_days,
                    golden_collection=review_golden_collection,
                    cluster_embedding=(embeddings[idx]
                                       if idx < embeddings.shape[0] else None),
                ))
            continue
        cluster = _cluster_from_indices(
            raw_docs=raw_docs,
            texts=unique_texts,
            indices=indices,
            text_to_doc_index=text_to_doc_index,
            cid=cid,
            demand=demand,
            growth_pct=growth_overall,
            now_fn=now_fn,
            demand_window_days=demand_window_days,
            growth_window_days=growth_window_days,
            golden_collection=review_golden_collection,
            cluster_embedding=(
                _mean_embedding(embeddings, indices)
                if indices else None
            ),
        )
        clusters.append(cluster)

    # Promote any indexed-but-unused text to a singleton so we never
    # silently drop a query that wasn't part of any cluster.
    used_texts = {unique_texts[i] for idxs in cluster_map.values()
                  for i in idxs}
    for t, ids in text_to_doc_index.items():
        if t in used_texts:
            continue
        clusters.extend(_singleton(
            raw_docs=raw_docs,
            text=t,
            doc_ids=ids,
            now_fn=now_fn,
            demand_window_days=demand_window_days,
            growth_window_days=growth_window_days,
            golden_collection=review_golden_collection,
            cluster_embedding=None,
        ))

    # Stable sort: priority_score desc, then cluster_id asc.
    clusters.sort(key=lambda c: (-c.priority_score, c.cluster_id))

    top = [c.to_dict() for c in clusters[:10]]
    coverage_bands = _count_by_band(clusters)

    report = GapReport(
        report_id=f"gap-{int(time.time())}",
        generated_at=now_fn().isoformat(timespec="seconds").replace(
            "+00:00", "Z"
        ) if now_fn().tzinfo is not None else now_fn().isoformat(timespec="seconds") + "Z",
        window={
            "lookback_days": lookback_days,
            "growth_window_days": growth_window_days,
            "demand_window_days": demand_window_days,
        },
        total_queries_analyzed=len(raw_docs),
        total_clusters_found=len(clusters),
        gaps_by_priority=_count_by_priority(clusters),
        coverage_bands=coverage_bands,
        top_gaps=top,
        coverage_heatmap=build_coverage_heatmap(clusters),
        recommendations=build_recommendations(clusters),
        clusters=[c.to_dict() for c in clusters],
    )
    out = report.to_dict()
    out["current_query_count"]  = demand["current"]
    out["previous_query_count"] = demand["previous"]
    out["recent_query_count"]   = demand["recent_total"]
    out["elapsed_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    log.info(
        "[gdb-gap] report built: clusters=%d current7d=%d prev7d=%d (%.0fms)",
        len(clusters), demand["current"], demand["previous"],
        out["elapsed_ms"],
    )
    return out


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _empty_report(now: datetime,
                  lookback_days: int,
                  growth_window_days: int,
                  demand_window_days: int) -> dict:
    ts = (now.isoformat(timespec="seconds") + "Z"
          if now.tzinfo is None else
          now.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"))
    return GapReport(
        report_id=f"gap-{int(time.time())}",
        generated_at=ts,
        window={"lookback_days": lookback_days,
                "growth_window_days": growth_window_days,
                "demand_window_days": demand_window_days},
        total_queries_analyzed=0,
        total_clusters_found=0,
        gaps_by_priority={"critical": 0, "high": 0, "medium": 0, "low": 0},
        coverage_bands={STRONG: 0, PARTIAL: 0, GAP: 0},
        top_gaps=[],
        coverage_heatmap={},
        recommendations=[
            "No disclaimer-triggered queries in the lookback window – nothing to act on."
        ],
        clusters=[],
    ).to_dict() | {"current_query_count": 0, "previous_query_count": 0,
                   "recent_query_count": 0, "elapsed_ms": 0.0}


def _mean_embedding(embeddings: np.ndarray, indices: Sequence[int]) -> np.ndarray | None:
    """Return the L2-normalised mean of the embeddings at ``indices``."""
    if embeddings.shape[0] == 0 or not indices:
        return None
    sub = np.asarray(embeddings[list(indices)], dtype=np.float32)
    if sub.size == 0:
        return None
    mean = sub.mean(axis=0)
    n = float(np.linalg.norm(mean))
    if n == 0.0:
        return mean
    return (mean / n).astype(np.float32)


def _cluster_from_indices(
    *,
    raw_docs: list[dict],
    texts: list[str],
    indices: list[int],
    text_to_doc_index: dict[str, list[int]],
    cid: int,
    demand: dict[str, int],
    growth_pct: float,
    now_fn: Callable[[], datetime],
    demand_window_days: int,
    growth_window_days: int,
    golden_collection: Any | None,
    cluster_embedding: np.ndarray | None,
) -> GapCluster:
    cluster_texts = [texts[i] for i in indices]
    matched_docs: list[dict] = []
    for t in cluster_texts:
        for di in text_to_doc_index.get(t, []):
            matched_docs.append(raw_docs[di])

    crops: set[str] = set()
    states: set[str] = set()
    domain_counter: Counter[str] = Counter()
    for d in matched_docs:
        det = d.get("details") or {}
        c = _safe_get(det, CROP_FIELD, "Crop", "crop")
        s = _safe_get(det, STATE_FIELD, "State", "state")
        if c: crops.add(c)
        if s: states.add(s)
        # Prefer the operator-assigned domain if present, else infer.
        op_domain = _safe_get(det, DOMAIN_FIELD, "Domain", "category", "Category")
        if op_domain:
            domain_counter[op_domain.lower()] += 1

    # Cluster-specific current/previous 7-day counts.
    anchor = now_fn()
    cur_start   = anchor - timedelta(days=demand_window_days)
    prev_start  = anchor - timedelta(days=2 * demand_window_days)
    cur_count, prev_count, recent_count = 0, 0, 0
    for d in matched_docs:
        ts = d.get("created_at")
        if not isinstance(ts, datetime):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= anchor - timedelta(days=growth_window_days):
            recent_count += 1
        if ts >= cur_start:
            cur_count += 1
        elif ts >= prev_start:
            prev_count += 1

    # Cluster-level growth across the cluster's own weekly counts.
    cluster_weeks: Counter[str] = Counter()
    for d in matched_docs:
        ts = d.get("created_at")
        if isinstance(ts, datetime):
            y, w = _iso_week(ts)
            cluster_weeks[f"{y}-W{w:02d}"] += 1
    growth = weekly_growth_pct(dict(cluster_weeks))

    priority_score = compute_priority_score(
        current=cur_count,
        previous=prev_count,
        recent_total=recent_count,
        growth_pct=growth,
        unique_crops=len(crops),
        unique_states=len(states),
    )
    priority, action = score_to_priority(priority_score)

    top_crop  = _mode(crops)
    top_state = _mode(states)

    domain = (domain_counter.most_common(1)[0][0]
              if domain_counter else _infer_domain(cluster_texts))

    # Real GDB coverage lookup: try text + (crop, state, domain) and
    # vector search (if cluster_embedding is available).
    coverage = lookup_gdb_coverage_with_vector(
        golden_collection=golden_collection,
        cluster_embedding=cluster_embedding,
        cluster_text=cluster_texts[0] if cluster_texts else "",
        crop=top_crop or None,
        state=top_state or None,
        domain=domain,
    )
    coverage_score = coverage_band_to_score(coverage["band"], coverage["hits"])

    theme = (_top_terms(cluster_texts, k=3)
             or (cluster_texts[0] if cluster_texts else f"cluster-{cid}"))
    return GapCluster(
        cluster_id=f"gap-c{cid}",
        theme=theme,
        queries=cluster_texts,
        query_count=cur_count,
        recent_query_count=recent_count,
        previous_query_count=prev_count,
        total_query_count=len(matched_docs),
        avg_weekly_growth_pct=growth,
        domain=domain,
        crops=sorted(crops),
        states=sorted(states),
        top_crop=top_crop,
        top_state=top_state,
        priority=priority,
        priority_score=priority_score,
        gdb_coverage_band=coverage["band"],
        gdb_coverage_hits=coverage["hits"],
        gdb_coverage_score=coverage_score,
        suggested_action=action,
        sample_queries=cluster_texts[:5],
    )


def _singleton(
    *,
    raw_docs: list[dict],
    text: str,
    doc_ids: list[int],
    now_fn: Callable[[], datetime],
    demand_window_days: int,
    growth_window_days: int,
    golden_collection: Any | None,
    cluster_embedding: np.ndarray | None,
) -> list[GapCluster]:
    """Build a one-query cluster (DBSCAN noise)."""
    if not doc_ids:
        return []
    matched = [raw_docs[i] for i in doc_ids]

    crops: set[str] = set()
    states: set[str] = set()
    domain_counter: Counter[str] = Counter()
    for d in matched:
        det = d.get("details") or {}
        c = _safe_get(det, CROP_FIELD, "Crop", "crop")
        s = _safe_get(det, STATE_FIELD, "State", "state")
        if c: crops.add(c)
        if s: states.add(s)
        op_domain = _safe_get(det, DOMAIN_FIELD, "Domain", "category", "Category")
        if op_domain:
            domain_counter[op_domain.lower()] += 1

    anchor = now_fn()
    cur_start   = anchor - timedelta(days=demand_window_days)
    prev_start  = anchor - timedelta(days=2 * demand_window_days)
    cur_count, prev_count, recent_count = 0, 0, 0
    for d in matched:
        ts = d.get("created_at")
        if not isinstance(ts, datetime):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= anchor - timedelta(days=growth_window_days):
            recent_count += 1
        if ts >= cur_start:
            cur_count += 1
        elif ts >= prev_start:
            prev_count += 1

    priority_score = compute_priority_score(
        current=cur_count,
        previous=prev_count,
        recent_total=recent_count,
        growth_pct=0.0,
        unique_crops=len(crops),
        unique_states=len(states),
    )
    priority, action = score_to_priority(priority_score)

    top_crop  = _mode(crops)
    top_state = _mode(states)
    domain = (domain_counter.most_common(1)[0][0]
              if domain_counter else _infer_domain([text]))

    coverage = lookup_gdb_coverage_with_vector(
        golden_collection=golden_collection,
        cluster_embedding=cluster_embedding,
        cluster_text=text,
        crop=top_crop or None,
        state=top_state or None,
        domain=domain,
    )
    coverage_score = coverage_band_to_score(coverage["band"], coverage["hits"])

    return [GapCluster(
        cluster_id=f"gap-noise-{abs(hash(text)) % (10**8)}",
        theme=_top_terms([text], k=2) or text,
        queries=[text],
        query_count=cur_count,
        recent_query_count=recent_count,
        previous_query_count=prev_count,
        total_query_count=len(matched),
        avg_weekly_growth_pct=0.0,
        domain=domain,
        crops=sorted(crops),
        states=sorted(states),
        top_crop=top_crop,
        top_state=top_state,
        priority=priority,
        priority_score=priority_score,
        gdb_coverage_band=coverage["band"],
        gdb_coverage_hits=coverage["hits"],
        gdb_coverage_score=coverage_score,
        suggested_action=action,
        sample_queries=[text],
    )]


def _count_by_priority(clusters: Sequence[GapCluster]) -> dict:
    out = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for c in clusters:
        out[c.priority] = out.get(c.priority, 0) + 1
    return out


def _count_by_band(clusters: Sequence[GapCluster]) -> dict:
    out = {STRONG: 0, PARTIAL: 0, GAP: 0}
    for c in clusters:
        out[c.gdb_coverage_band] = out.get(c.gdb_coverage_band, 0) + 1
    return out


# ---------------------------------------------------------------------------
# Cache (used by the FastAPI endpoint)
# ---------------------------------------------------------------------------

_CACHED_REPORT: dict | None = None
_CACHED_AT: float | None = None
CACHE_TTL_SECONDS = int(os.getenv("GDB_REPORT_CACHE_TTL", "900"))  # 15 min


def get_cached_report() -> dict | None:
    """Return the cached report if it is fresh, else ``None``."""
    if _CACHED_REPORT is None or _CACHED_AT is None:
        return None
    if (time.time() - _CACHED_AT) > CACHE_TTL_SECONDS:
        return None
    return _CACHED_REPORT


def set_cached_report(report: dict) -> None:
    global _CACHED_REPORT, _CACHED_AT
    _CACHED_REPORT = report
    _CACHED_AT = time.time()


def invalidate_cache() -> None:
    """Clear the cached gap report (used by tests and admin actions)."""
    global _CACHED_REPORT, _CACHED_AT
    _CACHED_REPORT = None
    _CACHED_AT = None


__all__ = [
    "DISCLAIMER_TAG",
    "STRONG",
    "PARTIAL",
    "GAP",
    "SIMILARITY_THRESHOLD",
    "LOOKBACK_DAYS",
    "DEMAND_WINDOW_DAYS",
    "GROWTH_WINDOW_DAYS",
    "GapCluster",
    "GapReport",
    "build_gap_report",
    "build_coverage_heatmap",
    "build_recommendations",
    "normalize_query",
    "fetch_disclaimer_queries",
    "encode_queries",
    "cluster_queries",
    "weekly_demand",
    "weekly_growth_pct",
    "current_vs_previous_demand",
    "compute_priority_score",
    "score_to_priority",
    "lookup_gdb_coverage",
    "lookup_gdb_coverage_with_vector",
    "coverage_band_to_score",
    "get_cached_report",
    "set_cached_report",
    "invalidate_cache",
    "CACHE_TTL_SECONDS",
]