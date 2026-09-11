import pytest
from fastapi.testclient import TestClient
from gdb_gap_detector.api.app import app


@pytest.fixture
def test_client(mock_mongo_db):
    """FastAPI TestClient fixture with mock_mongo_db database injected."""
    with TestClient(app) as client:
        yield client


def test_health_endpoint(test_client):
    """Test GET /health endpoint status."""
    response = test_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "gdb_gap_detector"


def test_dashboard_endpoint(test_client):
    """Test GET /dashboard serves HTML dashboard."""
    response = test_client.get("/dashboard")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<!DOCTYPE html>" in response.text or "GDB Gap Detector" in response.text


def test_gap_report_json_and_markdown_endpoints(test_client):
    """Test GET /api/v1/gap-report (JSON) and GET /api/v1/gap-report/markdown."""
    response_json = test_client.get("/api/v1/gap-report?period_days=30")
    assert response_json.status_code == 200
    data = response_json.json()
    assert data["report_type"] == "weekly_gap_report"
    assert "top_gaps" in data

    response_md = test_client.get("/api/v1/gap-report/markdown?period_days=30")
    assert response_md.status_code == 200
    assert "# 🌾 Weekly GDB Coverage Gap Report" in response_md.text


def test_clusters_endpoint(test_client):
    """Test GET /api/v1/clusters endpoint."""
    response = test_client.get("/api/v1/clusters?period_days=30")
    assert response.status_code == 200
    clusters = response.json()
    assert isinstance(clusters, list)


def test_heatmap_endpoint(test_client):
    """Test GET /api/v1/heatmap endpoint."""
    response = test_client.get("/api/v1/heatmap?period_days=30")
    assert response.status_code == 200
    cells = response.json()
    assert isinstance(cells, list)


def test_export_csv_endpoint(test_client):
    """Test GET /api/v1/export/csv streaming response."""
    response = test_client.get("/api/v1/export/csv?period_days=30")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "Cluster Topic" in response.text or "Trend Status" in response.text


def test_run_now_endpoint(test_client):
    """Test POST /api/v1/run-now pipeline trigger."""
    response = test_client.post("/api/v1/run-now?period_days=30")
    assert response.status_code == 200
    data = response.json()
    assert data["total_disclaimers"] > 0


def test_historical_reports_endpoint(test_client):
    """Test GET /api/v1/gap-reports/history."""
    # Run pipeline once to persist a report
    test_client.post("/api/v1/run-now?period_days=30")

    response = test_client.get("/api/v1/gap-reports/history?limit=10")
    assert response.status_code == 200
    reports = response.json()
    assert len(reports) >= 1


def test_historical_report_by_id_not_found(test_client):
    """Test GET /api/v1/gap-reports/{id} 404 handling."""
    response = test_client.get("/api/v1/gap-reports/non_existent_id_12345")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_scheduler_status_endpoints(test_client, mocker):
    """Test GET /api/v1/scheduler/status, POST /scheduler/start and stop."""
    mocker.patch("gdb_gap_detector.api.routers.scheduler.get_scheduler_status", return_value={"running": True})
    mocker.patch("gdb_gap_detector.api.routers.scheduler.start_scheduler")
    mocker.patch("gdb_gap_detector.api.routers.scheduler.stop_scheduler")
    mocker.patch("gdb_gap_detector.worker.jobs.start_scheduler")
    mocker.patch("gdb_gap_detector.worker.jobs.stop_scheduler")

    resp_status = test_client.get("/api/v1/scheduler/status")
    assert resp_status.status_code == 200
    assert "running" in resp_status.json()

    resp_start = test_client.post("/api/v1/scheduler/start")
    assert resp_start.status_code == 200

    resp_stop = test_client.post("/api/v1/scheduler/stop")
    assert resp_stop.status_code == 200
