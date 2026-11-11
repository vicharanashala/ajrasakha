"""Project 6 read API. Serves the latest pipeline outputs from ``ace_insights``."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pymongo import DESCENDING

from backend.app.db import (
    COL_CLUSTERS,
    COL_DISCLAIMERS,
    COL_GAP_REPORTS,
    COL_HEATMAP,
    get_output_db,
)

router = APIRouter(prefix="/gaps", tags=["gaps"])


def _clean(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


def _latest_report() -> dict[str, Any]:
    doc = get_output_db()[COL_GAP_REPORTS].find_one({}, sort=[("generated_at", DESCENDING)])
    if not doc:
        raise HTTPException(
            404, "no gap report generated yet - run: python -m pipeline.run_gap_report"
        )
    return _clean(doc)  # type: ignore[return-value]


@router.get("/report/latest")
def latest_report() -> dict[str, Any]:
    return _latest_report()


@router.get("/reports")
def list_reports(limit: int = Query(12, ge=1, le=100)) -> list[dict[str, Any]]:
    cur = get_output_db()[COL_GAP_REPORTS].find(
        {},
        {"run_id": 1, "generated_at": 1, "period_days": 1, "start_date": 1, "end_date": 1,
         "total_disclaimers": 1, "clusters_found": 1, "coverage_stats.gaps": 1,
         "coverage_stats.covered": 1, "coverage_stats.partial": 1},
        sort=[("generated_at", DESCENDING)],
        limit=limit,
    )  # fmt: skip
    return [_clean(d) for d in cur]  # type: ignore[misc]


@router.get("/clusters")
def clusters(
    run_id: str | None = Query(None, description="defaults to the latest report's run"),
    limit: int = Query(50, ge=1, le=500),
    domain: str | None = None,
    state: str | None = None,
    crop: str | None = None,
) -> list[dict[str, Any]]:
    run = run_id or _latest_report()["run_id"]
    q: dict[str, Any] = {"run_id": run}
    if domain:
        q[f"domain_distribution.{domain}"] = {"$exists": True}
    if state:
        q[f"state_distribution.{state}"] = {"$exists": True}
    if crop:
        q[f"crop_distribution.{crop}"] = {"$exists": True}
    cur = get_output_db()[COL_CLUSTERS].find(q, sort=[("gap_score", DESCENDING)], limit=limit)
    return [_clean(d) for d in cur]  # type: ignore[misc]


@router.get("/heatmap")
def heatmap(
    run_id: str | None = None,
    by_crop: bool = Query(False, description="domain x state x crop instead of domain x state"),
) -> dict[str, Any]:
    run = run_id or _latest_report()["run_id"]
    dimension = "domain_state_crop" if by_crop else "domain_state"
    col = get_output_db()[COL_HEATMAP]
    # Runs written before the crop dimension existed have no "dimension" field.
    doc = col.find_one({"run_id": run, "dimension": dimension}) or (
        None if by_crop else col.find_one({"run_id": run, "dimension": {"$exists": False}})
    )
    if not doc:
        raise HTTPException(404, f"no {dimension} heatmap for run {run}")
    return _clean(doc)  # type: ignore[return-value]


@router.get("/trends")
def trends(weeks: int = Query(12, ge=1, le=52)) -> dict[str, Any]:
    """Weekly unanswered-query volume by domain over the last N weeks.

    Buckets are computed in Python rather than with ``$dateTrunc`` so the endpoint
    works on any MongoDB version (and can be tested without a live server).
    """
    cur = get_output_db()[COL_DISCLAIMERS].find({}, {"_id": 0, "timestamp": 1, "domain": 1})
    rows = [(d["timestamp"], d.get("domain") or "General") for d in cur if d.get("timestamp")]
    if not rows:
        return {"weeks": [], "by_domain": {}}

    def week_start(ts: datetime) -> datetime:
        monday = ts - timedelta(days=ts.weekday())
        return datetime(monday.year, monday.month, monday.day)

    counts: Counter[tuple[str, str]] = Counter()
    for ts, domain in rows:
        counts[(week_start(ts).strftime("%Y-%m-%d"), domain)] += 1

    keep = sorted({wk for wk, _ in counts}, reverse=True)[:weeks]
    series: dict[str, dict[str, int]] = {}
    for (wk, domain), n in counts.items():
        if wk in keep:
            series.setdefault(domain, {})[wk] = n
    return {"weeks": sorted(keep), "by_domain": series}


@router.get("/summary")
def summary() -> dict[str, Any]:
    """Small KPI block for the dashboard header."""
    rep = _latest_report()
    cov = rep["coverage_stats"]
    return {
        "run_id": rep["run_id"],
        "generated_at": rep["generated_at"],
        "period_days": rep["period_days"],
        "total_disclaimers": rep["total_disclaimers"],
        "unique_queries": rep["unique_queries"],
        "clusters_found": rep["clusters_found"],
        "coverage": {"cells": cov["total_combinations"], "good": cov["covered"], "partial": cov["partial"], "gap": cov["gaps"]},
        "top_gap": rep["top_gaps"][0]["cluster_name"] if rep["top_gaps"] else None,
        "critical_gaps": sum(1 for g in rep["top_gaps"] if g["priority_level"] == "CRITICAL"),
    }  # fmt: skip
