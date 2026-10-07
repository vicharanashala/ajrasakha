"""Scoring API for the Question Collection app.

POST /score takes one answer and returns a job id. GET /score/{job_id}
returns the score once it's done. Scoring can take a minute (several model
calls, some fail and retry), so it runs in the background instead of
holding the request open.

Jobs are kept in memory, so they are lost on restart.
"""

from __future__ import annotations

import contextlib
import logging
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import llm_checker
from llm_client import MINIMAX_URL, api_key_is_set, call_llm_once
from result_state import NOT_APPLICABLE, not_applicable_result
from run_checker import run_until_complete
from scoring import score_answer

# send every module's logs to the container log
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("answer_scoring")

STARTUP_CHECK_ATTEMPTS = 3


def _log_startup_config() -> None:
    """Log the config at boot (whether the key is set, never the key)."""
    logger.info("answer-scoring starting")
    logger.info("MINIMAX_API_KEY: %s", "set" if api_key_is_set() else "NOT SET -- every model-based check will fail")
    logger.info("USE_MOCK_LLM: %s", llm_checker.USE_MOCK_LLM)
    logger.info("model endpoint: %s", MINIMAX_URL)
    logger.info(
        "PIPELINE_WORKERS=%s PIPELINE_RETRY_ROUNDS=%s",
        os.getenv("PIPELINE_WORKERS", "(default 8)"),
        os.getenv("PIPELINE_RETRY_ROUNDS", "(default 5)"),
    )


def _startup_model_check() -> None:
    """Make one small model call at boot and log whether it worked (3 tries)."""
    if llm_checker.USE_MOCK_LLM:
        logger.info("startup model check skipped: USE_MOCK_LLM is on")
        return
    if not api_key_is_set():
        logger.error("startup model check skipped: MINIMAX_API_KEY is not set")
        return
    for attempt in range(1, STARTUP_CHECK_ATTEMPTS + 1):
        started = time.time()
        try:
            call_llm_once('Reply with exactly: {"ok": true}', max_completion_tokens=32)
        except Exception as exc:
            logger.warning(
                "startup model check attempt %d/%d failed: %s: %s",
                attempt, STARTUP_CHECK_ATTEMPTS, type(exc).__name__, str(exc)[:200],
            )
            continue
        logger.info(
            "startup model check OK (attempt %d, %.1fs): model API reachable with the configured key",
            attempt, time.time() - started,
        )
        return
    logger.error(
        "startup model check FAILED %d/%d -- model-based checks will fail until this is fixed",
        STARTUP_CHECK_ATTEMPTS, STARTUP_CHECK_ATTEMPTS,
    )


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    _log_startup_config()
    # in a thread so a slow model doesn't delay startup
    threading.Thread(target=_startup_model_check, daemon=True).start()
    yield


app = FastAPI(title="GDB Answer Quality Scoring API", lifespan=lifespan)

# how many answers are scored at the same time
_EXECUTOR = ThreadPoolExecutor(max_workers=4)
_JOBS: dict[str, dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()


class SourceIn(BaseModel):
    sourceType: Optional[str] = None
    sourceName: Optional[str] = None
    source: Optional[str] = None
    page: Optional[str] = None


class AnswerIn(BaseModel):
    """Request body. crop and state are optional."""
    answer_id: Optional[str] = Field(default=None, description="Optional; a random id is assigned if omitted.")
    question: str
    answer: str
    crop: Optional[str] = None
    state: Optional[str] = None
    sources: list[SourceIn] = []


class ScoreSummary(BaseModel):
    job_id: str
    status: str  # "processing" | "completed" | "failed"


def _to_camel(check: dict[str, Any]) -> dict[str, Any]:
    return {
        "parameter": check["check"],
        "category": check["group"],
        "result": check["status"],
        "mark": check["mark"],
        "reason": check["detail"],
    }


def _resolve_uniformity_of_dose_for_single_answer(result: dict[str, Any]) -> None:
    """Mark dose uniformity as not applicable.

    It compares a dose with other answers in the same batch, and here the
    batch is always one answer, so it can never be checked.
    """
    check = (result.get("parameters", {}).get("chemical") or {}).get("uniformity_of_dose")
    if check and check.get("execution") == "DEFERRED":
        result["parameters"]["chemical"]["uniformity_of_dose"] = not_applicable_result(
            "Cannot check dose uniformity: this endpoint scores one answer "
            "at a time, so there is never another answer in the same batch "
            "to compare against.",
        )


def _run_job(job_id: str, raw_answer: dict[str, Any]) -> None:
    started = time.time()
    try:
        results = run_until_complete([raw_answer], max_workers=4, retry_rounds=5)
        result = results[0]
        _resolve_uniformity_of_dose_for_single_answer(result)
        scored = score_answer(result)
        logger.log(
            logging.INFO if scored["complete"] else logging.WARNING,
            "job %s finished in %.0fs: status=%s score=%s/%s (%s%%) complete=%s notEvaluated=%s",
            job_id, time.time() - started,
            "failed" if result.get("status") == "FAILED" else "completed",
            scored["score"], scored["out_of"], scored["percentage"],
            scored["complete"], scored["not_evaluated"] or "none",
        )
        with _JOBS_LOCK:
            _JOBS[job_id] = {
                "status": "failed" if result.get("status") == "FAILED" else "completed",
                "systemScore": scored["score"],
                "maxScore": scored["out_of"],
                "percentage": scored["percentage"],
                "complete": scored["complete"],
                "needsHumanReview": scored["needs_human_review"],
                "reviewReasons": scored["review_reasons"],
                "checks": [_to_camel(c) for c in scored["checks"]],
                "notApplicable": scored["not_applicable"],
                "notEvaluated": scored["not_evaluated"],
                "checkedAt": result.get("checked_at"),
            }
    except Exception as exc:
        logger.exception("job %s crashed after %.0fs", job_id, time.time() - started)
        with _JOBS_LOCK:
            _JOBS[job_id] = {
                "status": "failed",
                "error": f"{type(exc).__name__}: {exc}",
                "checkedAt": datetime.now(timezone.utc).isoformat(),
            }


@app.post("/score", response_model=ScoreSummary)
def submit_score(answer: AnswerIn) -> ScoreSummary:
    job_id = str(uuid.uuid4())
    raw_answer = {
        "answer_id": answer.answer_id or job_id,
        "question_text": answer.question,
        "answer_text": answer.answer,
        # several checks work less well without crop and state
        "crop": answer.crop or "Unknown",
        "state": answer.state or "Unknown",
        "sources": [
            {"source": s.source or "", "page": s.page or "", "sourceName": s.sourceName or ""}
            for s in answer.sources
        ],
    }
    logger.info(
        "job %s submitted (question %d chars, answer %d chars, %d source(s), crop=%s state=%s)",
        job_id, len(answer.question), len(answer.answer), len(answer.sources),
        raw_answer["crop"], raw_answer["state"],
    )
    with _JOBS_LOCK:
        _JOBS[job_id] = {"status": "processing", "submittedAt": datetime.now(timezone.utc).isoformat()}
    _EXECUTOR.submit(_run_job, job_id, raw_answer)
    return ScoreSummary(job_id=job_id, status="processing")


@app.get("/score/{job_id}")
def get_score(job_id: str) -> dict[str, Any]:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return {"jobId": job_id, **job}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
