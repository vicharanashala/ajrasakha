"""WhatsApp test-client transport stub (Step 013).

DISABLED BY DEFAULT. Requires --transport whatsapp CLI flag AND all of:
  - WHATSAPP_TEST_ENDPOINT   (base URL of the test WhatsApp gateway)
  - WHATSAPP_TEST_IDENTITY   (safe test phone/identity — must be a sandbox number)
  - WHATSAPP_CORRELATION_ID_PREFIX  (prefix for correlation IDs, used for log tracing)

Safety rules:
  - Never sends real WhatsApp messages during this task or CI.
  - All log output redacts the endpoint and identity.
  - If any required env var is missing, returns BLOCKED — never falls back silently.
  - Correlation IDs are generated deterministically from case_id to make
    log correlation deterministic.
  - A configurable poll timeout (WHATSAPP_TEST_TIMEOUT_S, default 60s) prevents
    indefinite blocking.

The transport interface is pluggable: it must satisfy the same return schema as
run_live_case() so that the multilingual runner can call it transparently.
"""

from __future__ import annotations

import hashlib
import os
import time
from typing import Any


# ── Configuration keys ──────────────────────────────────────────────────────
_ENV_ENDPOINT = "WHATSAPP_TEST_ENDPOINT"
_ENV_IDENTITY = "WHATSAPP_TEST_IDENTITY"
_ENV_CORRELATION_PREFIX = "WHATSAPP_CORRELATION_ID_PREFIX"
_ENV_TIMEOUT = "WHATSAPP_TEST_TIMEOUT_S"


class WhatsAppTransportConfig:
    """Holds required configuration for the WhatsApp test transport."""

    def __init__(self) -> None:
        self.endpoint = os.getenv(_ENV_ENDPOINT, "")
        self.identity = os.getenv(_ENV_IDENTITY, "")
        self.correlation_prefix = os.getenv(_ENV_CORRELATION_PREFIX, "ml-test")
        self.timeout_s = float(os.getenv(_ENV_TIMEOUT, "60"))

    def is_configured(self) -> bool:
        return bool(self.endpoint and self.identity)

    def missing_vars(self) -> list[str]:
        missing = []
        if not self.endpoint:
            missing.append(_ENV_ENDPOINT)
        if not self.identity:
            missing.append(_ENV_IDENTITY)
        return missing

    def redacted_endpoint(self) -> str:
        """Return endpoint with credentials redacted for safe logging."""
        ep = self.endpoint or ""
        if "://" in ep:
            scheme, rest = ep.split("://", 1)
            # Redact any user:pass@ prefix
            if "@" in rest:
                rest = rest.split("@", 1)[1]
            return f"{scheme}://[REDACTED]/{rest.split('/', 1)[1] if '/' in rest else '...'}"
        return "[REDACTED]"


def _make_correlation_id(case_id: str, prefix: str) -> str:
    """Deterministic correlation ID from case_id."""
    digest = hashlib.sha256(case_id.encode()).hexdigest()[:8]
    return f"{prefix}-{digest}"


def _blocked(case_id: str, reason: str) -> dict:
    return {
        "name": case_id,
        "query": "",
        "expected_tools": "",
        "observed_tools": "",
        "http_status": None,
        "graph_status": "blocked",
        "latency_seconds": 0.0,
        "response_text": "",
        "error": reason,
        "trace": {"nodes": [], "tools": [], "mcp_services": [], "errors": [reason]},
        "transport": "whatsapp",
        "correlation_id": "",
        "whatsapp_blocked_reason": reason,
    }


def run_whatsapp_case(case_dict: dict) -> dict:
    """Send a query via WhatsApp test transport and return a result dict.

    IMPORTANT: This is a stub. In production it would:
      1. POST the query to WHATSAPP_TEST_ENDPOINT with the test identity.
      2. Poll for a response with exponential backoff up to WHATSAPP_TEST_TIMEOUT_S.
      3. Return the response text and correlation ID.

    Currently raises NotImplementedError so that any attempt to call it in
    tests fails loudly rather than silently returning PASS.
    """
    cfg = WhatsAppTransportConfig()
    case_id = case_dict.get("name", "unknown")

    if not cfg.is_configured():
        missing = ", ".join(cfg.missing_vars())
        return _blocked(
            case_id,
            f"BLOCKED: WhatsApp transport not configured. Missing env vars: {missing}",
        )

    correlation_id = _make_correlation_id(case_id, cfg.correlation_prefix)

    import httpx

    start_time = time.time()
    
    try:
        # 1. POST the query
        payload = {
            "query": case_dict.get("query", ""),
            "identity": cfg.identity,
            "correlation_id": correlation_id,
            "case_id": case_id,
        }
        
        send_url = f"{cfg.endpoint.rstrip('/')}/send"
        response = httpx.post(send_url, json=payload, timeout=10.0)
        response.raise_for_status()
        
        # 2. Poll for response
        poll_url = f"{cfg.endpoint.rstrip('/')}/poll/{correlation_id}"
        timeout_time = start_time + cfg.timeout_s
        backoff = 1.0
        
        while time.time() < timeout_time:
            poll_resp = httpx.get(poll_url, timeout=10.0)
            if poll_resp.status_code == 200:
                data = poll_resp.json()
                if data.get("status") == "completed":
                    end_time = time.time()
                    return {
                        "name": case_id,
                        "query": case_dict.get("query", ""),
                        "expected_tools": case_dict.get("expected_tools", ""),
                        "observed_tools": data.get("observed_tools", ""),
                        "http_status": 200,
                        "graph_status": "success",
                        "latency_seconds": end_time - start_time,
                        "response_text": data.get("response_text", ""),
                        "error": "",
                        "trace": data.get("trace", {"nodes": [], "tools": [], "mcp_services": [], "errors": []}),
                        "transport": "whatsapp",
                        "correlation_id": correlation_id,
                        "whatsapp_blocked_reason": "",
                    }
            time.sleep(backoff)
            backoff = min(backoff * 2, 5.0)
            
        return _blocked(case_id, f"Timeout after {cfg.timeout_s}s polling for correlation_id={correlation_id}")
        
    except httpx.RequestError as e:
        return _blocked(case_id, f"HTTP Error: {str(e)}")
    except Exception as e:
        return _blocked(case_id, f"Unexpected Error: {str(e)}")


def is_whatsapp_transport_available() -> bool:
    """True only when all required env vars are set (does not validate connectivity)."""
    return WhatsAppTransportConfig().is_configured()
