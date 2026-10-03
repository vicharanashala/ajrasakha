"""Reusable client for TypeSafe Jev (OpenRouter Decisions API).

Jev is a non-generative decision model: it returns a typed answer
(``choice``, ``noul`` = probability of yes, or ``score``) instead of text.
This module is only a thin, dependency-light (httpx) client plus the switch
helpers used at each integration point. It never changes production behaviour
on its own: every task defaults to the ``current`` provider.

Configuration (all optional, read at call time so tests can monkeypatch):

    JEV_GATEWAY                  typesafe | openrouter (default typesafe)
    JEV_PROVIDER                 default provider for every task: current | jev  (default current)
    JEV_PROVIDER_<TASK>          per-task override, e.g. JEV_PROVIDER_CROP_REQUIREMENT=jev
    JEV_FALLBACK                 what to do when Jev fails / is low confidence:
                                   current -> call the existing model (default)
                                   default -> use the function's existing deterministic failure default
    JEV_MODEL                    default jev-latest for TypeSafe; typesafe/jev-1.13 for OpenRouter
    JEV_BASE_URL                 optional endpoint override
    JEV_TIMEOUT_S                default 10
    JEV_MIN_CONFIDENCE           default 0.0 (global); JEV_MIN_CONFIDENCE_<TASK> overrides
    JEV_TRACE_PATH               if set, append one JSON line per Jev call (no farmer text by default)
    JEV_TRACE_INCLUDE_TEXT       1 to also store the input text in the trace (off by default)
    TYPESAFE_API_KEY             direct TypeSafe credential; never logged or traced
    OPENROUTER_API_KEY           OpenRouter credential when JEV_GATEWAY=openrouter
"""

from __future__ import annotations

import contextvars
import hashlib
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional

import httpx

logger = logging.getLogger(__name__)

TYPESAFE_BASE_URL = "https://api.typesafe.ai/v1/systemone"
TYPESAFE_MODEL = "jev-latest"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/alpha/decisions"
OPENROUTER_MODEL = "typesafe/jev-1.13"

# Set by experiment harnesses to force a provider for one logical run without
# touching process-wide environment (takes precedence over env variables).
_provider_override: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar(
    "jev_provider_override", default=None
)
# Collects per-call outcomes (fallback reason etc.) for harness accounting.
_call_log: contextvars.ContextVar[Optional[list]] = contextvars.ContextVar(
    "jev_call_log", default=None
)
_trace_lock = threading.Lock()


class JevError(RuntimeError):
    """Base class; ``reason`` is a short machine-readable fallback reason."""

    reason = "jev_error"


class JevAuthError(JevError):
    reason = "auth_error"


class JevTimeoutError(JevError):
    reason = "timeout"


class JevHTTPError(JevError):
    reason = "http_error"


class JevInvalidResponse(JevError):
    reason = "invalid_response"


class JevLowConfidence(JevError):
    reason = "low_confidence"


