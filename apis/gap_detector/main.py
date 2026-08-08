from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from engine import run_gap_analysis

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
    Returns actual heatmap data aggregated from the gap analysis clusters.
    """
    from engine import get_heatmap_data as engine_get_heatmap
    try:
        return engine_get_heatmap()
    except Exception as e:
        return {"heatmap": [], "error": str(e)}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
