"""Unit tests for the GDB Coverage Gap Detector pipeline (gap_detector.py).

No live MongoDB or embedding model needed: FakeCollection below is a minimal
in-memory stand-in for the two aggregation shapes gap_detector actually issues
(match -> optional unwind on details.domain -> group by crop/state/domain),
and embed_fn is a deterministic bag-of-words vectorizer so cosine similarity
behaves predictably for these fixtures.
"""

from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone

import numpy as np

import gap_detector as gd

# ---------------------------------------------------------------------------
# Minimal in-memory Mongo stand-in
# ---------------------------------------------------------------------------


def _get_path(doc, path):
    cur = doc
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _set_path(doc, path, value):
    parts = path.split(".")
    cur = doc
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = value


def _matches(doc, match: dict) -> bool:
    for key, cond in match.items():
        val = _get_path(doc, key)
        if isinstance(cond, dict):
            if "$in" in cond and val not in cond["$in"]:
                return False
            if "$gte" in cond and not (val is not None and val >= cond["$gte"]):
                return False
            if "$lt" in cond and not (val is not None and val < cond["$lt"]):
                return False
        elif val != cond:
            return False
    return True


class FakeCollection:
    """Just enough of pymongo's Collection API to exercise gap_detector's
    find()/aggregate() calls against fixture data. Not a general emulator.
    """

    def __init__(self, docs: list[dict]):
        self._docs = docs

    def find(self, query, _projection=None):
        return [d for d in self._docs if _matches(d, query)]

    def aggregate(self, pipeline):
        docs = list(self._docs)
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if _matches(d, stage["$match"])]
            elif "$unwind" in stage:
                spec = stage["$unwind"]
                path = spec["path"].lstrip("$")
                preserve = spec.get("preserveNullAndEmptyArrays", False)
                expanded = []
                for d in docs:
                    values = _get_path(d, path)
                    if isinstance(values, list) and values:
                        for v in values:
                            clone = copy.deepcopy(d)
                            _set_path(clone, path, v)
                            expanded.append(clone)
                    elif preserve:
                        expanded.append(d)
                docs = expanded
            elif "$group" in stage:
                buckets: dict[tuple, int] = {}
                for d in docs:
                    crop = _get_path(d, "details.normalised_crop") or _get_path(d, "details.crop") or "Unknown"
                    state = _get_path(d, "details.state") or "Unknown"
                    domain = _get_path(d, "details.domain") or "Unknown"
                    key = (crop, state, domain)
                    buckets[key] = buckets.get(key, 0) + 1
                docs = [
                    {"_id": {"crop": k[0], "state": k[1], "domain": k[2]}, "count": v}
                    for k, v in buckets.items()
                ]
        return docs


def _bag_of_words_embed(texts: list[str]) -> np.ndarray:
    """Deterministic fake embedder: one-hot-ish bag of words, no ML needed."""
    vocab: dict[str, int] = {}
    rows = []
    for text in texts:
        words = gd._tokenize(text)
        for w in words:
            vocab.setdefault(w, len(vocab))
        rows.append(words)
    vectors = np.zeros((len(texts), max(len(vocab), 1)))
    for i, words in enumerate(rows):
        for w in words:
            vectors[i, vocab[w]] = 1.0
    return vectors


# ---------------------------------------------------------------------------
# Pure logic
# ---------------------------------------------------------------------------


def test_gap_question_filter_scopes_to_disclaimer_tag_and_farmer_sources():
    query = gd.gap_question_filter()
    assert query["tag"] == "static_dynamic"
    assert set(query["source"]["$in"]) == {"AJRASAKHA", "WHATSAPP"}
    assert "createdAt" not in query


def test_gap_question_filter_applies_since():
    since = datetime(2026, 1, 1, tzinfo=timezone.utc)
    query = gd.gap_question_filter(since)
    assert query["createdAt"]["$gte"] == since


def test_cluster_by_similarity_groups_near_duplicates_apart_from_unrelated():
    texts = [
        "whitefly attack on cotton leaves",
        "whitefly infestation cotton leaf",
        "wheat rust disease treatment",
    ]
    embeddings = _bag_of_words_embed(texts)
    clusters = gd.cluster_by_similarity(embeddings, threshold=0.45)
    sizes = sorted(len(c) for c in clusters)
    assert sizes == [1, 2]


