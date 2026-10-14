"""Mocked unit tests for the WhatsApp test-client transport stub (Step 013).

ALL tests use unittest.mock — no real WhatsApp messages are sent.
Tests verify: BLOCKED on missing env vars, NotImplementedError on configured stub,
availability detection, correlation ID determinism, and redacted endpoint logging.
"""

from __future__ import annotations

import hashlib
import os
import pytest
from unittest.mock import patch

from ajrasakha.evaluation.multilingual.transports.whatsapp_transport import (
    WhatsAppTransportConfig,
    run_whatsapp_case,
    is_whatsapp_transport_available,
    _make_correlation_id,
)


_FAKE_ENDPOINT = "https://wa-test.example.invalid"
_FAKE_IDENTITY = "+91-TEST-0000"
_ENV_CONFIGURED = {
    "WHATSAPP_TEST_ENDPOINT": _FAKE_ENDPOINT,
    "WHATSAPP_TEST_IDENTITY": _FAKE_IDENTITY,
}
_ENV_EMPTY = {k: v for k, v in os.environ.items()
              if k not in ("WHATSAPP_TEST_ENDPOINT", "WHATSAPP_TEST_IDENTITY")}


class TestWhatsAppConfig:
    def test_missing_endpoint_not_configured(self):
        with patch.dict(os.environ, {"WHATSAPP_TEST_IDENTITY": _FAKE_IDENTITY,
                                     "WHATSAPP_TEST_ENDPOINT": ""}, clear=False):
            cfg = WhatsAppTransportConfig()
            assert not cfg.is_configured()
            assert "WHATSAPP_TEST_ENDPOINT" in cfg.missing_vars()

    def test_missing_identity_not_configured(self):
        with patch.dict(os.environ, {"WHATSAPP_TEST_ENDPOINT": _FAKE_ENDPOINT,
                                     "WHATSAPP_TEST_IDENTITY": ""}, clear=False):
            cfg = WhatsAppTransportConfig()
            assert not cfg.is_configured()
            assert "WHATSAPP_TEST_IDENTITY" in cfg.missing_vars()

    def test_both_present_is_configured(self):
        with patch.dict(os.environ, _ENV_CONFIGURED, clear=False):
            cfg = WhatsAppTransportConfig()
            assert cfg.is_configured()
            assert cfg.missing_vars() == []

    def test_redacted_endpoint_does_not_expose_full_url(self):
        with patch.dict(os.environ, _ENV_CONFIGURED, clear=False):
            cfg = WhatsAppTransportConfig()
            redacted = cfg.redacted_endpoint()
            assert _FAKE_ENDPOINT not in redacted, "Full endpoint URL must be redacted in logs"

    def test_default_timeout(self):
        with patch.dict(os.environ, _ENV_CONFIGURED, clear=False):
            cfg = WhatsAppTransportConfig()
            assert cfg.timeout_s == 60.0


class TestRunWhatsAppCase:
    def test_blocked_when_endpoint_missing(self):
        with patch.dict(os.environ, _ENV_EMPTY, clear=True):
            result = run_whatsapp_case({"name": "ML-S01-EN"})
            assert result["graph_status"] == "blocked"
            assert "BLOCKED" in result["error"]

    def test_blocked_result_contains_missing_var_name(self):
        with patch.dict(os.environ, _ENV_EMPTY, clear=True):
            result = run_whatsapp_case({"name": "ML-S01-EN"})
            error = result["error"]
            assert "WHATSAPP_TEST_ENDPOINT" in error or "WHATSAPP_TEST_IDENTITY" in error

    @patch("httpx.post")
    def test_configured_runs_httpx_post(self, mock_post):
        """When env vars are set, stub attempts to POST."""
        mock_post.side_effect = Exception("Mocked exception")
        with patch.dict(os.environ, _ENV_CONFIGURED, clear=False):
            result = run_whatsapp_case({"name": "ML-S07-HI"})
            assert "error" in result
            assert "Mocked exception" in result["error"]
            mock_post.assert_called_once()

    @patch("httpx.post")
    def test_run_whatsapp_case_contains_case_id(self, mock_post):
        mock_post.side_effect = Exception("Mocked exception")
        with patch.dict(os.environ, _ENV_CONFIGURED, clear=False):
            result = run_whatsapp_case({"name": "ML-TEST-ID"})
            assert "ML-TEST-ID" in result["name"]


class TestCorrelationId:
    def test_deterministic_for_same_case_id(self):
        id1 = _make_correlation_id("ML-S01-EN", "ml-test")
        id2 = _make_correlation_id("ML-S01-EN", "ml-test")
        assert id1 == id2

    def test_different_case_ids_produce_different_correlation_ids(self):
        id1 = _make_correlation_id("ML-S01-EN", "ml-test")
        id2 = _make_correlation_id("ML-S07-HI", "ml-test")
        assert id1 != id2

    def test_prefix_applied(self):
        cid = _make_correlation_id("ML-S01-EN", "my-prefix")
        assert cid.startswith("my-prefix-")

    def test_digest_is_sha256_based(self):
        case_id = "ML-S01-EN"
        expected_digest = hashlib.sha256(case_id.encode()).hexdigest()[:8]
        cid = _make_correlation_id(case_id, "pfx")
        assert expected_digest in cid


class TestIsAvailable:
    def test_false_when_no_vars(self):
        with patch.dict(os.environ, _ENV_EMPTY, clear=True):
            assert is_whatsapp_transport_available() is False

    def test_true_when_configured(self):
        with patch.dict(os.environ, _ENV_CONFIGURED, clear=False):
            assert is_whatsapp_transport_available() is True
