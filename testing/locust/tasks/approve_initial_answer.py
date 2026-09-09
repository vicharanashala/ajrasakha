"""
approve_initial_answer.py
-------------------------
Expert approves the AI-generated initial answer. Cheap write — directly
transitions a question to `closed` (or `auditor_review` on the new path).

Endpoint: `POST /api/questions/:questionId/approve-initial-answer`
  (QuestionController.ts line ~2772).
"""
from __future__ import annotations

from typing import Any

from helpers.payloads import approve_initial_answer_body


def expert_approve_initial(client: Any) -> None:
    qid = client.sample_question_by_status("pae_submitted")
    if qid is None:
        qid = client.sample_open_question()
    if qid is None:
        return
    body = approve_initial_answer_body(
        "Approved: apply the recommended neem oil at 5 ml/L every 7 days. "
        "Re-check after 14 days."
    )
    client._post_json(
        f"/api/questions/{qid}/approve-initial-answer",
        body,
        name="POST /:qid/approve-initial-answer",
    )
