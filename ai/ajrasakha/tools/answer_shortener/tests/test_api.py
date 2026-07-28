from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from ajrasakha.tools.answer_shortener.api import (
    _build_shortener_service,
    app,
    get_shortener_service,
    settings_dependency,
)
from ajrasakha.tools.answer_shortener.claude_client import (
    ClaudeConfigurationError,
    ClaudeProviderError,
    ClaudeTimeoutError,
    ClaudeUnavailableError,
)
from ajrasakha.tools.answer_shortener.config import Settings, get_settings
from ajrasakha.tools.answer_shortener.service import (
    AnswerBodyMissingError,
    ExtractiveRangeNotFeasibleError,
    ModelSelectionError,
    ProtectedContentTooLargeError,
    ShorteningOutcome,
    TargetRequiresExpansionError,
)


class StubService:
    async def shorten(self, **kwargs) -> ShorteningOutcome:
        answer = "short answer" + ("x" * 89)
        return ShorteningOutcome(
            short_answer=answer,
            full_answer=kwargs["answer"],
            status="shortened",
            original_character_count=len(kwargs["answer"]),
            expected_character_count=kwargs["expected_character_count"],
            minimum_character_count=50,
            maximum_character_count=150,
            actual_character_count=len(answer),
            tolerance=50,
            within_tolerance=True,
            footer_character_count=0,
            changed=True,
            rewrite_attempts=1,
            model="claude-test-sonnet",
        )


class RaisingService:
    def __init__(self, error: Exception) -> None:
        self.error = error

    async def shorten(self, **kwargs) -> ShorteningOutcome:
        raise self.error


@pytest.fixture(autouse=True)
def reset_dependencies(monkeypatch):
    monkeypatch.delenv("ANSWER_SHORTENER_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    get_settings.cache_clear()
    _build_shortener_service.cache_clear()
    app.dependency_overrides[get_shortener_service] = lambda: StubService()
    yield
    app.dependency_overrides.clear()
    get_settings.cache_clear()
    _build_shortener_service.cache_clear()


def test_health_is_public():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "answer-shortener"}


def test_readiness_fails_without_anthropic_key():
    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "SERVICE_NOT_READY"


def test_readiness_rejects_example_placeholder_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "your_anthropic_api_key_here")
    get_settings.cache_clear()

    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "SERVICE_NOT_READY"


def test_readiness_reports_sonnet_model():
    settings = replace(
        Settings.from_env(),
        anthropic_api_key="test-anthropic-key",
        model="claude-sonnet-4-6",
    )
    app.dependency_overrides[settings_dependency] = lambda: settings

    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["model"] == "claude-sonnet-4-6"


