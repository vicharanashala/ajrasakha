import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pymongo import MongoClient
from dotenv import load_dotenv

# Load env vars
load_dotenv()

app = FastAPI(title="GDB Coverage Gap Detector API")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect to database
db_url = os.getenv("DB_URL", "mongodb://localhost:27017")
client = MongoClient(db_url)
db = client["gdb_gap_detector"]
reports_col = db["reports"]

@app.get("/api/gdb/gap-report")
def get_latest_gap_report():
    """Retrieves the latest pre-computed GDB coverage gap report."""
    try:
        report = reports_col.find_one(sort=[("generated_at", -1)])
        if not report:
            # Return empty skeleton
            return {
                "report_type": "weekly",
                "total_disclaimers": 0,
                "unique_queries": 0,
                "clusters_found": 0,
                "top_gaps": [],
                "coverage_stats": {
                    "heatmap": [],
                    "total_combinations": 0,
                    "covered": 0,
                    "partial": 0,
                    "gaps": 0
                },
                "outreach_recommendations": [],
                "domains_with_gaps": [],
                "states_with_gaps": []
            }
            
        # Convert ObjectId to string for JSON serialization
        report["_id"] = str(report["_id"])
        
        for gap in report.get("top_gaps", []):
            if "_id" in gap:
                gap["_id"] = str(gap["_id"])
            if "created_at" in gap:
                gap["created_at"] = gap["created_at"].isoformat()
        
        # Serialize datetime fields
        if "start_date" in report:
            report["start_date"] = report["start_date"].isoformat()
        if "end_date" in report:
            report["end_date"] = report["end_date"].isoformat()
        if "generated_at" in report:
            report["generated_at"] = report["generated_at"].isoformat()
            
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files for dashboard (must be mounted at the end)
dashboard_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard"))
if os.path.exists(dashboard_dir):
    app.mount("/", StaticFiles(directory=dashboard_dir, html=True), name="dashboard")
else:
    print(f"Warning: Static dashboard directory not found at {dashboard_dir}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8090"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
