"""WhatsApp test client — wraps the production WhatsApp webhook surface.

The real AjraSakha is consumed by farmers via WhatsApp; this module
provides a thin Python client that speaks the same webhook protocol
so the multilingual suite can drive the *actual* transport in
staging.  In CI we fall back to the in-process mock.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

import urllib.request
import urllib.error


@dataclass
class WhatsAppConfig:
    """Connection details for the WhatsApp test bot."""

    base_url: str = ""
    session_id: str = "multilingual-suite"
    phone_number_id: str = ""
    api_key: str = ""

    @classmethod
    def from_env(cls) -> "WhatsAppConfig":
        return cls(
            base_url=os.environ.get(
                "AJRASAKHA_WHATSAPP_TEST_URL",
                "http://localhost:8000/ajrasakha/test/ask",
            ),
            session_id=os.environ.get(
                "AJRASAKHA_TEST_SESSION_ID", "multilingual-suite"
            ),
            phone_number_id=os.environ.get(
                "AJRASAKHA_WHATSAPP_PHONE_ID", "TEST_PHONE_ID"
            ),
            api_key=os.environ.get("AJRASAKHA_TEST_API_KEY", ""),
        )


class WhatsAppTestClient:
    """Synchronous WhatsApp-style send/receive client for tests."""

    def __init__(self, config: Optional[WhatsAppConfig] = None):
        self.config = config or WhatsAppConfig.from_env()

    def send_text(self, *, to: str, body: str, language: str) -> Dict[str, object]:
        """POST a text message to the WhatsApp test bot.

        Returns the parsed JSON payload from the server.
        """
        payload = {
            "messaging_product": "whatsapp",
            "to":               to,
            "type":             "text",
            "text":             {"body": body},
            "metadata":         {"language": language,
                                  "session_id": self.config.session_id},
        }
        req = urllib.request.Request(
            self.config.base_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type":    "application/json",
                "X-Api-Key":       self.config.api_key,
                "X-Phone-Number":  self.config.phone_number_id,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError,
                TimeoutError, json.JSONDecodeError) as exc:
            return {"ok": False, "error": str(exc)}

    def fetch_replies(self, *, since_ts: float = 0.0,
                      language: Optional[str] = None
                      ) -> List[Dict[str, object]]:
        """Poll for replies (used in staging only; mock returns empty)."""
        url = self.config.base_url.rstrip("/") + "/replies"
        params = []
        if since_ts:
            params.append(f"since={since_ts}")
        if language:
            params.append(f"lang={language}")
        if params:
            url = url + "?" + "&".join(params)
        req = urllib.request.Request(
            url,
            headers={"X-Api-Key": self.config.api_key},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=30.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError,
                TimeoutError, json.JSONDecodeError):
            return []

    def ask(self, *, to: str, body: str, language: str,
            timeout_s: float = 30.0) -> str:
        """Send a message and wait for the first reply (sync, blocking)."""
        start = time.time()
        sent = self.send_text(to=to, body=body, language=language)
        if not sent.get("ok", True):
            return ""
        while time.time() - start < timeout_s:
            replies = self.fetch_replies(since_ts=start, language=language)
            for reply in replies:
                if reply.get("to") == to:
                    return str(reply.get("body", ""))
            time.sleep(0.5)
        return ""