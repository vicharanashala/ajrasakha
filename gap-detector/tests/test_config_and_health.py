from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import app


def test_profiles_apply_defaults_and_overrides():
    demo = Settings(ace_profile="demo", _env_file=None)
    prod = Settings(ace_profile="prod", _env_file=None)
    assert demo.min_cluster_size == 2 and prod.min_cluster_size == 3
    assert demo.gap_report_period_days == 90 and prod.gap_report_period_days == 30
    explicit = Settings(ace_profile="prod", min_cluster_size=5, _env_file=None)
    assert explicit.min_cluster_size == 5
    assert abs(sum(demo.gap_weights.values()) - 1.0) < 1e-9


def test_health_without_db():
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["profile"] == "demo"
    assert body["thresholds"]["min_cluster_size"] == 2