def test_extract_missing_keywords_excludes_representative_words():
    texts = [
        "whitefly attack on cotton during flowering stage",
        "whitefly problem cotton flowering stage pesticide dosage",
    ]
    representative = "whitefly attack on cotton"
    keywords = gd.extract_missing_keywords(texts, representative)
    assert "flowering" in keywords
    assert "whitefly" not in keywords
    assert "cotton" not in keywords


def test_priority_score_rewards_growth_and_ranks_above_flat_demand():
    flat = gd.priority_score(cluster_size=10, growth_rate=0.0)
    growing = gd.priority_score(cluster_size=10, growth_rate=1.0)
    assert growing > flat
    assert flat == 10.0


def test_priority_level_buckets():
    assert gd.priority_level(25) == "CRITICAL"
    assert gd.priority_level(12) == "HIGH"
    assert gd.priority_level(5) == "MEDIUM"
    assert gd.priority_level(1) == "LOW"


def test_build_coverage_heatmap_classifies_gap_partial_good():
    gdb_counts = {("Wheat", "Punjab", "Pest"): 10, ("Cotton", "Gujarat", "Pest"): 2}
    gap_counts = {("Cotton", "Gujarat", "Pest"): 8, ("Rice", "Bihar", "Disease"): 5}
    cells = {(c.crop, c.state, c.domain): c for c in gd.build_coverage_heatmap(gdb_counts, gap_counts)}

    assert cells[("Wheat", "Punjab", "Pest")].status == "good"
    assert cells[("Cotton", "Gujarat", "Pest")].status == "partial"
    assert cells[("Rice", "Bihar", "Disease")].status == "gap"
    assert cells[("Rice", "Bihar", "Disease")].gdb_count == 0


# ---------------------------------------------------------------------------
# End-to-end report build against the FakeCollection
# ---------------------------------------------------------------------------


def _gap_doc(question: str, *, crop: str, state: str, domain: str, days_ago: int) -> dict:
    return {
        "question": question,
        "tag": "static_dynamic",
        "source": "WHATSAPP",
        "status": "open",
        "details": {"normalised_crop": crop, "state": state, "domain": [domain]},
        "createdAt": datetime.now(timezone.utc) - timedelta(days=days_ago),
    }


def test_build_gap_report_end_to_end():
    docs = [
        _gap_doc("whitefly attack on cotton leaves", crop="Cotton", state="Gujarat", domain="Pest", days_ago=1),
        _gap_doc("whitefly infestation cotton leaf turning yellow", crop="Cotton", state="Gujarat", domain="Pest", days_ago=2),
        _gap_doc("wheat rust disease treatment", crop="Wheat", state="Punjab", domain="Disease", days_ago=3),
        # Already-answered question — must not be treated as a gap.
        {
            "question": "how to irrigate wheat",
            "tag": "dynamic",
            "source": "WHATSAPP",
            "status": "closed",
            "details": {"normalised_crop": "Wheat", "state": "Punjab", "domain": ["Irrigation"]},
            "createdAt": datetime.now(timezone.utc),
        },
    ]
    collection = FakeCollection(docs)

    report = gd.build_gap_report(
        questions_collection=collection,
        embed_fn=_bag_of_words_embed,
        period_days=7,
        lookback_days=30,
        similarity_threshold=0.4,
    )

    assert report["total_disclaimers"] == 3
    assert report["clusters_found"] == 2  # cotton cluster + wheat rust cluster
    cotton_gap = next(g for g in report["top_gaps"] if g["crop"] == "Cotton")
    assert cotton_gap["farmer_demand"] == 2
    # The representative is the longest/most detailed question in the cluster
    # ("...turning yellow"); missing keywords surface words unique to the
    # *other* variation ("leaves"/"attack") that the representative lacks.
    assert "leaves" in cotton_gap["keywords"] or "attack" in cotton_gap["keywords"]

    heatmap = report["coverage_stats"]["heatmap"]
    wheat_disease_cell = next(
        c for c in heatmap if c["crop"] == "Wheat" and c["domain"] == "Disease"
    )
    assert wheat_disease_cell["status"] == "gap"
    assert report["coverage_stats"]["total_combinations"] == len(heatmap)