@dataclass
class JevResult:
    """Parsed Decisions API response."""

    answers: dict[str, dict[str, Any]]
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cost: Optional[float] = None
    latency_ms: float = 0.0
    request_id: str = ""
    raw_usage: dict[str, Any] = field(default_factory=dict)

    def choice(self, key: str) -> tuple[str, dict[str, float], float]:
        a = self._answer(key, "choice")
        choice = a.get("choice")
        probs = a.get("probabilities") or {}
        if not isinstance(choice, str) or not isinstance(probs, dict):
            raise JevInvalidResponse(f"answer {key!r} has no choice")
        return choice, {str(k): float(v) for k, v in probs.items()}, float(a.get("confidence", 0.0))

    def noul(self, key: str) -> float:
        a = self._answer(key, "noul")
        try:
            return float(a["noul"])
        except (KeyError, TypeError, ValueError) as exc:
            raise JevInvalidResponse(f"answer {key!r} has no noul") from exc

    def score(self, key: str) -> tuple[float, dict[str, float], float]:
        a = self._answer(key, "score")
        try:
            return float(a["score"]), {str(k): float(v) for k, v in (a.get("probabilities") or {}).items()}, float(
                a.get("confidence", 0.0)
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise JevInvalidResponse(f"answer {key!r} has no score") from exc

    def _answer(self, key: str, kind: str) -> dict[str, Any]:
        a = self.answers.get(key)
        if not isinstance(a, dict) or a.get("type") != kind:
            raise JevInvalidResponse(f"missing or wrong-typed answer {key!r} (want {kind})")
        return a


# --------------------------------------------------------------------------- config


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def gateway() -> str:
    """Return the configured Jev API gateway."""
    return "openrouter" if _env("JEV_GATEWAY", "typesafe").lower() == "openrouter" else "typesafe"


def base_url() -> str:
    default = OPENROUTER_BASE_URL if gateway() == "openrouter" else TYPESAFE_BASE_URL
    return _env("JEV_BASE_URL", default)


def model_name() -> str:
    default = OPENROUTER_MODEL if gateway() == "openrouter" else TYPESAFE_MODEL
    return _env("JEV_MODEL", default)


def timeout_s() -> float:
    try:
        return float(_env("JEV_TIMEOUT_S", "10"))
    except ValueError:
        return 10.0


def min_confidence(task: str) -> float:
    raw = _env(f"JEV_MIN_CONFIDENCE_{task.upper()}") or _env("JEV_MIN_CONFIDENCE", "0")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def provider_for(task: str) -> str:
    """Return ``"jev"`` or ``"current"`` for a task. Default is always current."""
    override = _provider_override.get()
    if override and task in override:
        return override[task]
    if override and "*" in override:
        return override["*"]
    value = (_env(f"JEV_PROVIDER_{task.upper()}") or _env("JEV_PROVIDER", "current")).lower()
    return "jev" if value == "jev" else "current"


def fallback_mode() -> str:
    """``current`` (call existing model) or ``default`` (deterministic default)."""
    override = _provider_override.get()
    if override and "fallback" in override:
        return override["fallback"]
    return "default" if _env("JEV_FALLBACK", "current").lower() == "default" else "current"


class provider_override:
    """Context manager: force providers for the enclosed code (harness/test use).

    ``with provider_override({"crop_requirement": "jev", "fallback": "default"}): ...``
    """

    def __init__(self, mapping: Mapping[str, str]):
        self._mapping = dict(mapping)
        self._token = None

    def __enter__(self):
        self._token = _provider_override.set(self._mapping)
        return self

    def __exit__(self, *exc):
        _provider_override.reset(self._token)


class call_recorder:
    """Context manager: collect one dict per Jev call / fallback in the block."""

    def __init__(self):
        self.records: list[dict[str, Any]] = []
        self._token = None

    def __enter__(self):
        self._token = _call_log.set(self.records)
        return self

    def __exit__(self, *exc):
        _call_log.reset(self._token)


# --------------------------------------------------------------------------- tracing


def _state_fingerprint(state: Any) -> dict[str, Any]:
    text = state if isinstance(state, str) else json.dumps(state, ensure_ascii=False, sort_keys=True)
    return {"state_len": len(text), "state_sha256_8": hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]}


def trace(task: str, **fields: Any) -> None:
    """Append a trace record. Never contains credentials; farmer text only if opted in."""
    record = {"ts": round(time.time(), 3), "task": task, **fields}
    log = _call_log.get()
    if log is not None:
        log.append(record)
    path = _env("JEV_TRACE_PATH")
    if not path:
        return
    try:
        with _trace_lock, open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
    except OSError as exc:  # tracing must never break a farmer request
        logger.warning("jev trace write failed: %s", exc)


# --------------------------------------------------------------------------- HTTP


def _api_key() -> str:
    name = "OPENROUTER_API_KEY" if gateway() == "openrouter" else "TYPESAFE_API_KEY"
    key = _env(name)
    if not key:
        raise JevAuthError(f"{name} is not configured")
    return key


def _build_body(state: Any, questions: Mapping[str, Any]) -> dict[str, Any]:
    return {"model": model_name(), "state": state, "questions": dict(questions)}


def _parse(payload: dict[str, Any], latency_ms: float) -> JevResult:
    answers = payload.get("answers")
    if not isinstance(answers, dict):
        raise JevInvalidResponse("response has no answers object")
    usage = payload.get("usage") or {}
    cost = usage.get("cost")
    return JevResult(
        answers=answers,
        model=str(payload.get("model") or ""),
        input_tokens=int(usage.get("input_tokens") or 0),
        output_tokens=int(usage.get("output_tokens") or 0),
        cost=float(cost) if isinstance(cost, (int, float)) else None,
        latency_ms=latency_ms,
        request_id=str(payload.get("id") or ""),
        raw_usage=dict(usage),
    )


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code in (401, 403):
        raise JevAuthError(f"Jev credentials rejected (HTTP {response.status_code})")
    if response.status_code >= 400:
        # body may echo input; keep only status code
        raise JevHTTPError(f"Jev returned HTTP {response.status_code}")


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"}


