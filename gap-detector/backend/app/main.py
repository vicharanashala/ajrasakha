"""FastAPI application. Routers only READ the ``ace_insights`` output DB."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import get_settings
from backend.app.db import ping
from backend.app.routers import gaps

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(
    title="ACE Insights",
    description="GDB Coverage Gap Detector for the AjraSakha farmer-advisory bot",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health(db: bool = Query(False, description="also ping MongoDB")) -> dict:
    out: dict = {
        "status": "ok",
        "profile": settings.ace_profile,
        "output_db": settings.output_db,
        "thresholds": {
            "min_cluster_size": settings.min_cluster_size,
            "cluster_distance_threshold": settings.cluster_distance_threshold,
            "gap_report_period_days": settings.gap_report_period_days,
        },
    }
    if db:
        try:
            out["mongodb"] = "ok" if ping() else "unreachable"
        except Exception as exc:  # noqa: BLE001 - any driver error means unhealthy
            out["status"] = "degraded"
            out["mongodb"] = f"error: {type(exc).__name__}"
    return out


app.include_router(gaps.router)
