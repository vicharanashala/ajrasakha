"""
allocated.py
------------
POST /api/questions/allocated — "list questions allocated to the current
reviewer". Per-role variants differ only in the filter parameters.

Endpoint source: `backend/src/modules/question/controllers/QuestionController.ts`
  `@Post('/allocated')` (line ~210) and `@Post('/allocated/page')` (line ~193).
"""
from __future__ import annotations

from typing import Any, Dict

from helpers.payloads import allocated_body as _allocated_body


def _do(client: Any, name: str, body: Dict[str, Any]) -> None:
    client._post_json("/api/questions/allocated", body, name=name)


def expert_list(client: Any) -> None:
    """
    Expert: list questions in `in-review` for the current expert.
    """
    _do(
        client,
        "POST /api/questions/allocated (expert)",
        _allocated_body(page=1, limit=20, status_filter="in-review"),
    )


def moderator_list(client: Any) -> None:
    """
    Moderator: list everything allocated to me (no status filter; let the
    server filter by the calling user).
    """
    _do(
        client,
        "POST /api/questions/allocated (moderator)",
        _allocated_body(page=1, limit=30),
    )


def gate_keeper_list(client: Any) -> None:
    """Gate keeper: full queue, paginated."""
    _do(
        client,
        "POST /api/questions/allocated (gate_keeper)",
        _allocated_body(page=1, limit=50),
    )


def auditor_list(client: Any) -> None:
    """Auditor: full queue, paginated (read-only)."""
    _do(
        client,
        "POST /api/questions/allocated (auditor)",
        _allocated_body(page=1, limit=50),
    )


def admin_list(client: Any) -> None:
    """Admin: full queue, paginated, no filter."""
    _do(
        client,
        "POST /api/questions/allocated (admin)",
        _allocated_body(page=1, limit=100),
    )
