"""Bearer-token admin authentication for GDB scheduler endpoints.

This module is intentionally tiny and standalone: the existing
``acc_api`` codebase doesn't have an auth dependency yet, so we ship
our own to avoid pulling in the wider project's identity layer for
this single concern.

Wire it into a FastAPI endpoint with ``Depends(verify_admin_token)``
(or the lower-level ``require_bearer_token`` helper if you need more
control over the error shape).

Token source
------------
The accepted token is read from ``GDB_SCHEDULER_ADMIN_TOKEN``.  It is
compared in constant time against the ``Authorization: Bearer <tok>``
header (or, as a fallback, ``X-Admin-Token``).  When the env var is
unset the dependency **fails closed** — every request is rejected
with HTTP 503.  This is safer than a permissive default.

The same token can also be passed via the ``?token=`` query parameter
for operators running one-shot curl commands; the production
deployment should be reverse-proxied to block that, but for now it's
useful.
"""

from __future__ import annotations

import hmac
import os
from typing import Optional

from fastapi import Header, HTTPException, Query, status


HEADER_NAME = "Authorization"
ALT_HEADER_NAME = "X-Admin-Token"
TOKEN_ENV = "GDB_SCHEDULER_ADMIN_TOKEN"


def get_expected_token() -> Optional[str]:
    """Return the configured admin token or ``None`` if unset.

    ``None`` is the closed/insecure state — callers should treat it
    as "deny all".
    """
    raw = os.getenv(TOKEN_ENV)
    if raw is None:
        return None
    raw = raw.strip()
    return raw or None


def _extract_bearer(
    authorization: Optional[str],
    x_admin_token: Optional[str],
    query_token: Optional[str],
) -> Optional[str]:
    """Pick the first usable token out of the request headers."""
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            return token.strip()
    if x_admin_token:
        return x_admin_token.strip()
    if query_token:
        return query_token.strip()
    return None


def check_admin_token(token: Optional[str]) -> bool:
    """Constant-time check: does ``token`` match the configured admin token?"""
    expected = get_expected_token()
    if expected is None or token is None:
        return False
    return hmac.compare_digest(expected, token)


def require_bearer_token(
    authorization: Optional[str] = Header(default=None, alias=HEADER_NAME),
    x_admin_token: Optional[str] = Header(default=None, alias=ALT_HEADER_NAME),
    token: Optional[str] = Query(default=None),
) -> str:
    """FastAPI dependency that returns the token on success.

    Raises:
        401: when a token is supplied but wrong / malformed.
        503: when the server has no token configured (fail-closed).
    """
    expected = get_expected_token()
    if expected is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "admin endpoints disabled: "
                f"{TOKEN_ENV} is not configured on the server"),
        )

    supplied = _extract_bearer(authorization, x_admin_token, token)
    if not supplied:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing admin token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not hmac.compare_digest(expected, supplied):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid admin token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return supplied


__all__ = [
    "check_admin_token",
    "get_expected_token",
    "require_bearer_token",
    "TOKEN_ENV",
]