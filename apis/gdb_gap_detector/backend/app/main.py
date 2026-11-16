"""FastAPI service exposing the GDB Gap Detector."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .config import settings
from .db import get_out_db as get_db, is_demo
from .pipeline import run_pipeline
from .reports import to_csv, to_markdown
from .seed import seed_database

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("gapdetector")
_scheduler = None


def _clean(doc):
    if isinstance(doc, dict):
        return {k: _clean(v) for k, v in doc.items() if k not in ("report_id", "_id") or (k == "_id" and isinstance(v, str))}
    if isinstance(doc, list):
        return [_clean(x) for x in doc]
    return doc


def _latest_report_id(db) -> str | None:
    doc = db[settings.out_reports].find_one({}, {"_id": 1}, sort=[("generated_at", -1)])
    return doc["_id"] if doc else None


def _get_report(report_id: str | None) -> dict:
    db = get_db()
    rid = report_id or _latest_report_id(db)
    rep = db[settings.out_reports].find_one({"_id": rid}) if rid else None
    if not rep:
        raise HTTPException(404, "No report yet. POST /api/pipeline/run to generate one.")
    return rep


def _scheduled_run():
    try:
        rep = run_pipeline()
        log.info("Scheduled run done: report %s, %s open gaps", rep["_id"], rep["summary"]["open_gaps"])
    except Exception:
        log.exception("Scheduled pipeline run failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    db = get_db()
    if is_demo() and settings.demo_seed:
        n = seed_database(db)
        if n:
            log.info("Seeded %d demo questions", n)
            run_pipeline(db=db)
    elif not db[settings.out_reports].estimated_document_count():
        try:
            run_pipeline()
        except Exception:
            log.exception("initial pipeline run failed")
    if settings.enable_scheduler:
        from apscheduler.schedulers.background import BackgroundScheduler

        _scheduler = BackgroundScheduler(timezone=settings.report_tz)
        _scheduler.add_job(_scheduled_run, "interval", hours=settings.report_interval_hours,
                           id="gap-report-interval", replace_existing=True, misfire_grace_time=1800, coalesce=True,
                           max_instances=1)
        _scheduler.start()
        job = _scheduler.get_job("gap-report-interval")
        log.info("Gap report scheduled every %sh; next run %s", settings.report_interval_hours, job.next_run_time)
    yield
    if _scheduler:
        _scheduler.shutdown(wait=False)


app = FastAPI(title="GDB Coverage Gap Detector", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok", "demo_db": is_demo(), "latest_report": _latest_report_id(get_db())}


@app.post("/api/pipeline/run")
def run():
    rep = run_pipeline()
    return {"report_id": rep["_id"], "summary": rep["summary"]}


@app.get("/api/reports")
def list_reports():
    cur = get_db()[settings.out_reports].find({}, {"summary": 1, "generated_at": 1, "run_at": 1}).sort("generated_at", -1).limit(52)
    return [{"report_id": r["_id"], "generated_at": r["generated_at"], "run_at": r.get("run_at"), "summary": r["summary"]} for r in cur]


@app.get("/api/reports/latest")
def latest_report(top: int | None = Query(None, ge=1, le=200)):
    rep = _get_report(None)
    if top:
        rep["top_clusters"] = rep["top_clusters"][:top]
    return _clean(rep)


@app.get("/api/reports/{report_id}")
def report(report_id: str):
    return _clean(_get_report(report_id))


@app.get("/api/reports/{report_id}/export.{fmt}", response_class=PlainTextResponse)
def export(report_id: str, fmt: str):
    rep = _get_report(None if report_id == "latest" else report_id)
    if fmt == "csv":
        return PlainTextResponse(to_csv(rep), media_type="text/csv",
                                 headers={"Content-Disposition": f'attachment; filename="gdb-gap-{rep["_id"]}.csv"'})
    if fmt == "md":
        return PlainTextResponse(to_markdown(rep), media_type="text/markdown")
    raise HTTPException(400, "fmt must be csv or md")


@app.get("/api/clusters")
def clusters(crop: str | None = None, state: str | None = None, domain: str | None = None,
             trend: str | None = None, limit: int = Query(100, le=500)):
    db = get_db()
    q: dict = {"report_id": _latest_report_id(db)}
    if crop:
        q["crop"] = crop
    if domain:
        q["domain"] = domain
    if trend:
        q["trend"] = trend
    if state:
        q["states.state"] = state
    cur = db[settings.out_clusters].find(q).sort("priority_score", -1).limit(limit)
    return _clean(list(cur))


@app.get("/api/heatmap")
def heatmap(rows: str = Query("crop", pattern="^(crop|state|domain)$"),
            cols: str = Query("state", pattern="^(crop|state|domain)$"),
            crop: str | None = None, state: str | None = None, domain: str | None = None):
    """Aggregate coverage cells onto two chosen axes, optionally filtered on the third."""
    if rows == cols:
        raise HTTPException(400, "rows and cols must differ")
    db = get_db()
    q: dict = {"report_id": _latest_report_id(db)}
    for k, v in (("crop", crop), ("state", state), ("domain", domain)):
        if v:
            q[k] = v
    agg: dict[tuple[str, str], dict] = {}
    for c in db[settings.out_cells].find(q):
        a = agg.setdefault((c[rows], c[cols]), {"gdb_answers": 0, "open_gaps": 0})
        a["gdb_answers"] += c["gdb_answers"]
        a["open_gaps"] += c["open_gaps"]
    cells = []
    for (r, c), a in agg.items():
        tot = a["gdb_answers"] + a["open_gaps"]
        cov = a["gdb_answers"] / tot if tot else None
        cells.append({"row": r, "col": c, **a, "coverage": None if cov is None else round(cov, 3),
                      "band": None if cov is None else "strong" if cov >= 0.7 else "partial" if cov >= 0.4 else "gap"})
    def gaps_by(key):  # most open gaps first, "Unknown" always last
        totals: dict[str, int] = {}
        for x in cells:
            totals[x[key]] = totals.get(x[key], 0) + x["open_gaps"]
        return sorted(totals, key=lambda v: (v == "Unknown", -totals[v], v))

    return {"rows": rows, "cols": cols, "row_labels": gaps_by("row"), "col_labels": gaps_by("col"), "cells": cells}


@app.get("/api/meta")
def meta():
    db = get_db()
    rid = _latest_report_id(db)
    cells = list(db[settings.out_cells].find({"report_id": rid}, {"crop": 1, "state": 1, "domain": 1}))
    return {"crops": sorted({c["crop"] for c in cells}), "states": sorted({c["state"] for c in cells}),
            "domains": sorted({c["domain"] for c in cells})}