def decide(task: str, state: Any, questions: Mapping[str, Any]) -> JevResult:
    """Synchronous Jev call. Raises a ``JevError`` subclass on any failure."""
    started = time.perf_counter()
    try:
        response = httpx.post(base_url(), json=_build_body(state, questions), headers=_headers(), timeout=timeout_s())
    except httpx.TimeoutException as exc:
        raise JevTimeoutError("Jev request timed out") from exc
    except httpx.HTTPError as exc:
        raise JevHTTPError(f"Jev request failed: {type(exc).__name__}") from exc
    latency_ms = (time.perf_counter() - started) * 1000
    _raise_for_status(response)
    try:
        result = _parse(response.json(), latency_ms)
    except ValueError as exc:
        raise JevInvalidResponse("Jev response was not JSON") from exc
    _trace_ok(task, state, result)
    return result


async def adecide(task: str, state: Any, questions: Mapping[str, Any]) -> JevResult:
    """Async Jev call. Raises a ``JevError`` subclass on any failure."""
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                base_url(), json=_build_body(state, questions), headers=_headers(), timeout=timeout_s()
            )
    except httpx.TimeoutException as exc:
        raise JevTimeoutError("Jev request timed out") from exc
    except httpx.HTTPError as exc:
        raise JevHTTPError(f"Jev request failed: {type(exc).__name__}") from exc
    latency_ms = (time.perf_counter() - started) * 1000
    _raise_for_status(response)
    try:
        result = _parse(response.json(), latency_ms)
    except ValueError as exc:
        raise JevInvalidResponse("Jev response was not JSON") from exc
    _trace_ok(task, state, result)
    return result


def _trace_ok(task: str, state: Any, result: JevResult) -> None:
    decisions: dict[str, Any] = {}
    for key, ans in result.answers.items():
        if not isinstance(ans, dict):
            continue
        kind = ans.get("type")
        if kind == "choice":
            decisions[key] = {"choice": ans.get("choice"), "probabilities": ans.get("probabilities"),
                              "confidence": ans.get("confidence")}
        elif kind == "noul":
            decisions[key] = {"noul": ans.get("noul")}
        elif kind == "score":
            decisions[key] = {"score": ans.get("score"), "confidence": ans.get("confidence")}
    extra: dict[str, Any] = {}
    if _env("JEV_TRACE_INCLUDE_TEXT") == "1":
        extra["state"] = state
    trace(task, provider="jev", event="decision", model_version=result.model, decisions=decisions,
          latency_ms=round(result.latency_ms, 1), input_tokens=result.input_tokens,
          output_tokens=result.output_tokens, cost=result.cost, request_id=result.request_id,
          **_state_fingerprint(state), **extra)


def trace_fallback(task: str, reason: str, *, used: str) -> None:
    """Record why Jev was not used for a decision (``used`` = current | default)."""
    trace(task, provider="jev", event="fallback", fallback_reason=reason, fallback_used=used)


# --------------------------------------------------------------------------- helpers


def choice_question(instructions: str, criteria: Mapping[str, str]) -> dict[str, Any]:
    return {"type": "choice", "instructions": instructions, "criteria": dict(criteria)}


def noul_question(instructions: str) -> dict[str, Any]:
    return {"type": "noul", "instructions": instructions}


def score_question(instructions: str, levels: list[str]) -> dict[str, Any]:
    return {"type": "score", "instructions": instructions, "criteria": list(levels)}


def require_confidence(task: str, confidence: float) -> None:
    """Raise ``JevLowConfidence`` if below the configured threshold for the task."""
    threshold = min_confidence(task)
    if confidence < threshold:
        raise JevLowConfidence(f"confidence {confidence:.2f} < threshold {threshold:.2f}")


def noul_confidence(p_yes: float) -> float:
    """Confidence proxy for ``noul`` answers (which carry no confidence field)."""
    return max(p_yes, 1.0 - p_yes)


def on_failure(task: str, exc: BaseException) -> str:
    """Trace a Jev failure and return the configured fallback mode.

    Returns ``"current"`` (caller should run its existing model path) or
    ``"default"`` (caller should return its existing deterministic default).
    """
    reason = getattr(exc, "reason", None) or type(exc).__name__
    mode = fallback_mode()
    trace_fallback(task, reason, used=mode)
    logger.warning("jev %s failed (%s); fallback=%s", task, reason, mode)
    return mode


def planner_mode() -> str:
    """Planner integration mode: ``shadow`` (compare/trace only, default) or ``override``."""
    override = _provider_override.get()
    if override and "planner_mode" in override:
        return override["planner_mode"]
    return "override" if _env("JEV_PLANNER_MODE", "shadow").lower() == "override" else "shadow"


def option(name: str, default: str) -> str:
    """Read a string option: harness override first, then JEV_<NAME> environment variable."""
    override = _provider_override.get()
    if override and name in override:
        return str(override[name])
    return _env("JEV_" + name.upper(), default)
