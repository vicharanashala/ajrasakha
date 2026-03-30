# imd_api_wrapper/api/main.py
# ─────────────────────────────────────────────────────────────
# FastAPI application exposing all 6 priority IMD endpoints
# identified from the 15.5M KCC farmer weather query analysis.
#
# Run in JupyterHub:
#   import subprocess
#   subprocess.Popen(["uvicorn", "api.main:app", "--reload", "--port", "8000"])
#
# Or from terminal inside the project folder:
#   uvicorn api.main:app --reload --port 8000
#
# Docs available at:
#   http://localhost:8000/docs      ← Swagger UI
#   http://localhost:8000/redoc     ← ReDoc
# ─────────────────────────────────────────────────────────────

import sys, os
sys.path.insert(0, os.path.abspath(".."))

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional, List
from datetime import datetime

from wrapper.client import IMDClient
from wrapper.router import route_query, route_batch
from wrapper.api_mapping import (
    get_endpoint_for_cluster,
    get_endpoint_for_need,
    get_full_mapping_table,
    get_need_summary,
)
from wrapper.config import (
    TOTAL_WEATHER_QUERIES,
    TOTAL_QUERIES_PER_NEED,
    CLUSTER_QUERY_COUNTS,
    CLUSTER_TO_NEED,
    PRIORITY,
    FRESHNESS_MINUTES,
)

# App setup 

app = FastAPI(
    title       = "IMD Weather API Wrapper",
    description = (
        "REST API for 5 priority IMD weather endpoints identified from "
        "analysis of **15,549,889 farmer weather queries** in the KCC dataset.\n\n"
        "| Endpoint | Priority | Queries | Coverage |\n"
        "|---|---|---|---|\n"
        "| City 7-Day Forecast | CRITICAL | 13,706,092 | 88.15% |\n"
        "| District Forecast | HIGH | 1,335,570 | 8.59% |\n"
        "| Rainfall Forecast | MEDIUM | 248,633 | 1.60% |\n"
        "| Current Weather | MEDIUM | 180,855 | 1.16% |\n"
        "| Nowcast | LOW | 57,084 | 0.37% |\n"
    ),
    version     = "1.0.0",
    contact     = {"name": "KCC Weather Analysis Project"},
)

client = IMDClient()


# Health check 

@app.get(
    "/",
    tags=["Health"],
    summary="Health check",
)
def root():
    return {
        "status"               : "running",
        "timestamp"            : datetime.now().isoformat(),
        "total_kcc_queries"    : TOTAL_WEATHER_QUERIES,
        "endpoints_available"  : 6,
        "mode"                 : "MOCK — swap BASE_URL & API_KEY in client.py to go live",
    }


@app.get(
    "/health",
    tags=["Health"],
    summary="Detailed health status",
)
def health():
    return {
        "status"    : "ok",
        "timestamp" : datetime.now().isoformat(),
        "wrapper"   : "IMDClient",
        "endpoints" : list(PRIORITY.keys()),
    }


# Analysis endpoints 

@app.get(
    "/analysis/cluster/{cluster_id}",
    tags=["KCC Analysis"],
    summary="Get IMD endpoint recommendation for a cluster",
    description=(
        "Returns the recommended IMD API endpoint for a given KCC cluster ID (0–58), "
        "along with query volume and coverage statistics from the 15.5M dataset."
    ),
)
def cluster_info(cluster_id: int):
    try:
        return get_endpoint_for_cluster(cluster_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/analysis/need/{farmer_need}",
    tags=["KCC Analysis"],
    summary="Get IMD endpoint for a farmer weather need",
    description=(
        "Returns the recommended IMD API for one of the 6 farmer weather needs "
        "identified from KCC clustering."
    ),
)
def need_info(farmer_need: str):
    try:
        return get_endpoint_for_need(farmer_need)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/analysis/mapping",
    tags=["KCC Analysis"],
    summary="Full cluster-to-API mapping table (all 59 clusters)",
    description="Returns the complete mapping of all 59 clusters to IMD endpoints, sorted by query volume.",
)
def full_mapping():
    rows = get_full_mapping_table()
    rows.sort(key=lambda r: r["cluster_queries"], reverse=True)
    return {
        "total_clusters"        : len(rows),
        "total_queries_covered" : sum(r["cluster_queries"] for r in rows),
        "mapping"               : rows,
    }


@app.get(
    "/analysis/needs",
    tags=["KCC Analysis"],
    summary="Summary of all 6 farmer weather needs",
    description="Returns all 6 farmer needs with their query counts, coverage %, and recommended endpoints.",
)
def needs_summary():
    rows = get_need_summary()
    return {
        "total_weather_queries" : TOTAL_WEATHER_QUERIES,
        "farmer_needs"          : rows,
    }


# Weather endpoints 

