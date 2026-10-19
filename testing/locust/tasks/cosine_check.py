"""
cosine_check.py
---------------
SLA S7 gate keeper. Drives the duplicate-check pipeline by calling
`/api/questions/check-duplicate` and asserts the cosine-similarity
wall-clock distribution.

The control flow:

* Gate-keeper users poll the question intake feed for "needs-duplicate-check"
  questions.
* For each, we fire a duplicate-check call (acting as the gate-keeper
  would) and time the response.
* The assertions listener picks up `response_time_ms` and pushes it into
  the bottom-quartile histogram that S7 cares about.

Note: the actual cosine call lives in `backend/src/utils/cosine-similarity.ts`
and is invoked server-side. The test harness only sees the request round-trip.
"""
from __future__ import annotations

from typing import Any, Optional

from users.reviewer import _get_db


def _pick_needs_duplicate(client: Any) -> Optional[str]:
    """Pick a question whose status is `open` and `isDuplicateChecked=false`."""
    db = _get_db()
    if db is None:
        return None
    doc = db["questions"].aggregate(
        [
            {"$match": {
                "status": "open",
                "isDuplicateChecked": {"$ne": True},
            }},
            {"$sample": {"size": 1}},
        ],
        allowDiskUse=True,
    ).next()
    return str(doc["_id"]) if doc else None


def gk_cosine_probe(client: Any) -> None:
    qid = _pick_needs_duplicate(client)
    if qid is None:
        return
    # The duplicate-check call surface is `POST /api/questions/check-duplicate`
    # (see QuestionController.checkDuplicate). If the schema doesn't match in
    # your build, the assertions listener will record the 4xx and the run
    # keeps going.
    client._post_json(
        "/api/questions/check-duplicate",
        {"questionId": qid},
        name="POST /api/questions/check-duplicate",
    )
