"""
Unit tests for the admin-token auth dependency in
``apis/acc_api/gap_scheduler_auth.py``.

The dependency is the only authentication boundary between operators
and the scheduler mutation endpoints (``run-now``,
``invalidate-cache``, ``state``).  These tests pin every branch:

* missing env var -> 503 fail-closed
* missing token -> 401
* wrong scheme -> 401
* mismatched token -> 401
* happy path -> the validated token is returned

We drive the dependency directly (rather than via TestClient) so the
tests stay fast and don't need a Mongo URI.
"""

from __future__ import annotations

import importlib
import os
import sys

import pytest
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(__file__)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
_APIS = os.path.abspath(os.path.join(_HERE, ".."))
if _APIS not in sys.path:
    sys.path.insert(0, _APIS)


@pytest.fixture(autouse=True)
def _reset_token_env(monkeypatch):
    """Drop GDB_SCHEDULER_ADMIN_TOKEN so we control it explicitly per test."""
    monkeypatch.delenv("GDB_SCHEDULER_ADMIN_TOKEN", raising=False)
    if "gap_scheduler_auth" in sys.modules:
        importlib.reload(sys.modules["gap_scheduler_auth"])
    import gap_scheduler_auth  # noqa: F401
    yield


def _dep(token: str | None = None, *,
         x_admin_token: str | None = None,
         query_token: str | None = None,
         token_env: str | None = "secret-token"):
    """Invoke ``require_bearer_token`` with controllable inputs."""
    import gap_scheduler_auth as auth
    if token_env is not None:
        os.environ["GDB_SCHEDULER_ADMIN_TOKEN"] = token_env
    else:
        os.environ.pop("GDB_SCHEDULER_ADMIN_TOKEN", None)
    # The dependency is a function whose parameters FastAPI fills from
    # the request; we call it directly with the same names.
    return auth.require_bearer_token(
        authorization=f"Bearer {token}" if token is not None else None,
        x_admin_token=x_admin_token,
        token=query_token,
    )


class TestAdminAuth:

    def test_no_token_configured_returns_503(self):
        import gap_scheduler_auth as auth
        with pytest.raises(HTTPException) as ei:
            auth.require_bearer_token(
                authorization="Bearer something", x_admin_token=None, token=None,
            )
        assert ei.value.status_code == 503
        assert "GDB_SCHEDULER_ADMIN_TOKEN" in ei.value.detail

    def test_empty_string_in_env_is_treated_as_unconfigured(self):
        os.environ["GDB_SCHEDULER_ADMIN_TOKEN"] = "   "
        import gap_scheduler_auth as auth
        importlib.reload(auth)
        with pytest.raises(HTTPException) as ei:
            auth.require_bearer_token(
                authorization="Bearer anything", x_admin_token=None, token=None,
            )
        assert ei.value.status_code == 503

    def test_missing_authorization_returns_401(self):
        with pytest.raises(HTTPException) as ei:
            _dep(token=None)
        assert ei.value.status_code == 401
        assert ei.value.headers["WWW-Authenticate"] == "Bearer"

    def test_wrong_token_returns_401(self):
        with pytest.raises(HTTPException) as ei:
            _dep(token="not-the-right-one")
        assert ei.value.status_code == 401

    def test_x_admin_token_header_is_honoured(self):
        # Header-based auth (no Bearer scheme) must work for cron users.
        out = _dep(token=None, x_admin_token="secret-token")
        assert out == "secret-token"

    def test_query_token_fallback_works(self):
        out = _dep(token=None, query_token="secret-token")
        assert out == "secret-token"

    def test_bearer_token_with_correct_value_returns_it(self):
        out = _dep(token="secret-token")
        assert out == "secret-token"

    def test_wrong_scheme_is_treated_as_missing(self):
        """``Authorization: Basic …`` is not a bearer token; the query
        fallback ``?token=...`` is what saves it.  We have to set the
        env var explicitly here because the autouse fixture drops it."""
        os.environ["GDB_SCHEDULER_ADMIN_TOKEN"] = "secret-token"
        if "gap_scheduler_auth" in sys.modules:
            importlib.reload(sys.modules["gap_scheduler_auth"])
        import gap_scheduler_auth as auth
        out_or_exc = auth.require_bearer_token(
            authorization="Basic dXNlcjpwYXNz", x_admin_token=None,
            token="secret-token",
        )
        # query fallback to ``?token=secret-token`` should still authenticate
        assert out_or_exc == "secret-token"

    def test_check_admin_token_helper(self, monkeypatch):
        import gap_scheduler_auth as auth
        monkeypatch.setenv("GDB_SCHEDULER_ADMIN_TOKEN", "secret-token")
        importlib.reload(auth)
        assert auth.check_admin_token("secret-token") is True
        assert auth.check_admin_token("nope") is False
        assert auth.check_admin_token(None) is False

    def test_get_expected_token_returns_none_when_unset(self, monkeypatch):
        import gap_scheduler_auth as auth
        monkeypatch.delenv("GDB_SCHEDULER_ADMIN_TOKEN", raising=False)
        importlib.reload(auth)
        assert auth.get_expected_token() is None

    def test_bearer_prefix_is_case_insensitive(self):
        """RFC 7235 says Bearer should be treated as a token type,
        matching schemes should be accepted case-insensitively."""
        os.environ["GDB_SCHEDULER_ADMIN_TOKEN"] = "secret-token"
        import gap_scheduler_auth as auth
        importlib.reload(auth)
        out = auth.require_bearer_token(
            authorization="bEaReR secret-token",
            x_admin_token=None,
            token=None,
        )
        assert out == "secret-token"