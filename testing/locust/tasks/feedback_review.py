"""
feedback_review.py
------------------
Two flows:

* `expert_submit_feedback` — POST /:questionId/feedback-reviewer (writes a
  feedback entry, transitions the question to "feedback-waiting").
* `accept_feedback` — POST /:questionId/:feedbackId/feedback-action
  (moderator accepts/rejects/request_changes).

Endpoints:
* `QuestionController.feedbackReviewer` (line ~2402)
* `QuestionController.feedbackAction` (line ~3202)
"""
from __future__ import annotations

import random
from typing import Any

from helpers.payloads import (
    feedback_action_body,
    feedback_reviewer_body,
)


def expert_submit_feedback(client: Any) -> None:
    qid = client.sample_question_by_status("closed")
    if qid is None:
        qid = client.sample_open_question()
    if qid is None:
        return
    body = feedback_reviewer_body(
        feedback="Initial answer was correct but please mention the IPM rotation.",
        rating=random.choice([3, 4, 5]),
    )
    client._post_json(
        f"/api/questions/{qid}/feedback-reviewer",
        body,
        name="POST /:qid/feedback-reviewer",
    )


def accept_feedback(client: Any) -> None:
    sample = client.sample_feedback()
    if sample is None:
        return
    body = feedback_action_body(action="accept", comment="loadtest moderator sign-off")
    client._post_json(
        f"/api/questions/{sample['questionId']}/{sample['feedbackId']}/feedback-action",
        body,
        name="POST /:qid/:fid/feedback-action",
    )


def reject_feedback(client: Any) -> None:
    sample = client.sample_feedback()
    if sample is None:
        return
    body = feedback_action_body(action="reject", comment="loadtest moderator reject")
    client._post_json(
        f"/api/questions/{sample['questionId']}/{sample['feedbackId']}/feedback-action",
        body,
        name="POST /:qid/:fid/feedback-action",
    )
