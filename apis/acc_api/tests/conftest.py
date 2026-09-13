"""
Shared pytest fixtures for the GDB Coverage Gap Detector test suite.

Goals
-----
* Deterministic — no randomness, no real clocks.
* No network — every MongoDB call and embedding call goes through
  in-process fakes that live entirely inside the test process.
* No SentenceTransformer download — the module never imports
  ``sentence_transformers`` (only ``main.py`` does, and that is patched
  per test).

A single fixed clock is shared across every test (``FIXED_NOW``) so that
ISO-week arithmetic, lookback windows, and demand windows stay stable
across operating systems and time zones.
"""

from __future__ import annotations

import os
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pytest


# ---------------------------------------------------------------------------
# Stub heavy / external dependencies BEFORE importing ``main``.
# ---------------------------------------------------------------------------
#
# ``main.py`` does ``from sentence_transformers import SentenceTransformer``
# at module scope.  The real package is multi-megabyte, network-dependent,
# and never instantiated by these tests (the lazy loader ``_get_model`` is
# patched per-test).  Installing a tiny stub here lets the module import
# without ever loading the real package.

def _install_sentence_transformers_stub() -> None:
    if "sentence_transformers" in sys.modules:
        return
    mod = types.ModuleType("sentence_transformers")

    class _StubSentenceTransformer:  # pragma: no cover - never instantiated
        def __init__(self, *a, **kw):
            raise RuntimeError(
                "SentenceTransformer must not be instantiated in tests; "
                "main._get_model should be patched."
            )

    mod.SentenceTransformer = _StubSentenceTransformer  # type: ignore[attr-defined]
    sys.modules["sentence_transformers"] = mod


_install_sentence_transformers_stub()

# ---------------------------------------------------------------------------
# Path / import hooks
# ---------------------------------------------------------------------------

