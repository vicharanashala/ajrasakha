from datetime import datetime, timedelta

import torch
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.ingest import load_disclaimer_queries, load_gdb_entries
from backend.app.models import DisclaimerQuery
from backend.app.services import embeddings as emb
from backend.app.services.clustering import (
    agglomerative_labels,
    cluster_keywords,
    cluster_queries,
    make_title,
)
from backend.app.services.coverage import build_heatmap, gaps_by
from backend.app.services.gap_scoring import (
    growth_rate,
    period_bounds,
    priority_from_score,
    score_clusters,
    trend_score,
    weekly_counts,
)
from pipeline.run_gap_report import run_gap_pipeline

# The hash embedder is far cruder than the real model, so tests use a looser threshold.
SETTINGS = Settings(
    ace_profile="demo", embedding_backend="hash", cluster_distance_threshold=0.7, _env_file=None
)


def _q(text, ts, state=None, domain=None, crop=None, farmer="f", ref=None):
    return DisclaimerQuery(
        source_ref=ref or f"t:{text[:12]}:{ts.isoformat()}",
        source="disclaimer_logs",
        query=text,
        query_normalized=text.lower(),
        farmer_key=farmer,
        state=state,
        domain=domain,
        crop=crop,
        timestamp=ts,
    )


# ---------------------------------------------------------------- embeddings


def test_hash_embedder_is_deterministic_and_normalised():
    e = emb.HashEmbedder()
    v1 = e.embed(["yellow rust in wheat", "wheat yellow rust"])
    v2 = e.embed(["yellow rust in wheat", "wheat yellow rust"])
    assert torch.allclose(v1, v2)
    assert torch.allclose(v1.norm(dim=1), torch.ones(2), atol=1e-5)
    sim = torch.nn.functional.cosine_similarity(v1[0:1], v1[1:2]).item()
    assert sim > 0.5  # shared words -> similar


def test_embedding_cache_roundtrip(mongo):
    db = mongo["ace_insights"]
    e = emb.HashEmbedder()
    first = emb.embed_texts(["a b c", "d e f", "a b c"], e, db)
    assert first.shape == (3, emb.HASH_DIM)
    assert db["embedding_cache"].count_documents({}) == 2  # duplicate text embedded once
    second = emb.embed_texts(["a b c"], e, db)
    assert torch.allclose(first[0], second[0])
    assert db["embedding_cache"].count_documents({}) == 2


# ---------------------------------------------------------------- clustering


def test_agglomerative_groups_similar_texts():
    e = emb.HashEmbedder()
    texts = [
        "yellow rust on wheat leaves which spray",
        "wheat yellow rust disease which spray to use",
        "pink bollworm attack in cotton control",
        "cotton pink bollworm damage control",
        "how to make money fast",
    ]
    labels = agglomerative_labels(e.embed(texts), distance_threshold=0.7)
    assert labels[0] == labels[1]
    assert labels[2] == labels[3]
    assert labels[0] != labels[2]
    assert labels[4] not in (labels[0], labels[2])
    assert agglomerative_labels(torch.zeros((0, 4)), 0.5) == []
    assert agglomerative_labels(torch.ones((1, 4)), 0.5) == [0]


def test_keywords_and_title():
    texts = ["pink bollworm attack in cotton", "cotton pink bollworm damage"]
    kws = cluster_keywords(texts, texts + ["wheat rust", "rice blast"])
    assert kws[:3] and "bollworm" in kws and "pink" in kws
    assert (
        make_title(["bollworm", "pink"], "Cotton", "Pest Control")
        == "Cotton Bollworm Pink Pest Control"  # domain words are not repeated
    )
    assert make_title([], None, "General") == "Uncategorised"


