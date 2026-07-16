"""FastAPI entry point for query-guided answer shortening."""

from __future__ import annotations

import hmac
import logging
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from claude_client import (
    AnthropicClaudeGateway,
    ClaudeConfigurationError,
    ClaudeProviderError,
    ClaudeTimeoutError,
    ClaudeUnavailableError,
)
from config import Settings, SettingsError, get_settings
from models import ShortenAnswerRequest, ShortenAnswerResponse
from service import (
    AnswerShorteningService,
    ExtractiveRangeNotFeasibleError,
    ModelSelectionError,
    ProtectedContentTooLargeError,
    TargetRequiresExpansionError,
)


app = FastAPI(
    title="AjraSakha Answer Shortener API",
    version="1.0.0",
    description=(
        "Extracts exact source segments from an existing AjraSakha answer according "
        "to the farmer's original query and a target character count. Successful "
        "responses are within ±50 characters."
    ),
)

logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def _extractive_range_http_error(
    exc: ExtractiveRangeNotFeasibleError,
) -> HTTPException:
    closest = list(exc.closest_achievable_lengths)
    recommended = (
        min(closest, key=lambda value: abs(value - exc.target))
        if closest
        else None
    )
    return HTTPException(
        status_code=422,
        detail={
            "code": exc.code,
            "category": "client_adjustable_constraint",
            "message": (
                "No combination of whole source segments fits the requested "
                "character range. The API will not rewrite or truncate source text."
            ),
            "retryable": False,
            "requested": {
                "expected_character_count": exc.target,
                "minimum_character_count": exc.lower_bound,
                "maximum_character_count": exc.upper_bound,
            },
            "closest_achievable_character_counts": closest,
            "guidance": {
                "action": "adjust_expected_character_count",
                "recommended_expected_character_count": recommended,
            },
        },
    )


def settings_dependency() -> Settings:
    try:
        return get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SERVICE_CONFIGURATION_ERROR", "message": str(exc)},
        ) from exc


def require_api_key(
    provided_key: str | None = Security(_api_key_header),
    settings: Settings = Depends(settings_dependency),
) -> None:
    expected_key = settings.service_api_key
    if not expected_key:
        return
    if not provided_key or not hmac.compare_digest(
        provided_key.encode("utf-8"), expected_key.encode("utf-8")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_API_KEY", "message": "A valid X-API-Key is required"},
        )


@lru_cache(maxsize=4)
def _build_shortener_service(settings: Settings) -> AnswerShorteningService:
    settings.require_provider_configuration()
    gateway = AnthropicClaudeGateway(settings)
    return AnswerShorteningService(
        gateway,
        model=settings.model,
        tolerance=settings.character_tolerance,
        max_attempts=settings.rewrite_attempts,
        max_output_tokens=settings.max_output_tokens,
    )


def get_shortener_service(
    settings: Settings = Depends(settings_dependency),
) -> AnswerShorteningService:
    try:
        return _build_shortener_service(settings)
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SERVICE_NOT_READY", "message": str(exc)},
        ) from exc


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "answer-shortener"}


@app.get("/health/ready", tags=["meta"])
async def readiness(
    settings: Settings = Depends(settings_dependency),
) -> dict[str, object]:
    try:
        settings.require_provider_configuration()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SERVICE_NOT_READY", "message": str(exc)},
        ) from exc
    return {
        "status": "ready",
        "service": "answer-shortener",
        "model": settings.model,
        "api_key_auth_enabled": bool(settings.service_api_key),
    }


@app.post(
    "/v1/answers/shorten",
    response_model=ShortenAnswerResponse,
    tags=["answers"],
    summary="Extract a shorter AjraSakha answer",
    dependencies=[Security(require_api_key)],
)
async def shorten_answer(
    body: ShortenAnswerRequest,
    service: AnswerShorteningService = Depends(get_shortener_service),
) -> ShortenAnswerResponse:
    try:
        outcome = await service.shorten(
            original_query=body.original_query,
            answer=body.answer,
            expected_character_count=body.expected_character_count,
        )
    except TargetRequiresExpansionError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "TARGET_REQUIRES_EXPANSION", "message": str(exc)},
        ) from exc
    except ProtectedContentTooLargeError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "TARGET_TOO_SMALL_FOR_PROTECTED_CONTENT",
                "message": str(exc),
            },
        ) from exc
    except ExtractiveRangeNotFeasibleError as exc:
        raise _extractive_range_http_error(exc) from exc
    except ModelSelectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "MODEL_SELECTION_INVALID",
                "category": "model_noncompliance",
                "message": (
                    "Claude could not return a valid complete source-segment "
                    "ranking after retries. No model-written text was returned."
                ),
                "retryable": True,
                "attempts": exc.attempts,
                "failure_codes": list(exc.failure_codes),
                "guidance": {"action": "retry_request"},
            },
        ) from exc
    except ClaudeTimeoutError as exc:
        logger.warning("Claude request timed out error_type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"code": "MODEL_TIMEOUT", "message": "Claude timed out"},
        ) from exc
    except ClaudeUnavailableError as exc:
        logger.warning("Claude unavailable error_type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "MODEL_UNAVAILABLE",
                "message": "Claude is temporarily unavailable",
            },
        ) from exc
    except ClaudeConfigurationError as exc:
        logger.error("Claude configuration rejected error_type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "MODEL_CONFIGURATION_ERROR",
                "message": "Claude credentials or model configuration were rejected",
            },
        ) from exc
    except ClaudeProviderError as exc:
        logger.warning("Claude API error error_type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "MODEL_API_ERROR", "message": "Claude returned an API error"},
        ) from exc

    return ShortenAnswerResponse(**outcome.__dict__)
