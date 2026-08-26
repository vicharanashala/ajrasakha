"""
submit_review.py
----------------
Expert submits a review for an `in-review` question currently allocated to
them. Drives the heavy write path that touches `question_submissions`,
`reputation_score`, and (transitively) `notifications`.

Endpoint: `POST /api/answers/` (AnswerController.ts line ~52).
"""
from __future__ import annotations

from typing import Any, Optional

from helpers.payloads import random_answer_text, submit_review_body


def expert_submit(client: Any) -> None:
    qid = client.sample_allocated_question()
    if qid is None:
        # Fall back to any open question so the harness still fires.
        qid = client.sample_open_question()
    if qid is None:
        return
    body = submit_review_body(
        question_id=qid,
        answer_text=random_answer_text(),
        status="in-review",
    )
    client._post_json(
        f"/api/answers",
        body,
        name="POST /api/answers (expert submit)",
    )
