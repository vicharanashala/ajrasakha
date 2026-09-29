"""
moderator_approve.py
--------------------
Moderator-gate approval. The most contended writer in the system — it
holds a transactional reputation update for the expert whose answer is
being approved.

Endpoint: `POST /api/answers/moderator/approve` (AnswerController.ts line ~339).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from helpers import assertions as A
from helpers.payloads import moderator_approve_body
from users.reviewer import _get_db

log = logging.getLogger(__name__)


def _pick_pending_answer(client: Any) -> Optional[dict]:
    """Pick a question that has a non-closed submission (i.e. waiting on
    moderator). Without a dedicated `submissions` index we approximate by
    `status in ('in-review', 'auditor_review', 'pae_submitted')`."""
    db = _get_db()
    if db is None:
        return None
    doc = db["questions"].aggregate(
        [
            {"$match": {"status": {"$in": ["in-review", "auditor_review", "pae_submitted"]}}},
            {"$sample": {"size": 1}},
        ],
        allowDiskUse=True,
    ).next()
    return doc or None


def approve_answer(client: Any) -> None:
    q = _pick_pending_answer(client)
    if q is None:
        A.write_assertion("MOD_NO_PENDING")
        return
    qid = str(q["_id"])
    # The submission id is captured by the schema; we use a placeholder
    # when not present (the controller tolerates the missing field with
    # a 400 — that's fine, we record the response code, not the artefact).
    answer_id = None
    submissions = q.get("submissions") or []
    if submissions:
        answer_id = str(submissions[0].get("_id") or submissions[0].get("answerId") or "")
    body = moderator_approve_body(
        question_id=qid,
        answer_id=answer_id or "000000000000000000000000",
        approve=True,
        comment="loadtest approve",
    )
    client._post_json(
        "/api/answers/moderator/approve",
        body,
        name="POST /api/answers/moderator/approve",
    )