def test_shorten_endpoint_contract():
    with TestClient(app) as client:
        response = client.post(
            "/v1/answers/shorten",
            json={
                "original_query": "How much urea for wheat?",
                "answer": "a" * 220,
                "expected_character_count": 100,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["within_tolerance"] is True
    assert payload["expected_character_count"] == 100
    assert payload["actual_character_count"] == 101
    assert payload["full_answer"] == "a" * 220
    assert payload["footer_character_count"] == 0


@pytest.mark.parametrize(
    "payload",
    [
        {"original_query": "", "answer": "answer", "expected_character_count": 100},
        {"original_query": "query", "answer": "", "expected_character_count": 100},
        {"original_query": "query", "answer": "answer", "expected_character_count": 0},
        {"original_query": "query", "answer": "answer", "expected_character_count": "100"},
        {
            "original_query": "query",
            "answer": "answer",
            "expected_character_count": 100,
            "model": "caller-controlled-model",
        },
    ],
)
def test_invalid_request_fields_return_422(payload):
    with TestClient(app) as client:
        response = client.post("/v1/answers/shorten", json=payload)
    assert response.status_code == 422


def test_api_key_is_required_when_configured(monkeypatch):
    settings = Settings.from_env()
    protected_settings = replace(settings, service_api_key="local-secret")
    app.dependency_overrides.clear()

    from ajrasakha.tools.answer_shortener import api

    app.dependency_overrides[api.settings_dependency] = lambda: protected_settings
    app.dependency_overrides[get_shortener_service] = lambda: StubService()

    with TestClient(app) as client:
        missing = client.post(
            "/v1/answers/shorten",
            json={
                "original_query": "query",
                "answer": "a" * 220,
                "expected_character_count": 100,
            },
        )
        rejected = client.post(
            "/v1/answers/shorten",
            headers={"X-API-Key": "wrong-secret"},
            json={
                "original_query": "query",
                "answer": "a" * 220,
                "expected_character_count": 100,
            },
        )
        accepted = client.post(
            "/v1/answers/shorten",
            headers={"X-API-Key": "local-secret"},
            json={
                "original_query": "query",
                "answer": "a" * 220,
                "expected_character_count": 100,
            },
        )

    assert missing.status_code == 401
    assert rejected.status_code == 401
    assert accepted.status_code == 200


@pytest.mark.parametrize(
    ("error", "expected_status", "expected_code"),
    [
        (
            TargetRequiresExpansionError("target requires expansion"),
            422,
            "TARGET_REQUIRES_EXPANSION",
        ),
        (
            AnswerBodyMissingError("answer body is missing"),
            422,
            "ANSWER_BODY_MISSING",
        ),
        (
            ProtectedContentTooLargeError("protected content is too large"),
            422,
            "TARGET_TOO_SMALL_FOR_PROTECTED_CONTENT",
        ),
        (ClaudeTimeoutError("timeout"), 504, "MODEL_TIMEOUT"),
        (ClaudeUnavailableError("unavailable"), 503, "MODEL_UNAVAILABLE"),
        (
            ClaudeConfigurationError("bad credentials"),
            503,
            "MODEL_CONFIGURATION_ERROR",
        ),
        (ClaudeProviderError("provider error"), 502, "MODEL_API_ERROR"),
    ],
)
def test_endpoint_maps_domain_and_provider_errors(
    error: Exception,
    expected_status: int,
    expected_code: str,
):
    app.dependency_overrides[get_shortener_service] = lambda: RaisingService(error)

    with TestClient(app) as client:
        response = client.post(
            "/v1/answers/shorten",
            json={
                "original_query": "query",
                "answer": "a" * 220,
                "expected_character_count": 100,
            },
        )

    assert response.status_code == expected_status
    assert response.json()["detail"]["code"] == expected_code


def test_infeasible_extractive_range_returns_actionable_422():
    error = ExtractiveRangeNotFeasibleError(
        lower_bound=150,
        target=200,
        upper_bound=250,
        closest_achievable_lengths=(140, 270),
    )
    app.dependency_overrides[get_shortener_service] = lambda: RaisingService(error)

    with TestClient(app) as client:
        response = client.post(
            "/v1/answers/shorten",
            json={
                "original_query": "query",
                "answer": "a" * 220,
                "expected_character_count": 100,
            },
        )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "EXTRACTIVE_RANGE_NOT_FEASIBLE"
    assert detail["requested"] == {
        "expected_character_count": 200,
        "minimum_character_count": 150,
        "maximum_character_count": 250,
    }
    assert detail["closest_achievable_character_counts"] == [140, 270]
    assert detail["guidance"] == {
        "action": "adjust_expected_character_count",
        "recommended_expected_character_count": 140,
    }
    assert "will not rewrite or truncate source text" in detail["message"]


def test_invalid_model_ranking_returns_sanitized_502():
    error = ModelSelectionError(
        attempts=3,
        failure_codes=("INVALID_SELECTION_JSON", "INVALID_SEGMENT_RANKING"),
    )
    app.dependency_overrides[get_shortener_service] = lambda: RaisingService(error)

    with TestClient(app) as client:
        response = client.post(
            "/v1/answers/shorten",
            json={
                "original_query": "query",
                "answer": "a" * 220,
                "expected_character_count": 100,
            },
        )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["code"] == "MODEL_SELECTION_INVALID"
    assert detail["attempts"] == 3
    assert detail["failure_codes"] == [
        "INVALID_SELECTION_JSON",
        "INVALID_SEGMENT_RANKING",
    ]
    assert "model-written text was returned" in detail["message"]
    assert "rejected prose" not in response.text
