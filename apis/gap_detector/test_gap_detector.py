import os
os.environ["MONGO_URL"] = "mongodb://localhost:27017/test"

from fastapi.testclient import TestClient
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
import numpy as np

from main import app

client = TestClient(app)

# Dummy timestamps
now = datetime.now(timezone.utc)
recent_ts = now.isoformat()
old_ts = (now - timedelta(days=20)).isoformat()

DUMMY_QUERIES = [
    # Cluster 1 (Growing, Cotton, Maharashtra) - 6 queries
    {"text": "cotton disease", "crop": "Cotton", "state": "Maharashtra", "domain": "Disease", "timestamp": recent_ts},
    {"text": "cotton leaf curl", "crop": "Cotton", "state": "Maharashtra", "domain": "Disease", "timestamp": recent_ts},
    {"text": "cotton pests", "crop": "Cotton", "state": "Maharashtra", "domain": "Disease", "timestamp": recent_ts},
    {"text": "cotton blight", "crop": "Cotton", "state": "Maharashtra", "domain": "Disease", "timestamp": recent_ts},
    {"text": "cotton spots", "crop": "Cotton", "state": "Maharashtra", "domain": "Disease", "timestamp": recent_ts},
    {"text": "cotton issues", "crop": "Cotton", "state": "Maharashtra", "domain": "Disease", "timestamp": old_ts},
    
    # Cluster 2 (Shrinking/Flat, Wheat, Punjab) - 4 queries
    {"text": "wheat rust", "crop": "Wheat", "state": "Punjab", "domain": "Disease", "timestamp": old_ts},
    {"text": "wheat yellow rust", "crop": "Wheat", "state": "Punjab", "domain": "Disease", "timestamp": old_ts},
    {"text": "wheat brown rust", "crop": "Wheat", "state": "Punjab", "domain": "Disease", "timestamp": old_ts},
    {"text": "wheat problems", "crop": "Wheat", "state": "Punjab", "domain": "Disease", "timestamp": recent_ts},
]

# We need dummy embeddings that cluster appropriately.
# We'll make the first 6 identical or very close, and the next 4 identical to each other but far from first 6.
def dummy_get_embeddings(texts):
    embeds = []
    for t in texts:
        if "cotton" in t.lower():
            embeds.append(np.array([1.0, 0.0, 0.0] * 128)) # 384 dim
        else:
            embeds.append(np.array([0.0, 1.0, 0.0] * 128))
    return embeds

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "gap_detector"}

@patch("engine.get_disclaimer_triggered_queries")
@patch("engine.get_embeddings")
def test_clusters_endpoint(mock_get_embeddings, mock_get_queries):
    mock_get_queries.return_value = DUMMY_QUERIES
    mock_get_embeddings.side_effect = dummy_get_embeddings
    
    response = client.get("/api/v1/clusters")
    assert response.status_code == 200
    data = response.json()
    assert "top_gaps" in data
    
    # Verify our logic worked
    top_gaps = data["top_gaps"]
    assert len(top_gaps) == 2
    
    # Ensure they have crop/state tags
    cotton_cluster = next(g for g in top_gaps if g["crop"] == "Cotton")
    assert cotton_cluster["state"] == "Maharashtra"
    assert cotton_cluster["trend"] == "growing"
    
    wheat_cluster = next(g for g in top_gaps if g["crop"] == "Wheat")
    assert wheat_cluster["state"] == "Punjab"

@patch("engine.get_disclaimer_triggered_queries")
@patch("engine.get_embeddings")
def test_heatmap_endpoint(mock_get_embeddings, mock_get_queries):
    mock_get_queries.return_value = DUMMY_QUERIES
    mock_get_embeddings.side_effect = dummy_get_embeddings
    
    response = client.get("/api/v1/heatmap")
    assert response.status_code == 200
    data = response.json()
    assert "heatmap" in data
    
    heatmap = data["heatmap"]
    assert len(heatmap) == 2
