"""Check API for the answer-writing flow.

POST /check takes one answer and returns a job id. GET /check/{job_id}
returns the list of checks with a status (PASS, FLAG or NOT_EVALUATED) and the
counts. There are no marks or score here. A flag never blocks anything: the
author can fix it or submit as it is.

Checks that do not apply to an answer (for example dose uniformity, which
compares against other answers) are left out of the list.

Jobs are kept in memory, so they are lost on restart.

    cd checker && uvicorn check_api:app --port 8012
"""

from __future__ import annotations

import contextlib
import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from check_report import check_entry
from run_checker import CHECK_GROUPS, run_until_complete
from service_support import (
    log_startup_config,
    resolve_uniformity_of_dose_for_single_answer,
    startup_model_check,
)

logger = logging.getLogger("answer_check")

# a failed check is called a flag, as in the review workspace
STATUS = {"PASS": "PASS", "FAIL": "FLAG", "NOT_EVALUATED": "NOT_EVALUATED"}

# how many answers are checked at the same time
_EXECUTOR = ThreadPoolExecutor(max_workers=4)
_JOBS: dict[str, dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    log_startup_config()
    # in a thread so a slow model does not delay startup
    threading.Thread(target=startup_model_check, daemon=True).start()
    yield


app = FastAPI(title="Answer Check API", lifespan=lifespan)


class SourceIn(BaseModel):
    sourceType: Optional[str] = None
    sourceName: Optional[str] = None
    source: Optional[str] = None
    page: Optional[str] = None


class CheckIn(BaseModel):
    """Request body. Only question and answer are needed."""
    question: str
    answer: str
    crop: Optional[str] = None
    state: Optional[str] = None
    sources: list[SourceIn] = []
    # echoed back so the caller can tie the result to an answer and a draft version
    answerId: Optional[str] = None
    version: Optional[str] = None


class CheckSummary(BaseModel):
    job_id: str
    status: str  # "processing" | "completed" | "failed"


def build_report(result: dict[str, Any]) -> dict[str, Any]:
    """Turn one checked answer into the list of checks and the counts."""
    resolve_uniformity_of_dose_for_single_answer(result)
    parameters = result.get("parameters") or {}
    checks: list[dict[str, Any]] = []
    for category, names in CHECK_GROUPS.items():
        for name in names:
            entry = check_entry(name, category, (parameters.get(category) or {}).get(name))
            if entry["result"] == "NOT_APPLICABLE":
                continue
            check = {
                "parameter": entry["parameter"],
                "category": entry["category"],
                "status": STATUS[entry["result"]],
                "reason": entry["reason"],
            }
            if entry.get("highlight"):
                check["highlight"] = entry["highlight"]
            checks.append(check)
    count = lambda status: sum(c["status"] == status for c in checks)
    return {
        "passed": count("PASS"),
        "flagged": count("FLAG"),
        "notEvaluated": count("NOT_EVALUATED"),
        "checks": checks,
        "checkedAt": result.get("checked_at"),
        "pipelineVersion": result.get("pipeline_version"),
    }


def _run_job(job_id: str, raw_answer: dict[str, Any], echo: dict[str, Any]) -> None:
    started = time.time()
    try:
        result = run_until_complete([raw_answer], max_workers=4, retry_rounds=5)[0]
        report = build_report(result)
        logger.info(
            "job %s finished in %.0fs: passed=%s flagged=%s notEvaluated=%s",
            job_id, time.time() - started, report["passed"], report["flagged"], report["notEvaluated"],
        )
        with _JOBS_LOCK:
            _JOBS[job_id] = {"status": "completed", **echo, **report}
    except Exception as exc:
        logger.exception("job %s crashed after %.0fs", job_id, time.time() - started)
        with _JOBS_LOCK:
            _JOBS[job_id] = {
                "status": "failed",
                **echo,
                "error": f"{type(exc).__name__}: {exc}",
                "checkedAt": datetime.now(timezone.utc).isoformat(),
            }


@app.post("/check", response_model=CheckSummary)
def submit_check(body: CheckIn) -> CheckSummary:
    job_id = str(uuid.uuid4())
    raw_answer = {
        "answer_id": body.answerId or job_id,
        "question_text": body.question,
        "answer_text": body.answer,
        # several checks work less well without crop and state
        "crop": body.crop or "Unknown",
        "state": body.state or "Unknown",
        "sources": [
            {"source": s.source or "", "page": s.page or "", "sourceName": s.sourceName or ""}
            for s in body.sources
        ],
    }
    echo = {k: v for k, v in (("answerId", body.answerId), ("version", body.version)) if v}
    logger.info(
        "job %s submitted (question %d chars, answer %d chars, %d source(s))",
        job_id, len(body.question), len(body.answer), len(body.sources),
    )
    with _JOBS_LOCK:
        _JOBS[job_id] = {"status": "processing", **echo, "submittedAt": datetime.now(timezone.utc).isoformat()}
    _EXECUTOR.submit(_run_job, job_id, raw_answer, echo)
    return CheckSummary(job_id=job_id, status="processing")


@app.get("/check/{job_id}")
def get_check(job_id: str) -> dict[str, Any]:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return {"jobId": job_id, **job}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
