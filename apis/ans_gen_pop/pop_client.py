from __future__ import annotations

import os

import httpx

from models import POPContextResponse

POP_V2_API_URL = os.getenv("POP_V2_API_URL", "http://localhost:9003").rstrip("/")
POP_V2_TIMEOUT_SECONDS = float(os.getenv("POP_V2_TIMEOUT_SECONDS", "30"))


class PopV2ClientError(Exception):
    """pop_v2 HTTP client failure with a user-facing message."""

    def __init__(self, message: str, *, url: str, cause: Exception | None = None):
        super().__init__(message)
        self.url = url
        self.cause = cause


def pop_context_url() -> str:
    return f"{POP_V2_API_URL}/pop/context"


async def check_pop_v2_health() -> dict:
    """Probe pop_v2 GET /health. Returns status dict for readiness checks."""
    health_url = f"{POP_V2_API_URL}/health"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(health_url)
            response.raise_for_status()
            body = response.json()
            return {"reachable": True, "url": health_url, "pop_v2": body}
    except httpx.ConnectError as exc:
        return {
            "reachable": False,
            "url": health_url,
            "error": f"Cannot connect to pop_v2 at {POP_V2_API_URL}. "
            f"Start pop_v2 (default API port 9003, Docker host port 9025) and set POP_V2_API_URL.",
            "detail": str(exc),
        }
    except Exception as exc:
        return {"reachable": False, "url": health_url, "error": str(exc)}


async def fetch_pop_contexts(query: str, state: str, crop: str) -> POPContextResponse:
    url = pop_context_url()
    payload = {"query": query, "state": state, "crop": crop}
    try:
        async with httpx.AsyncClient(timeout=POP_V2_TIMEOUT_SECONDS) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return POPContextResponse.model_validate(response.json())
    except httpx.ConnectError as exc:
        raise PopV2ClientError(
            f"Cannot reach pop_v2 at {POP_V2_API_URL}. "
            "Ensure pop_v2 is running and POP_V2_API_URL points to its FastAPI port "
            "(9003 in-container, often 9025 on the host via docker-compose).",
            url=url,
            cause=exc,
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise PopV2ClientError(
            f"pop_v2 returned HTTP {exc.response.status_code} for POST {url}",
            url=url,
            cause=exc,
        ) from exc
    except httpx.TimeoutException as exc:
        raise PopV2ClientError(
            f"pop_v2 request timed out after {POP_V2_TIMEOUT_SECONDS}s: POST {url}",
            url=url,
            cause=exc,
        ) from exc