# Make sure ``import gdb_gap_detector`` and ``import main`` work no matter
# where pytest is invoked from.
_TEST_DIR = Path(__file__).resolve().parent
ACC_API_DIR = _TEST_DIR.parent
if str(ACC_API_DIR) not in sys.path:
    sys.path.insert(0, str(ACC_API_DIR))


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Anchored mid-2026 so the same ISO weeks ("2026-W30") appear on every CI
# runner but the date is recent enough to exercise the 7/14-day windows
# used by the detector.
FIXED_NOW: datetime = datetime(2026, 7, 28, 6, 30, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Deterministic fake embedding model
# ---------------------------------------------------------------------------

def _make_token_embed_fn() -> "callable":
    """Return a deterministic ``(list[str]) -> np.ndarray`` callable.

    Implementation notes
    --------------------
    * The vocabulary is built from the *set of whitespace tokens* seen
      across all calls.  Two texts sharing the same set of tokens yield
      identical (post-L2) embeddings, so DBSCAN with eps = 1 - threshold
      treats them as members of the same cluster.
    * Distinct sets of tokens produce orthogonal (in normalised space)
      vectors, so dissimilar texts land in different clusters.
    """

    vocab: dict[str, int] = {}

    def _embed(texts: list[str]) -> np.ndarray:
        if not texts:
            # Match the detector's empty-shape contract exactly.
            return np.zeros((0, 8), dtype=np.float32)
        for t in texts:
            for tok in t.split():
                if tok not in vocab:
                    vocab[tok] = len(vocab)
        dim = max(len(vocab), 8)
        out = np.zeros((len(texts), dim), dtype=np.float32)
        for i, t in enumerate(texts):
            for tok in t.split():
                out[i, vocab[tok]] = 1.0
        return out

    return _embed


# ---------------------------------------------------------------------------
# Fake Mongo collections
# ---------------------------------------------------------------------------

class _FakeCursor:
    """Minimal iterable cursor returned by ``FakeCollection.find``."""

    def __init__(self, docs: list[dict]):
        self._docs = list(docs)

    def __iter__(self):
        return iter(self._docs)


class FakeCollection:
    """In-process stand-in for a MongoDB collection.

    The detector module only calls:

    * ``collection.find(query, projection)`` returning an iterable
    * ``collection.count_documents(filter)`` (golden collection)
    * ``collection.aggregate(pipeline)`` (golden collection, optional)

    This class implements just enough of each to run the pipeline end-to-end
    while letting the tests assert on what arguments were used and what
    results were returned.
    """

    def __init__(
        self,
        docs: list[dict] | None = None,
        counts: dict[Any, int] | None = None,
        aggregations: dict[Any, list[dict]] | None = None,
    ) -> None:
        # Always-include fallback (the test can also push docs directly
        # via ``docs_list.extend([...])``).
        self.docs: list[dict] = list(docs or [])
        self.counts = counts or {}
        self.aggregations = aggregations or {}
        self.find_calls: list[tuple[dict, dict | None]] = []
        self.count_calls: list[dict] = []
        self.aggregate_calls: list[list[dict]] = []

    # The detector always passes ``projection={"_id": 0, ...}`` and then
    # filters the documents in memory based on the structured query that
    # was just executed.  For unit tests we only need to know *what* was
    # queried and return whatever docs are currently registered — the
    # detector itself is responsible for correctness.
    def find(self, query: dict, projection: dict | None = None) -> _FakeCursor:
        self.find_calls.append((dict(query), dict(projection) if projection else None))
        return _FakeCursor(self._apply(query))

    def count_documents(self, filt: dict, **kwargs: Any) -> int:
        self.count_calls.append(dict(filt))
        # Exact key hit wins.
        for k, v in self.counts.items():
            if _matches_filter(k, filt):
                return v
        # Fallback "*" entries match any filter.
        return self.counts.get("*", 0)

    def aggregate(self, pipeline: list[dict], **kwargs: Any) -> list[dict]:
        self.aggregate_calls.append([dict(stage) for stage in pipeline])
        for k, v in self.aggregations.items():
            if _matches_pipeline(k, pipeline):
                return list(v)
        return []

    def _apply(self, query: dict) -> list[dict]:
        """Return the docs that satisfy ``query`` — permissive by design."""
        if not query:
            return list(self.docs)
        clauses = query.get("$and") or []
        if not clauses:
            return list(self.docs)
        out = []
        for doc in self.docs:
            if all(_doc_matches(doc, clause) for clause in clauses):
                out.append(doc)
        return out


def _matches_filter(test_filter: Any, real_filter: Any) -> bool:
    """Loose structural equality on dicts — sufficient for unit tests."""
    return _canonical(test_filter) == _canonical(real_filter)


def _matches_pipeline(test_pipe: Any, real_pipe: Any) -> bool:
    return _canonical(test_pipe) == _canonical(real_pipe)


def _canonical(obj: Any) -> Any:
    """Sort dict keys recursively so two structurally-equal objects match."""
    if isinstance(obj, dict):
        return tuple(sorted((k, _canonical(v)) for k, v in obj.items()))
    if isinstance(obj, list):
        return tuple(_canonical(v) for v in obj)
    return obj


def _doc_matches(doc: dict, clause: dict) -> bool:
    """Best-effort Mongo query match used by the in-process fake.

    Implements just enough of Mongo's query operators to handle the
    shapes built by ``gdb_gap_detector.fetch_disclaimer_queries``
    (``$and`` of ``$or`` blocks) — and falls back to "always matches" for
    anything we don't explicitly recognise.  Per-document correctness is
    the responsibility of the tests, which simply seed ``FakeCollection.docs``
    with the documents they want back.
    """

    # $and must be flattened by the caller; nothing to do here.
    if not isinstance(clause, dict):
        return True

    # $or — match if any sub-clause matches.
    ors = clause.get("$or")
    if ors:
        return any(_doc_matches(doc, sub) for sub in ors)

    for field, val in clause.items():
        if field.startswith("$"):
            continue
        actual = doc.get(field)
        if isinstance(val, dict):
            if "$in" in val:
                if not _in(actual, val["$in"]):
                    return False
                continue
            if "$exists" in val:
                if bool(val["$exists"]) != (field in doc):
                    return False
                continue
            if "$ne" in val:
                if actual == val["$ne"]:
                    return False
                continue
            if "$not" in val:
                continue  # permissive
            if "$gte" in val:
                if not isinstance(actual, datetime) or actual < val["$gte"]:
                    return False
                continue
            if "$type" in val:
                continue
            if "$regex" in val:
                continue
            # Unknown operator — be permissive so unit tests don't get
            # blocked on a single edge case.
            continue
        # Scalar equality — treat missing key as failure.
        if actual != val:
            return False
    return True


def _in(actual: Any, candidates: list[Any]) -> bool:
    if actual is None:
        return False
    return any(actual == c for c in candidates)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fixed_now() -> datetime:
    """The single timestamp used as the *clock* for every test."""
    return FIXED_NOW


@pytest.fixture
def now_fn(fixed_now):
    """Return a no-arg callable that always returns ``fixed_now``."""
    return lambda: fixed_now


@pytest.fixture
def fake_embed_fn():
    """Return a deterministic embed callable (vocab is per-call)."""
    return _make_token_embed_fn()


@pytest.fixture
def fake_sentence_transformer(fake_embed_fn):
    """A stand-in for ``SentenceTransformer`` whose ``.encode`` is the
    same deterministic function used above."""

    class _FakeST:
        encode = staticmethod(fake_embed_fn)

    return _FakeST()


@pytest.fixture
def review_collection() -> FakeCollection:
    """Empty reviewer collection — tests inject docs as needed."""
    return FakeCollection()


@pytest.fixture
def golden_collection() -> FakeCollection:
    """Empty golden collection — tests inject ``counts`` as needed."""
    return FakeCollection()


# ---------------------------------------------------------------------------
# Endpoint test fixtures (no live Mongo, no SentenceTransformer)
# ---------------------------------------------------------------------------

@pytest.fixture
def patched_main(monkeypatch, fake_sentence_transformer):
    """Import ``main`` with ``MongoClient`` + ``_get_model`` patched.

    Yields the freshly-imported module so the test can poke at the
    FastAPI app and the in-process cache.
    """

    # Make sure the env never tries to connect to a real MongoDB when
    # ``main`` is imported.
    monkeypatch.setenv("MONGO_URI", "mongodb://test-host:27017")
    monkeypatch.setenv("GOLDEN_MONGO_URI", "mongodb://test-host:27017")
    monkeypatch.setenv("DB_NAME", "agriai")
    monkeypatch.setenv("GOLDEN_DB_NAME", "golden_db")
    monkeypatch.setenv("COLLECTION_NAME", "questions")
    monkeypatch.setenv("GOLDEN_QA_COLLECTION", "agri_qa_latest")
    monkeypatch.setenv("GOLDEN_POP_COLLECTION", "pop")

    # Stub MongoClient so module-level imports succeed without a server.
    class _StubClient:
        def __init__(self, *a, **kw):
            self._closed = False

        def __getitem__(self, name):
            return _StubDB(name)

        def close(self):
            self._closed = True

    class _StubDB:
        def __init__(self, name):
            self.name = name

        def __getitem__(self, name):
            return _StubCollection(name)

    class _StubCollection:
        def __init__(self, name):
            self.name = name

        def find(self, *a, **kw):
            return iter([])

        def count_documents(self, *a, **kw):
            return 0

        def aggregate(self, *a, **kw):
            return []

        def insert_many(self, docs, *a, **kw):
            return None

    monkeypatch.setattr("pymongo.MongoClient", _StubClient)

    # Now import main.
    if "main" in sys.modules:
        del sys.modules["main"]
    import main as main_module  # type: ignore

    # Replace the lazy model loader with our deterministic fake.
    monkeypatch.setattr(main_module, "_get_model",
                        lambda: fake_sentence_transformer)

    # Clear both caches so each test starts from a known state.
    main_module._GAP_REPORT_CACHE.clear()
    main_module._gdb_invalidate_cache()  # type: ignore[attr-defined]

    # Replace the module-level collection globals with FakeCollections so
    # the pipeline can be exercised end-to-end without any Mongo traffic.
    monkeypatch.setattr(main_module, "reviewer_collection",
                        FakeCollection())
    monkeypatch.setattr(main_module, "golden_qa_collection",
                        FakeCollection())
    monkeypatch.setattr(main_module, "golden_pop_collection",
                        FakeCollection())
    monkeypatch.setattr(main_module, "answers_collection",
                        FakeCollection())
    monkeypatch.setattr(main_module, "users_collection",
                        FakeCollection())

    return main_module


@pytest.fixture
def app_client(patched_main):
    """Return a FastAPI ``TestClient`` wired to the patched ``main`` app."""
    from fastapi.testclient import TestClient

    return TestClient(patched_main.app)


@pytest.fixture
def client(app_client):
    """Convenience alias for ``app_client`` (matches FastAPI conventions)."""
    return app_client


@pytest.fixture
def seed_reviews(fixed_now):
    """Return a small, deterministic corpus of reviewer-questions docs.

    The corpus is what the detector end-to-end test consumes.  Layout:

    * cluster A — "wheat rust punjab" (3 docs: 2 current-week, 1 prior)
    * cluster B — "paddy water bihar" (2 docs: both current-week)
    * noise   — "scheme loan pmkisan" (1 current-week doc — singleton)
    """

    cluster_a = [
        {
            "text": "wheat rust control in punjab",
            "details": {"crop": "Wheat", "state": "Punjab",
                        "domain": "pest"},
            "created_at": fixed_now - timedelta(days=1),
            "tag": "AJRASAKHA_DISCLAIMER",
        },
        {
            "text": "wheat rust control in punjab",
            "details": {"crop": "Wheat", "state": "Punjab",
                        "domain": "pest"},
            "created_at": fixed_now - timedelta(days=3),
            "tag": "AJRASAKHA_DISCLAIMER",
        },
        {
            "text": "wheat rust control in punjab",
            "details": {"crop": "Wheat", "state": "Punjab",
                        "domain": "pest"},
            "created_at": fixed_now - timedelta(days=10),
            "tag": "AJRASAKHA_DISCLAIMER",
        },
    ]
    cluster_b = [
        {
            "text": "paddy water management in bihar",
            "details": {"crop": "Paddy", "state": "Bihar",
                        "domain": "water"},
            "created_at": fixed_now - timedelta(days=2),
            "tag": "AJRASAKHA_DISCLAIMER",
        },
        {
            "text": "paddy water management in bihar",
            "details": {"crop": "Paddy", "state": "Bihar",
                        "domain": "water"},
            "created_at": fixed_now - timedelta(days=4),
            "tag": "AJRASAKHA_DISCLAIMER",
        },
    ]
    noise = [
        {
            "text": "scheme loan pm kisan",
            "details": {"crop": "Wheat", "state": "Punjab",
                        "domain": "scheme"},
            "created_at": fixed_now - timedelta(days=1),
            "tag": "AJRASAKHA_DISCLAIMER",
        },
    ]
    return {"A": cluster_a, "B": cluster_b, "noise": noise}