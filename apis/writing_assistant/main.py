"""Writing Assistant: language-polishing + structural coverage checks for
an author's draft answer, called by the Node backend before the draft
enters the existing review workflow. Never mutates the draft itself.
"""

import contextlib
import hmac
import logging
import uuid

from fastapi import FastAPI, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from assistant import config, operations, structural_validator
from assistant.models import (
    PolishDraftRequest,
    PolishDraftResponse,
    StructuralValidationResult,
    StructuralValidationStatus,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s")
log = logging.getLogger("writing_assistant")


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    # The X-API-Key check (require_api_key below) is opt-in - unset, it's
    # a silent no-op by design, so a misconfigured deployment that never
    # set WRITING_ASSISTANT_API_KEY would otherwise run unauthenticated
    # with nothing in the logs to say so. This is the one place that
    # actually gets looked at on boot (a Render/Cloud Run deploy log),
    # same spirit as answer-check/answer-scoring's own
    # _log_startup_config - logs only whether the key is set, never the
    # key itself.
    if config.WRITING_ASSISTANT_API_KEY:
        log.info("WRITING_ASSISTANT_API_KEY is set - /polish-draft requires X-API-Key")
    else:
        log.warning("WRITING_ASSISTANT_API_KEY is NOT set - /polish-draft is running UNAUTHENTICATED")
    yield


app = FastAPI(title="Writing Assistant", lifespan=lifespan)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(provided_key: str | None = Security(_api_key_header)) -> None:
    """No-op when WRITING_ASSISTANT_API_KEY isn't set - same opt-in
    scheme as answer_shortener's require_api_key, so a local run or test
    needs no key configured. hmac.compare_digest is timing-safe; a plain
    `==` would let a response-time difference leak how many leading
    characters of the guess were already correct."""
    expected_key = config.WRITING_ASSISTANT_API_KEY
    if not expected_key:
        return
    if not provided_key or not hmac.compare_digest(provided_key.encode("utf-8"), expected_key.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_API_KEY", "message": "A valid X-API-Key is required"},
        )


@app.post("/polish-draft", response_model=PolishDraftResponse, dependencies=[Security(require_api_key)])
def polish_draft_endpoint(request: PolishDraftRequest) -> PolishDraftResponse:
    if request.skip_structural_validation:
        # Caller is already confident the draft's structure is fine and
        # only wants language polishing - skip the checklist entirely
        # (0 of its ~30 calls) rather than running it and discarding the
        # result. structuralValidation stays a required field (never
        # silently omitted), reporting SKIPPED instead of a real verdict
        # so a reader can tell "didn't run" apart from every other status.
        structural_result = StructuralValidationResult(status=StructuralValidationStatus.SKIPPED, steps=[])
    else:
        # Structural validation runs first: team requirement is that a
        # polish suggestion is only offered once every expected step is
        # covered, so an incomplete draft skips the (slower)
        # rewrite+guardrail call entirely rather than computing and then
        # discarding it. skip_steps (steps the caller says don't apply
        # to this draft) are simply never checked, so they can never
        # count against completeness either.
        structural_result = structural_validator.validate_structure_cached(
            request.question, request.draft, request.skip_steps
        )

    if request.skip_polish:
        language_result = operations.polish_skipped_at_callers_request()
    elif request.skip_structural_validation or structural_result.status == StructuralValidationStatus.COMPLETE:
        language_result = operations.polish_draft_cached(request.draft, request.skip_guardrail)
    else:
        language_result = operations.skipped_due_to_incomplete_structure(structural_result)

    return PolishDraftResponse(
        request_id=str(uuid.uuid4()),
        language_polishing=language_result,
        structural_validation=structural_result,
        warnings=[],
        errors=[],
    )


@app.get("/health")
def health() -> dict:
    """Always returns 200 with a status field - a monitoring/deploy script
    can always parse this body rather than branching on HTTP status. This
    service has no external data dependency to load at startup (no Golden
    Database CSVs - structural validation uses one fixed, built-in
    checklist, see structural_validator.FIXED_STEPS); the Gemini and
    chemical-DB dependencies it calls per-request already fail closed on
    their own, per request, rather than degrading the whole service."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8004)
