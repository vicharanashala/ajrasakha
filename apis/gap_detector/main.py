from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from .engine import run_gap_analysis
import random

app = FastAPI(
    title="GDB Coverage Gap Detector",
    description="API for analyzing disclaimer-triggered queries and identifying GDB coverage gaps.",
    version="1.0.0"
)

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "gap_detector"}

@app.get("/api/v1/clusters")
def get_clusters():
    """Returns the top 20 prioritized coverage gaps based on the latest data."""
    try:
        report = run_gap_analysis()
        return report
    except Exception as e:
        return {"error": str(e), "top_gaps": []}

@app.get("/api/v1/heatmap")
def get_heatmap_data():
    """
    Returns mock heatmap data for now.
    In a full implementation, this aggregates clusters by crop/state/domain.
    """
    states = ["Maharashtra", "Punjab", "Gujarat", "Karnataka"]
    crops = ["Cotton", "Wheat", "Chilli", "Tomato"]
    
    data = []
    for state in states:
        for crop in crops:
            data.append({
                "id": f"{state}-{crop}",
                "state": state,
                "crop": crop,
                "value": random.randint(10, 100) # Mock coverage score/gap frequency
            })
    return {"heatmap": data}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