@app.get(
    "/weather/city-forecast",
    tags=["Weather — CRITICAL"],
    summary="7-day city weather forecast",
    description=(
        "**CRITICAL priority endpoint.**\n\n"
        "Serves the **General Weather Forecast** farmer need — "
        "13,706,092 queries (88.15% of all KCC weather queries).\n\n"
        "**KCC Clusters:** 3, 18, 28, 27, 58, 10, 15, 14, 30, 13, 47\n\n"
        "**Data freshness:** updated every 6 hours."
    ),
)
def city_forecast(
    city : str = Query(..., description="City name, e.g. Delhi"),
    state: str = Query("",  description="State name (optional)"),
):
    try:
        return client.get_city_forecast(city=city, state=state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/weather/district-forecast",
    tags=["Weather — HIGH"],
    summary="7-day district weather forecast",
    description=(
        "**HIGH priority endpoint.**\n\n"
        "Serves the **District Weather Forecast** farmer need — "
        "1,335,570 queries (8.59% of all KCC weather queries).\n\n"
        "**KCC Clusters:** 54, 36, 41, 8, 9, 12, 40, 52, 17, 7, 26, 1, 53, "
        "32, 22, 45, 48, 56, 0, 6, 33, 37, 50, 31, 39, 21, 25, 46, 55, 49, "
        "44, 57, 34, 38, 43, 16\n\n"
        "**Data freshness:** updated every 6 hours."
    ),
)
def district_forecast(
    district: str = Query(..., description="District name, e.g. Aligarh"),
    state   : str = Query("",  description="State name (optional but recommended)"),
):
    try:
        return client.get_district_forecast(district=district, state=state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/weather/rainfall-forecast",
    tags=["Weather — MEDIUM"],
    summary="District rainfall forecast (up to 5 days)",
    description=(
        "**MEDIUM priority endpoint.**\n\n"
        "Serves the **Rain Forecast** farmer need — "
        "248,633 queries (1.60% of all KCC weather queries).\n\n"
        "**KCC Clusters:** 20, 2, 4, 42, 19\n\n"
        "**Data freshness:** updated every 3 hours."
    ),
)
def rainfall_forecast(
    district: str = Query(..., description="District name"),
    state   : str = Query("",  description="State name (optional)"),
    days    : int = Query(5,   description="Forecast days (1–5)", ge=1, le=5),
):
    try:
        return client.get_rainfall_forecast(
            district=district, state=state, days=days
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/weather/current",
    tags=["Weather — MEDIUM"],
    summary="Real-time current weather conditions",
    description=(
        "**MEDIUM priority endpoint.**\n\n"
        "Serves the **Current Weather Condition** farmer need — "
        "180,855 queries (1.16% of all KCC weather queries).\n\n"
        "**KCC Clusters:** 35, 29, 11\n\n"
        "**Data freshness:** real-time / hourly."
    ),
)
def current_weather(
    city : str = Query(..., description="City name"),
    state: str = Query("",  description="State name (optional)"),
):
    try:
        return client.get_current_weather(city=city, state=state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/weather/nowcast",
    tags=["Weather — LOW"],
    summary="Short-term nowcast (3-hour window)",
    description=(
        "**LOW priority endpoint.**\n\n"
        "Serves the **Short Term Forecast** farmer need — "
        "57,084 queries (0.37% of all KCC weather queries).\n\n"
        "**KCC Clusters:** 24, 23\n\n"
        "**Data freshness:** updated every 3 hours."
    ),
)
def nowcast(
    district: str = Query(..., description="District name"),
    state   : str = Query("",  description="State name (optional)"),
):
    try:
        return client.get_nowcast(district=district, state=state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/weather/full-profile",
    tags=["Weather — Full Profile"],
    summary="All 6 endpoints in a single call",
    description=(
        "Fetches data from all 6 priority IMD endpoints at once. "
        "A failure on any individual endpoint is captured and returned "
        "as an error field — it does not block the remaining calls.\n\n"
        "Covers **100% of KCC weather query needs** in one request."
    ),
)
def full_profile(
    city    : str = Query(..., description="City name"),
    district: str = Query(..., description="District name"),
    state   : str = Query("",  description="State name (optional)"),
    crop    : str = Query("",  description="Crop name (optional)"),
):
    try:
        return client.get_full_profile(
            city=city, district=district, state=state, crop=crop
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Router endpoints

@app.get(
    "/router/query",
    tags=["Query Router"],
    summary="Route a single farmer query text to the correct IMD endpoint",
    description=(
        "Takes a raw farmer query string (as typed or spoken) and returns "
        "the recommended IMD endpoint based on keyword matching — "
        "the same logic used to build the KCC cluster distribution.\n\n"
        "Example: `?q=will it rain tomorrow in Aligarh` → `rainfall_forecast`"
    ),
)
def route_single(
    q: str = Query(..., description="Farmer query text"),
):
    return route_query(q)


@app.post(
    "/router/batch",
    tags=["Query Router"],
    summary="Route a batch of farmer query texts",
    description=(
        "Accepts a JSON list of query strings and returns the recommended "
        "IMD endpoint for each one. Useful for processing historical KCC data."
    ),
)
def route_batch_endpoint(queries: List[str]):
    if len(queries) > 10_000:
        raise HTTPException(
            status_code=400,
            detail="Batch size limit is 10,000 queries per request.",
        )
    results = route_batch(queries)
    return {
        "total"   : len(results),
        "results" : results,
    }