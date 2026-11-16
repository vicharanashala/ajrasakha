import os
from datetime import datetime, timedelta, timezone

os.environ["MONGO_URI"] = "mongomock://"
os.environ["EMBEDDING_BACKEND"] = "tfidf"
os.environ["ENABLE_SCHEDULER"] = "0"
os.environ["SOURCE_MODE"] = "questions"
os.environ["AS_OF"] = ""
os.environ["OUT_DB"] = ""
os.environ["LOOKBACK_DAYS"] = "90"

import mongomock  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.normalize import classify_intent, norm_crop, norm_domain, norm_state  # noqa: E402
from app.pipeline import priority_score, run_pipeline, trend_stats  # noqa: E402
from app.seed import generate  # noqa: E402

NOW = datetime(2026, 11, 12, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def db():
    d = mongomock.MongoClient()["t"]
    d["questions"].insert_many(generate(now=NOW))
    return d


@pytest.fixture(scope="module")
def report(db):
    return run_pipeline(now=NOW, db=db)


def test_normalisation():
    assert norm_crop("paddy") == "Rice"
    assert norm_crop({"name": "tomato"}) == "Tomato"
    assert norm_crop("") == "Unknown"
    assert norm_state("UP") == "Uttar Pradesh"
    assert norm_domain(["plant protection", "x"]) == "Plant Protection"
    assert classify_intent("Which pesticide for whitefly?") == "Pest & disease control"
    assert classify_intent("what is mandi price today") == "Market & price"
    assert classify_intent("hello") == "General advisory"


def test_trend_labels():
    recent = [NOW - timedelta(days=i) for i in range(1, 6)]
    assert trend_stats(recent, NOW)["trend"] == "New"
    older = [NOW - timedelta(days=8 + i) for i in range(3)]
    assert trend_stats(older + recent[:2], NOW)["trend"] == "Declining"  # 3 -> 2 per week
    surging = [NOW - timedelta(days=1)] * 8 + [NOW - timedelta(days=9)] * 2
    assert trend_stats(surging, NOW)["trend"] == "Surging"


def test_priority_score_monotonic():
    assert priority_score(50, 50, 1.0, 5) > priority_score(10, 50, 1.0, 5)
    assert priority_score(20, 50, 2.0, 3) > priority_score(20, 50, -0.5, 3)


def test_ignores_testing_and_non_agri(report):
    labels = " ".join(c["label"] for c in report["top_clusters"])
    assert "test question" not in labels and "cricket" not in labels


def test_report_shape_and_ranking(report):
    top = report["top_clusters"]
    assert 0 < len(top) <= 20
    scores = [c["priority_score"] for c in top]
    assert scores == sorted(scores, reverse=True)
    assert [c["rank"] for c in top] == list(range(1, len(top) + 1))
    assert all(c["open"] >= 3 for c in top)


def test_clusters_do_not_mix_crops(report):
    for c in report["top_clusters"]:
        assert c["crop"] != "Unknown" and c["domain"] != "Unknown"


def test_hot_topics_are_flagged_growing(report):
    hot = {c["crop"] for c in report["top_clusters"] if c["trend"] in ("Surging", "Growing", "New")}
    assert {"Chilli", "Tomato"} & hot


def test_poorly_covered_crops_outrank_staples(report):
    ranks = {}
    for c in report["top_clusters"]:
        ranks.setdefault(c["crop"], c["rank"])
    assert ranks.get("Chilli", 99) < ranks.get("Wheat", 100)


def test_outreach_present(report):
    assert report["outreach"] and "recommendation" in report["outreach"][0]


def test_pipeline_idempotent_per_week(db):
    run_pipeline(now=NOW, db=db)
    run_pipeline(now=NOW, db=db)
    assert db["gdb_gap_reports"].count_documents({}) == 1


def test_api(db, monkeypatch):
    import app.db as appdb
    import app.main as main

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(appdb, "get_db", lambda: db)
    run_pipeline(now=NOW, db=db)
    with TestClient(main.app) as client:
        assert client.get("/api/health").status_code == 200
        r = client.get("/api/reports/latest?top=5").json()
        assert len(r["top_clusters"]) == 5
        h = client.get("/api/heatmap?rows=crop&cols=state").json()
        assert h["cells"] and {c["band"] for c in h["cells"]} & {"gap", "partial", "strong"}
        assert client.get("/api/heatmap?rows=crop&cols=crop").status_code == 400
        assert client.get("/api/clusters?crop=Chilli").json()
        csv = client.get("/api/reports/latest/export.csv")
        assert csv.status_code == 200 and csv.text.startswith("rank,")
        assert "# GDB Gap Report" in client.get("/api/reports/latest/export.md").text
