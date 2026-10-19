"""
login.py
--------
Login is already covered by `ReviewerUser.on_start()`. This module exists
to expose `login_again` so roles can re-login mid-run (a 401 retry on its
own raises a flock of `AUTH_LOGIN_FAILED` assertions; this lets the
scenario file wire a periodic re-auth task to make the S5 budget robust
against long-lived sessions).

Login endpoint: `POST /api/auth/login` (AuthController.ts line ~224).
"""
from __future__ import annotations

from typing import Any


def login_again(client: Any) -> None:
    """Force a re-login. Cheap; useful as a probe task."""
    client._login()
