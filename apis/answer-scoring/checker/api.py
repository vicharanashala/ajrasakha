"""Scoring endpoint for the Answer Creation module (Anveshan / Question
Collection app).

Why this is a job/poll API instead of one request-response call: a single
answer needs 2-3 LLM calls (coverage, context, and source_fidelity when a
dose is present), and the upstream MiniMax proxy currently fails roughly
15-60% of individual calls with a truncated response (see llm_client.py's
comment on MAX_RETRIES). With up to 9 retries per call that means a single
answer can legitimately take anywhere from ~5 seconds to over a minute.
Making the author's browser hold one HTTP request open for that long is
fragile (proxies/load balancers time out well before a minute), so the
author submits an answer, gets a job id back immediately, and polls (or the
Answer Creation module polls on their behalf) for the score.

This is a starting point, not a production deployment: jobs live in an
in-memory dict, so they are lost on restart and this only works behind a
single process (no horizontal scaling). That is fine for local testing and
for deciding the contract with the Anveshan team; before this is relied on
in production, jobs should move to a shared store (e.g. the same MongoDB
already referenced in .env) and the process should run under a real host
(see the "how can I create an endpoint when nothing is hosted" question --
this code is the endpoint; it still needs to be deployed somewhere the
Answer Creation module can reach).

Run locally with:
    uvicorn checker.api:app --reload --port 8000
Then:
    curl -X POST http://localhost:8000/score -H "Content-Type: application/json" -d "{...}"
    curl http://localhost:8000/score/<job_id>
"""

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from result_state import NOT_APPLICABLE, not_applicable_result
from run_checker import run_until_complete
from scoring import score_answer

app = FastAPI(title="GDB Answer Quality Scoring API")

# One shared pool for background scoring work. Sized small on purpose: each
# job itself does its own internal parallel model calls, so this is about
# how many *answers* are scored at once, not how many model calls happen.
_EXECUTOR = ThreadPoolExecutor(max_workers=4)
_JOBS: dict[str, dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()


class SourceIn(BaseModel):
    sourceType: Optional[str] = None
    sourceName: Optional[str] = None
    source: Optional[str] = None
    page: Optional[str] = None


class AnswerIn(BaseModel):
    """Matches the Question Collection app's submission shape. crop/state
    are not part of that shape yet -- see the comment in score_answer_job()
    on why several checks are weaker without them."""
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
    """uniformity_of_dose compares a dose against OTHER answers in the same
    batch (uniformity_checker.py). This endpoint always scores a batch of
    exactly one answer, so whenever a dose IS present, the check comes
    back DEFERRED ("no peer to compare against yet") rather than
    NOT_APPLICABLE -- DEFERRED means "retry may resolve this," which is
    true in the full batch pipeline as more answers accumulate, but never
    true here: there will never be a second answer in this batch. Left
    alone, that DEFERRED status permanently triggers needs_human_review on
    every dose-bearing answer with a review reason claiming a model call
    failed, when no call was ever attempted -- caught by
    tests/test_api.py's uniformity_of_dose test. Rewritten to
    NOT_APPLICABLE here, specific to this single-answer endpoint, not in
    scoring.py or uniformity_checker.py, since the DEFERRED semantics are
    correct everywhere else.
    """
    check = (result.get("parameters", {}).get("chemical") or {}).get("uniformity_of_dose")
    if check and check.get("execution") == "DEFERRED":
        result["parameters"]["chemical"]["uniformity_of_dose"] = not_applicable_result(
            "Cannot check dose uniformity: this endpoint scores one answer "
            "at a time, so there is never another answer in the same batch "
            "to compare against.",
        )


def _run_job(job_id: str, raw_answer: dict[str, Any]) -> None:
    try:
        # retry_rounds=5, not the pipeline default of 5+9-per-call: this is
        # already a single answer, so the full per-call retry budget in
        # llm_client.py applies; retry_rounds here only covers checks that
        # errored for a reason retry_failed() can address (e.g. a whole
        # check group raising), which is rare once call-level retries exist.
        results = run_until_complete([raw_answer], max_workers=4, retry_rounds=5)
        result = results[0]
        _resolve_uniformity_of_dose_for_single_answer(result)
        scored = score_answer(result)
        with _JOBS_LOCK:
            _JOBS[job_id] = {
                "status": "failed" if result.get("status") == "FAILED" else "completed",
                "systemScore": scored["score"],
                "maxScore": scored["out_of"],
                "percentage": scored["percentage"],
                "needsHumanReview": scored["needs_human_review"],
                "reviewReasons": scored["review_reasons"],
                "checks": [_to_camel(c) for c in scored["checks"]],
                "notApplicable": scored["not_applicable"],
                "notEvaluated": scored["not_evaluated"],
                "checkedAt": result.get("checked_at"),
            }
    except Exception as exc:  # the job must never vanish silently
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
        # crop/state are not in the Question Collection app's submission
        # shape yet. Defaulting to "Unknown" degrades restricted_chemical,
        # contextuality, and local_name_mismatch, all of which need one or
        # both -- flagged to the team; not silently assumed to be fine.
        "crop": answer.crop or "Unknown",
        "state": answer.state or "Unknown",
        "sources": [
            {"source": s.source or "", "page": s.page or "", "sourceName": s.sourceName or ""}
            for s in answer.sources
        ],
    }
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
