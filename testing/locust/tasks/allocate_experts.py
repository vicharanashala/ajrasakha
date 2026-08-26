"""
allocate_experts.py
-------------------
Two paths:

* `allocate_experts` — POST /:questionId/allocate-experts (QuestionController
  line ~1620). Gate-keeper/moderator triggers allocation of a specific
  expert roster to a question.
* `bulk_pae_allocate` — POST /:questionId/bulk-pae-allocate. PAE experts
  allocate themselves to multiple questions at once (state/crop specialist).

We exercise the bulk path directly because it is the larger surface
(O(questions x experts)) and matches the Phase-1 roadmap's "PAE bloom at
sowing season" framing.
"""
from __future__ import annotations

from typing import Any, List

from users.reviewer import _get_db
from helpers.payloads import allocate_experts_body, bulk_pae_allocate_body


def _gather_experts(client: Any, count: int) -> List[str]:
    """Pull `count` expert user_ids from the pool (no in-memory cache —
    reads from Mongo on every call so we don't accidentally pin the same
    expert forever)."""
    ids: List[str] = []
    for _ in range(count):
        uid = client.sample_expert_id()
        if uid:
            ids.append(uid)
    return ids


def allocate_experts(client: Any) -> None:
    qid = client.sample_open_question()
    if qid is None:
        return
    experts = _gather_experts(client, 3)
    if not experts:
        return
    body = allocate_experts_body(experts)
    client._post_json(
        f"/api/questions/{qid}/allocate-experts",
        body,
        name="POST /:qid/allocate-experts",
    )


def bulk_pae_allocate(client: Any) -> None:
    qid = client.sample_open_question()
    if qid is None:
        return
    db = _get_db()
    pae_ids: List[str] = []
    if db is not None:
        docs = list(
            db["users"]
            .find({"role": "pae_expert", "firebaseUID": {"$regex": "^lt-pae-"}})
            .limit(2)
        )
        pae_ids = [str(d["_id"]) for d in docs]
    if not pae_ids:
        return
    body = bulk_pae_allocate_body([qid], pae_ids)
    client._post_json(
        f"/api/questions/{qid}/bulk-pae-allocate",
        body,
        name="POST /:qid/bulk-pae-allocate",
    )