def test_cluster_queries_drops_small_groups():
    now = datetime(2026, 9, 1)
    qs = [
        _q("yellow rust on wheat leaves", now, "Punjab", "Crop Disease", "Wheat", "a"),
        _q("wheat yellow rust which spray", now, "Haryana", "Crop Disease", "Wheat", "b"),
        _q("how to make money fast", now, None, "General", None, "c"),
    ]
    e = emb.HashEmbedder()
    raw = cluster_queries(qs, e.embed([q.query for q in qs]), 0.7, min_cluster_size=2)
    assert len(raw) == 1
    assert set(raw[0].member_idx) == {0, 1}
    assert raw[0].title.startswith("Wheat")
    assert len(raw[0].representative_idx) == 2


# ---------------------------------------------------------------- scoring


def test_weekly_counts_growth_and_trend():
    start = datetime(2026, 8, 1)
    end = start + timedelta(days=27)
    ts = [start + timedelta(days=d) for d in (0, 1, 15, 16, 17, 20)]
    counts = weekly_counts(ts, start, end)
    assert counts == [2, 0, 4, 0]
    assert growth_rate(counts) == 1.0  # 2 -> 4
    assert growth_rate([0, 0, 3, 1]) == 1.0  # new cluster
    assert growth_rate([4, 4, 2, 2]) == -0.5
    assert growth_rate([]) == 0.0
    assert trend_score(0.0) == 0.5 and trend_score(1.0) == 1.0 and trend_score(-1.0) == 0.0
    assert priority_from_score(0.8) == "CRITICAL" and priority_from_score(0.1) == "LOW"


def test_score_clusters_orders_by_gap_score():
    start = datetime(2026, 8, 1)
    end = start + timedelta(days=27)
    big = [
        _q(f"wheat rust {i}", start + timedelta(days=14 + i), "Punjab" if i % 2 else "Haryana",
           "Crop Disease", "Wheat", f"f{i}") for i in range(6)
    ]  # fmt: skip
    small = [
        _q(f"rice blast {i}", start + timedelta(days=i), "Punjab", "Crop Disease", "Rice", "z")
        for i in range(2)
    ]
    qs = big + small
    e = emb.HashEmbedder()
    raw = cluster_queries(qs, e.embed([q.query for q in qs]), 0.9, 2)
    scored = score_clusters(raw, qs, SETTINGS.gap_weights, start, end, "run1")
    assert len(scored) >= 2
    assert scored[0].size == 6 and scored[0].gap_score > scored[-1].gap_score
    assert scored[0].unique_farmers == 6 and scored[0].growth_rate == 1.0
    assert scored[0].cluster_id == "run1-c001"
    assert scored[0].priority_level in ("CRITICAL", "HIGH")
    s, e_ = period_bounds(qs, 30)
    assert e_ == max(q.timestamp for q in qs) and (e_ - s).days == 30


# ---------------------------------------------------------------- coverage


def test_heatmap_and_gap_rollups(mongo):
    qs = load_disclaimer_queries(mongo["farmer_feedback"], mongo["gdb_gap_detector"])
    entries = load_gdb_entries(mongo["farmer_feedback"])
    cov = build_heatmap(qs, entries, good=0.6, partial=0.3)
    assert cov.total_combinations == cov.covered + cov.partial + cov.gaps
    cells = {(c.domain, c.state): c for c in cov.heatmap}
    # cotton bollworm: 2 disclaimers in Maharashtra + 1 GDB entry -> partial (33 %)
    assert cells[("Pest Control", "Maharashtra")].status == "partial"
    # yellow rust wheat in Punjab: 1 disclaimer + 1 GDB entry -> 50 % partial
    assert cells[("Crop Disease", "Punjab")].gdb_count >= 1
    # tomato leaf curl in Gujarat: disclaimers, no GDB -> gap
    assert cells[("Crop Disease", "Gujarat")].status == "gap"
    d = gaps_by(cov.heatmap, "domain")
    assert d and all(set(r) == {"domain", "gap_count"} for r in d)


# ---------------------------------------------------------------- end-to-end


