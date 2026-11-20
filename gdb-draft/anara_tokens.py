"""Keeps the Anara sign-in alive without a browser.

Anara gives an access token that lasts 24 hours and a refresh token. Using the refresh token returns a
new access token and a NEW refresh token (the old one stops working), so the new pair has to be kept:
a Cloud Run instance forgets its files when it restarts. This module

- renews the sign-in itself, well before it runs out (the MCP client's own renewal did not work here);
- keeps a copy of every renewed sign-in in Google Secret Manager when ANARA_TOKEN_SECRET is set, so a
  restart starts from the latest pair and not from the (spent) one in the deployment setting.

ANARA_TOKEN_SECRET is the secret's full name, projects/<project id>/secrets/<name>. The service's
account needs the roles Secret Manager Secret Accessor and Secret Manager Secret Version Adder on it.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
from typing import Any

import requests

logger = logging.getLogger(__name__)

TOKEN_URL = os.getenv("ANARA_TOKEN_URL", "https://anara.com/api/better-auth/oauth2/token")
# an access token lasts 24 hours; renewing in the last 7 hours means a check every 6 hours always catches it
RENEW_WITHIN_SECONDS = 7 * 3600
_METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
_REQUEST_SECONDS = 20
lock = threading.Lock()


def seconds_left(data: dict[str, Any], saved_fallback: float | None = None) -> float | None:
    """Seconds before the saved access token runs out, or None when there is no token to judge."""
    tokens = data.get("tokens") or {}
    saved_at = data.get("saved_at") or saved_fallback
    if not tokens.get("expires_in") or not saved_at:
        return None
    return tokens["expires_in"] - (time.time() - saved_at)


def can_renew(data: dict[str, Any]) -> bool:
    return bool((data.get("tokens") or {}).get("refresh_token") and (data.get("client_info") or {}).get("client_id"))


def renew(data: dict[str, Any]) -> dict[str, Any] | None:
    """The sign-in data with a fresh token pair, or None when Anara does not accept the refresh token."""
    if not can_renew(data):
        return None
    form = {
        "grant_type": "refresh_token",
        "refresh_token": data["tokens"]["refresh_token"],
        "client_id": data["client_info"]["client_id"],
    }
    secret = data["client_info"].get("client_secret")
    if secret:
        form["client_secret"] = secret
    try:
        response = requests.post(TOKEN_URL, data=form, timeout=_REQUEST_SECONDS)
    except requests.RequestException as error:
        logger.warning("Anara sign-in renewal could not reach Anara: %s", error)
        return None
    if not response.ok:
        try:
            reason = response.json().get("error")
        except ValueError:
            reason = None
        logger.warning("Anara refused to renew the sign-in (%s %s): sign in again", response.status_code, reason)
        return None
    renewed = dict(data)
    renewed["tokens"] = {**data["tokens"], **response.json()}
    renewed["saved_at"] = time.time()
    logger.info("The Anara sign-in was renewed")
    return renewed


def remote_name() -> str | None:
    name = os.getenv("ANARA_TOKEN_SECRET", "").strip()
    return name if name.startswith("projects/") else None  # the deployment's "none" placeholder means unset


def _remote_headers() -> dict[str, str] | None:
    try:
        response = requests.get(_METADATA_TOKEN_URL, headers={"Metadata-Flavor": "Google"}, timeout=5)
        response.raise_for_status()
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    except (requests.RequestException, KeyError, ValueError):
        return None  # not on Google Cloud, or the account is not allowed


def remote_load() -> dict[str, Any] | None:
    """The latest sign-in kept in Secret Manager, or None."""
    name = remote_name()
    headers = _remote_headers() if name else None
    if not headers:
        return None
    try:
        response = requests.get(
            f"https://secretmanager.googleapis.com/v1/{name}/versions/latest:access", headers=headers, timeout=_REQUEST_SECONDS
        )
        response.raise_for_status()
        return json.loads(base64.b64decode(response.json()["payload"]["data"]).decode("utf-8"))
    except (requests.RequestException, KeyError, ValueError) as error:
        logger.warning("could not read the Anara sign-in from Secret Manager: %s", error)
        return None


def remote_save(data: dict[str, Any]) -> bool:
    """Keep this sign-in as the newest version of the secret. Failing is not fatal: the file still has it."""
    name = remote_name()
    headers = _remote_headers() if name else None
    if not headers:
        return False
    try:
        payload = base64.b64encode(json.dumps(data).encode("utf-8")).decode("ascii")
        response = requests.post(
            f"https://secretmanager.googleapis.com/v1/{name}:addVersion",
            headers=headers, json={"payload": {"data": payload}}, timeout=_REQUEST_SECONDS,
        )
        response.raise_for_status()
        return True
    except requests.RequestException as error:
        logger.warning("could not keep the renewed Anara sign-in in Secret Manager: %s", error)
        return False
