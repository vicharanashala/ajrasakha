from fastapi.testclient import TestClient
from .main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "gap_detector"}

def test_clusters_endpoint():
    response = client.get("/api/v1/clusters")
    assert response.status_code == 200
    data = response.json()
    assert "top_gaps" in data
    
def test_heatmap_endpoint():
    response = client.get("/api/v1/heatmap")
    assert response.status_code == 200
    data = response.json()
    assert "heatmap" in data
    assert len(data["heatmap"]) > 0
