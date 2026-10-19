"""
queue_details.py
----------------
GET /api/questions/queue-details — "the dashboard view" that gate-keepers,
moderators, auditors, and admins hit. The phase-1 smoke test validated this
is the lightweight read-only endpoint we can drive from any role.

Body returned by the controller carries a `data.received.count` shape that
the assertions listener uses for queue-length capture (bug-1195 harness).
"""
from __future__ import annotations

from typing import Any


def _do(client: Any, name: str) -> None:
    client._get_json("/api/questions/queue-details", name=name)


def mod_queue(client: Any) -> None:
    _do(client, "GET /api/questions/queue-details (moderator)")


def gk_queue(client: Any) -> None:
    _do(client, "GET /api/questions/queue-details (gate_keeper)")


def auditor_queue(client: Any) -> None:
    _do(client, "GET /api/questions/queue-details (auditor)")


def admin_queue(client: Any) -> None:
    _do(client, "GET /api/questions/queue-details (admin)")
