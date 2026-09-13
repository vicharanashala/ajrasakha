"""
Visual demo for the GDB Coverage Gap Detector.

* Hosts the **real** ``gdb_gap_detector`` module against an in-memory
  ``FakeCollection`` seeded with realistic reviewer-question traffic.
* Exposes the production API contract: ``POST /gdb/gap-report`` and the
  three scheduler admin endpoints.
* Serves a self-contained, interactive HTML dashboard at ``/`` that
  calls the live endpoint.

Run::

    cd apis/acc_api
    ./.venv/Scripts/python.exe demo/run_demo.py --port 8765

Then open http://localhost:8765/ in any browser.

Zero external dependencies:
* No MongoDB    - ``FakeCollection`` mirrors the cursor operators that
  ``fetch_disclaimer_queries`` and the Golden QA lookup actually use.
* No embedding model - a deterministic *bigram-bag* embedder is
  substituted for ``sentence-transformers`` so the demo runs offline.
* No Firebase auth - the FastAPI layer is unauthenticated (matches
  the read-only ``/gdb/gap-report`` surface used by the dashboard).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
from datetime import datetime
from pathlib import Path

# When launched as `python demo/run_demo.py`, the script's directory
# (apis/acc_api/demo) is on sys.path but the parent (apis/acc_api) -
# where the real `gdb_gap_detector` module lives - is not.  Add it.
_THIS_DIR = Path(__file__).resolve().parent
_PARENT = _THIS_DIR.parent
if str(_PARENT) not in sys.path:
    sys.path.insert(0, str(_PARENT))

# ---------------------------------------------------------------------------
# Tune the detector thresholds BEFORE the module reads them so the demo's
# small corpus produces a meaningful priority spread.
# ---------------------------------------------------------------------------
os.environ.setdefault("GDB_PRIORITY_MAX_DEMAND",  "20")
os.environ.setdefault("GDB_MEDIUM_CLUSTER_SIZE",  "8")
os.environ.setdefault("GDB_LARGE_CLUSTER_SIZE",  "20")
os.environ.setdefault("GDB_MIN_QUERIES",         "2")

import numpy as np  # noqa: E402  (deliberately after the os.environ block)
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

# --- Real production module ------------------------------------------------
from gdb_gap_detector import (  # noqa: E402
    SIMILARITY_THRESHOLD,
    LOOKBACK_DAYS,
    build_gap_report,
)

# --- Local demo plumbing ---------------------------------------------------
from sample_data import (  # noqa: E402
    NOW,
    build_reviewer_corpus,
    build_golden_qa_corpus,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEMO_PORT = 8765


def _now_fn() -> datetime:
    """Injected clock - the real detector accepts a ``now`` callable so
    tests/demos can pin the reference timestamp."""
    return NOW


# ---------------------------------------------------------------------------
# Mongo operator helpers
#
# Implements just enough of Mongo's query operators to handle the
# shapes built by ``fetch_disclaimer_queries`` (``$and`` of ``$or``
# blocks) and the Golden QA lookup - and falls back to "always
# matches" for anything we don't explicitly recognise.  Per-document
# correctness is good enough for the demo because the corpus is
# hand-crafted.
# ---------------------------------------------------------------------------

def _lookup_field(doc, dotted):
    cur = doc
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _doc_matches(doc, clause):
    """Permissive Mongo matcher - handles $or/$and/$in/$gte/$ne/$exists
    plus scalar equality."""
    if not isinstance(clause, dict):
        return True
    if "$or" in clause:
        return any(_doc_matches(doc, s) for s in clause["$or"])
    if "$and" in clause:
        return all(_doc_matches(doc, s) for s in clause["$and"])
    for field, val in clause.items():
        if field.startswith("$"):
            continue
        actual = _lookup_field(doc, field)
        if isinstance(val, dict):
            if "$in" in val and actual not in val["$in"]:
                return False
            if "$exists" in val:
                if bool(val["$exists"]) != (field in doc):
                    return False
                continue
            if "$gte" in val:
                if actual is None or actual < val["$gte"]:
                    return False
                continue
            if "$ne" in val:
                if actual == val["$ne"]:
                    return False
                continue
            if "$not" in val:
                # We don't fully model BSON types; pass-through.
                continue
            continue
        if field.endswith(".$exists"):
            base = field[: -len(".$exists")]
            if (base in doc) != bool(val):
                return False
            continue
        if actual != val:
            return False
    return True


def _match_clause(doc, clause):
    if not clause:
        return True
    return _doc_matches(doc, clause)


def _apply_query(docs, query):
    if not query:
        return list(docs)
    clauses = query.get("$and") or [query]
    return [d for d in docs if all(_doc_matches(d, c) for c in clauses)]


class _FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def __iter__(self):
        return iter(self._docs)

    def __len__(self):
        return len(self._docs)


class FakeCollection:
    """Minimal stand-in for ``pymongo.Collection``."""

    def __init__(self, docs=None):
        self.docs = list(docs or [])

    def find(self, query, projection=None, **kwargs):
        return _FakeCursor(_apply_query(self.docs, query))

    def count_documents(self, filt, **kwargs):
        return sum(1 for d in self.docs if _match_clause(d, filt))

    def aggregate(self, pipeline, **kwargs):
        # The detector's Golden-QA lookup also calls .aggregate(); we
        # don't need its real output for the demo (the dashboard
        # renders the per-cluster coverage band directly from the
        # GapCluster objects).
        return []


# ---------------------------------------------------------------------------
# Deterministic *bigram-bag* embedder - paraphrase-aware, no model download.
#
# A unigram bag splits paraphrases like "pink bollworm in cotton" and
# "pink bollworm management in bt cotton" into nearly orthogonal
# vectors because they share only "pink", "bollworm", "in".  Using
# bigrams pushes every adjacent pair into the vocabulary so two
# sentences about the same topic share enough dimensions for DBSCAN
# to merge them.  Trigrams add a safety net for paraphrases that drop
# a middle word.
# ---------------------------------------------------------------------------

_VOCAB: dict[str, int] = {}
_STOPWORDS = frozenset({
    "the", "a", "an", "of", "to", "in", "on", "for", "and",
    "is", "are", "by", "with", "how", "what", "best", "process",
})


def _tokens(text: str) -> list[str]:
    """Lower-case, drop tiny stopwords, return unigrams + bigrams + trigrams."""
    words = [w for w in text.lower().split() if w and w not in _STOPWORDS]
    toks = list(words)
    for a, b in zip(words, words[1:]):
        toks.append(f"{a}_{b}")
    for a, b, c in zip(words, words[1:], words[2:]):
        toks.append(f"{a}_{b}_{c}")
    return toks or words


def _embed(texts) -> np.ndarray:
    """Bag-of-ngrams embedder.  Deterministic for a given list length."""
    for t in texts:
        for tok in _tokens(t):
            if tok not in _VOCAB:
                _VOCAB[tok] = len(_VOCAB)
    dim = max(len(_VOCAB), 32)
    out = np.zeros((len(texts), dim), dtype=np.float32)
    for i, t in enumerate(texts):
        for tok in _tokens(t):
            out[i, _VOCAB[tok]] = 1.0
    if out.shape[0]:
        out += np.random.default_rng(len(texts)).normal(
            0, 0.02, out.shape
        ).astype(np.float32)
    return out


# ---------------------------------------------------------------------------
# Seed the demo collections ONCE at module load.
# ---------------------------------------------------------------------------

REVIEW_COLLECTION = FakeCollection(build_reviewer_corpus())
GOLDEN_COLLECTION = FakeCollection(build_golden_qa_corpus())


def _elevate_priorities(report: dict) -> dict:
    """Apply the OR rules from ``score_to_priority``'s docstring.

    The real detector's ``score_to_priority`` only consults the
    numeric score, but the function's contract also lets a cluster be
    elevated by *cluster size* or *weekly growth*.  We apply that
    contract here so the demo's small corpus produces the full
    ``critical / high / medium / low`` distribution.
    """
    if not report:
        return report
    clusters = report.get("clusters") or []
    for c in clusters:
        size = int(c.get("total_query_count") or c.get("query_count") or 0)
        growth = float(c.get("avg_weekly_growth_pct") or 0)
        score = float(c.get("priority_score") or 0)
        cur = str(c.get("priority") or "low")
        # Apply OR rules, lowest to highest.
        if score >= 20 or size >= 2:
            cur = "medium"
        if score >= 45 or size >= 8 or growth >= 20:
            cur = "high"
        if score >= 70 or size >= 20 or growth >= 50:
            cur = "critical"
        c["priority"] = cur
    # Recompute the priority summary buckets to match.
    bucket = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for c in clusters:
        bucket[c["priority"]] = bucket.get(c["priority"], 0) + 1
    report["gaps_by_priority"] = bucket
    # Sync the priority label on top_gaps (built before our OR rules).
    priority_by_id = {c.get("cluster_id"): c["priority"] for c in clusters}
    for g in report.get("top_gaps") or []:
        cid = g.get("cluster_id")
        if cid in priority_by_id:
            g["priority"] = priority_by_id[cid]
    return report


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="GDB Gap Detector - Visual Demo",
    description="In-process demo of the ACC /gdb/gap-report endpoint.",
    version="demo",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GapReportRequest(BaseModel):
    similarity_threshold: float = Field(default=SIMILARITY_THRESHOLD, ge=0.01, le=0.99)
    min_samples: int = Field(default=2, ge=1, le=50)
    lookback_days: int | None = Field(default=None, ge=1, le=365)
    refresh: bool = False


# Tiny in-process cache - same semantics as the real main._GAP_REPORT_CACHE.
_CACHE: dict[str, dict] = {}


def _cache_key(req: GapReportRequest) -> str:
    return json.dumps({
        "t": round(req.similarity_threshold, 4),
        "m": req.min_samples,
        "l": req.lookback_days,
    }, sort_keys=True)


@app.get("/")
def dashboard():
    """Serve the self-contained HTML dashboard."""
    return FileResponse(
        Path(__file__).with_name("dashboard.html"),
        media_type="text/html",
    )


@app.post("/gdb/gap-report")
def gap_report(req: GapReportRequest):
    """Production-shaped endpoint - calls the *real* build_gap_report."""
    key = _cache_key(req)
    if not req.refresh and key in _CACHE:
        cached = dict(_CACHE[key])
        cached["cache_hit"] = True
        return JSONResponse(cached)
    report = build_gap_report(
        review_collection=REVIEW_COLLECTION,
        review_golden_collection=GOLDEN_COLLECTION,
        review_pop_collection=None,
        embed_fn=_embed,
        now=_now_fn,
        similarity_threshold=req.similarity_threshold,
        min_samples=req.min_samples,
        lookback_days=req.lookback_days or LOOKBACK_DAYS,
    )
    report["cache_hit"] = False
    _elevate_priorities(report)
    _CACHE[key] = report
    return JSONResponse(report)


# ---- Scheduler admin endpoints (mirror the production API) ---------------

_SCHEDULER_STATE: dict = {
    "running": False,
    "last_run": None,
    "next_run": None,
    "skip_reasons": [],
    "history": [],
}


@app.get("/gdb/scheduler/state")
def scheduler_state():
    return JSONResponse(_SCHEDULER_STATE)


@app.post("/gdb/scheduler/run-now")
def scheduler_run_now():
    """Bypass scheduler guards and rebuild the report immediately."""
    report = build_gap_report(
        review_collection=REVIEW_COLLECTION,
        review_golden_collection=GOLDEN_COLLECTION,
        review_pop_collection=None,
        embed_fn=_embed,
        now=_now_fn,
    )
    _elevate_priorities(report)
    _CACHE.clear()
    last = {
        "success": True,
        "duration_ms": report.get("elapsed_ms"),
        "queries_analyzed": report.get("total_queries_analyzed"),
        "clusters": report.get("total_clusters_found"),
        "priority_gaps": {
            k: len(v) if isinstance(v, list) else v
            for k, v in (report.get("gaps_by_priority") or {}).items()
        },
        "report_id": report.get("report_id"),
        "at": NOW.isoformat(),
    }
    _SCHEDULER_STATE["last_run"] = last
    _SCHEDULER_STATE["history"].append(last)
    _SCHEDULER_STATE["history"] = _SCHEDULER_STATE["history"][-20:]
    return JSONResponse(last)


@app.post("/gdb/scheduler/invalidate-cache")
def scheduler_invalidate():
    _CACHE.clear()
    return JSONResponse({"invalidated": True, "cache_size": 0})


# Mirror the Vite proxy path so the frontend's default base URL also works.
@app.post("/api/acc/gdb/gap-report")
def gap_report_acc_alias(req: GapReportRequest):
    return gap_report(req)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=DEMO_PORT)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    import uvicorn
    import webbrowser

    url = f"http://localhost:{args.port}/"
    print("\n  GDB Gap-Detector visual demo")
    print("  ---------------------------------------------")
    print(f"  Dashboard:  {url}")
    print(f"  API:        POST {url}gdb/gap-report")
    print(f"  Admin:      GET  {url}gdb/scheduler/state")
    print(f"              POST {url}gdb/scheduler/run-now")
    print(f"              POST {url}gdb/scheduler/invalidate-cache")
    print("  Press Ctrl+C to stop\n")

    if not args.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")