def test_pipeline_end_to_end_with_mongomock(mongo):
    qs = load_disclaimer_queries(mongo["farmer_feedback"], mongo["gdb_gap_detector"])
    entries = load_gdb_entries(mongo["farmer_feedback"])
    out = mongo["ace_insights"]
    report = run_gap_pipeline(qs, entries, SETTINGS, out, period_days=90, now=datetime(2026, 9, 6))
    # 9 queries in the window; the "how to make money fast" row is off-topic AND on the
    # test channel, so it is excluded from the analysis and counted under the first reason.
    assert report.total_disclaimers == 8
    assert report.excluded_non_agricultural == 1 and report.excluded_test_traffic == 0
    assert report.clusters_found >= 2
    assert report.top_gaps and report.top_gaps[0].recommended_action
    assert out["gap_reports"].count_documents({}) == 1
    assert out["clusters"].count_documents({"run_id": report.run_id}) == report.clusters_found
    # one domain x state heatmap and one domain x state x crop heatmap per run
    assert out["coverage_heatmap"].count_documents({"run_id": report.run_id}) == 2
    assert report.crop_coverage is not None
    assert any(c.crop for c in report.crop_coverage.heatmap)  # crop dimension is populated
    assert all(set(r) == {"crop", "gap_count"} for r in report.crops_with_gaps)
    assert out["disclaimer_queries"].count_documents({}) == 9
    # idempotent on the input side: a second run does not duplicate disclaimer_queries
    run_gap_pipeline(qs, entries, SETTINGS, out, period_days=90, now=datetime(2026, 9, 7))
    assert out["disclaimer_queries"].count_documents({}) == 9
    assert out["gap_reports"].count_documents({}) == 2
    # dry-run writes nothing
    before = out["gap_reports"].count_documents({})
    run_gap_pipeline(qs, entries, SETTINGS, None, period_days=90)
    assert out["gap_reports"].count_documents({}) == before


def test_gaps_api_serves_latest_report(mongo, monkeypatch):
    import backend.app.routers.gaps as gaps_router

    qs = load_disclaimer_queries(mongo["farmer_feedback"], mongo["gdb_gap_detector"])
    entries = load_gdb_entries(mongo["farmer_feedback"])
    out = mongo["ace_insights"]
    run_gap_pipeline(qs, entries, SETTINGS, out, period_days=90, now=datetime(2026, 9, 6))
    monkeypatch.setattr(gaps_router, "get_output_db", lambda: out)

    from backend.app.main import app

    client = TestClient(app)
    rep = client.get("/gaps/report/latest").json()
    assert rep["report_type"] == "weekly_gap_report" and rep["top_gaps"]
    assert client.get("/gaps/summary").json()["clusters_found"] == rep["clusters_found"]
    assert len(client.get("/gaps/clusters").json()) == rep["clusters_found"]
    assert client.get("/gaps/heatmap").json()["total_combinations"] > 0
    assert client.get("/gaps/reports").status_code == 200
    assert client.get("/gaps/clusters", params={"crop": "Wheat"}).status_code == 200

    # crop-level heatmap is served from the same run
    crop_map = client.get("/gaps/heatmap", params={"by_crop": True}).json()
    assert crop_map["dimension"] == "domain_state_crop"
    assert any(c["crop"] for c in crop_map["heatmap"])
    assert client.get("/gaps/heatmap", params={"run_id": "nope"}).status_code == 404

    # weekly trend buckets by ISO week in Python (no $dateTrunc, works on any Mongo)
    tr = client.get("/gaps/trends", params={"weeks": 52}).json()
    assert tr["weeks"] == sorted(tr["weeks"]) and tr["by_domain"]
    assert all(wk in tr["weeks"] for series in tr["by_domain"].values() for wk in series)
    assert sum(n for series in tr["by_domain"].values() for n in series.values()) == 9
    assert client.get("/gaps/trends", params={"weeks": 1}).json()["weeks"] != tr["weeks"]
