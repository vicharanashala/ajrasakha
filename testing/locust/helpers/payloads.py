"""
payloads.py
-----------
Body builders for the reviewer endpoints exercised by the Locust suite.
Each function returns a `dict` ready to be passed to `self.client.post(...)`.

These builders deliberately keep payloads *minimal and valid* — they are
stress-test bodies, not data-model authoring. The seed scripts already
provide realistic `state`/`crop`/`domain` values, so any payload we send
must at minimum point at a real Mongo `_id` or a valid enum value.

Endpoint schema sources:
* `backend/src/modules/question/classes/validators/QuestionValidators.ts`
* `backend/src/modules/answer/classes/validators/AnswerValidators.ts`
* `backend/src/modules/question/classes/validators/AllocateExpertsRequest`
"""
from __future__ import annotations

import random
import uuid
from typing import Any, Dict, List, Optional


# -----------------------------------------------------------------------------
# Auth & generic
# -----------------------------------------------------------------------------
def login_body(email: str, password: str = "Password123!") -> Dict[str, Any]:
    return {"email": email, "password": password}


# -----------------------------------------------------------------------------
# Question intake & listing
# -----------------------------------------------------------------------------
def add_question_body(
    text: str,
    state: str,
    crop: str,
    domain: str = "all",
) -> Dict[str, Any]:
    """POST /api/questions/add-question body."""
    return {
        "text": text,
        "state": state,
        "crops": [crop],
        "domain": domain,
        "priority": random.choice(["low", "medium", "high"]),
        "source": "AJRASAKHA",
        "language": "en",
        "autoAllocateModerator": True,
    }




# -----------------------------------------------------------------------------
# Allocation
# -----------------------------------------------------------------------------
def allocate_experts_body(
    expert_user_ids: List[str],
    *,
    auto_allocate: bool = True,
) -> Dict[str, Any]:
    """POST /:questionId/allocate-experts body."""
    return {
        "experts": expert_user_ids,
        "autoAllocate": auto_allocate,
        "reason": "loadtest",
    }


def bulk_pae_allocate_body(
    question_ids: List[str],
    pae_user_ids: List[str],
) -> Dict[str, Any]:
    """POST /:questionId/bulk-pae-allocate body."""
    return {
        "questions": question_ids,
        "paeExperts": pae_user_ids,
        "reason": "loadtest",
    }


def reallocate_manual_body(
    question_id: str,
    from_user_id: str,
    to_user_id: str,
) -> Dict[str, Any]:
    return {
        "questionId": question_id,
        "fromUserId": from_user_id,
        "toUserId": to_user_id,
        "reason": "loadtest",
    }


def reallocate_timebound_body(question_id: str) -> Dict[str, Any]:
    return {"questionId": question_id, "reason": "loadtest-timebound"}


def reroute_body(question_id: str, reason: str = "stall") -> Dict[str, Any]:
    return {"questionId": question_id, "reason": reason}


# -----------------------------------------------------------------------------
# Review / feedback
# -----------------------------------------------------------------------------
def submit_review_body(
    question_id: str,
    answer_text: str,
    status: str = "in-review",
    *,
    sources: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """POST /:questionId (review) — used by experts to submit a review."""
    return {
        "questionId": question_id,
        "text": answer_text,
        "status": status,
        "sources": sources or [
            {"name": "ICAR", "url": "https://icar.org.in/example"},
            {"name": "AgriDept", "url": "https://agri.in/example"},
        ],
    }


def feedback_reviewer_body(
    feedback: str,
    rating: int = 4,
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """POST /:questionId/feedback-reviewer body."""
    return {
        "feedback": feedback,
        "rating": rating,
        "tags": tags or ["accuracy", "language"],
    }


def feedback_action_body(action: str = "accept", comment: str = "") -> Dict[str, Any]:
    """POST /:questionId/:feedbackId/feedback-action body."""
    assert action in ("accept", "reject", "request_changes")
    return {"action": action, "comment": comment}


# -----------------------------------------------------------------------------
# Filter / report (bug #1195)
# -----------------------------------------------------------------------------
def download_filtered_report_body(
    status: str = "all-closed",
    all_users: Optional[str] = None,
    moderator: Optional[str] = None,  # legacy field, will be ignored post-fix
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    crops: Optional[List[str]] = None,
    states: Optional[List[str]] = None,
    duplicate_questions: Optional[str] = None,
) -> Dict[str, Any]:
    """
    POST /api/questions/download-filtered-report body.

    Replicates the PR #1195 fix: the controller now reads `allUsers` (not
    `moderator`). The legacy `moderator` field is kept here for backward
    compatibility probes (the bug-repro harness uses both).
    """
    body: Dict[str, Any] = {"status": status}
    if all_users is not None:
        body["allUsers"] = all_users
    if moderator is not None:
        body["moderator"] = moderator
    if start_date:
        body["startDate"] = start_date
    if end_date:
        body["endDate"] = end_date
    if crops:
        body["crops"] = crops
    if states:
        body["states"] = states
    if duplicate_questions:
        body["duplicateQuestions"] = duplicate_questions
    return body


# -----------------------------------------------------------------------------
# Synthetic answer text
# -----------------------------------------------------------------------------
_SYNTH_ANSWER_FRAGMENTS = [
    "Apply neem oil at 5 ml/L every 7 days; rotate with imidacloprid 0.3 ml/L "
    "every 14 days to avoid resistance.",
    "Sow in rows 20 cm apart, 3 cm deep; irrigate lightly twice a week through "
    "the first 30 days.",
    "For nutrient deficiency, top-dress with 20 kg N/ha at tillering and again "
    "20 days later.",
    "Use pheromone traps at 5 per acre for early pest detection; replace lures "
    "every 30 days.",
    "Burn visible egg masses; release Trichogramma egg parasitoids at 1.5 lakh/ha.",
    "Adopt ridge-and-furrow sowing for waterlogging-prone fields; ensure 30 cm "
    "ridge height.",
    "Test soil pH annually; apply lime if pH < 5.5 and gypsum if soil is sodic.",
]


def random_answer_text() -> str:
    return random.choice(_SYNTH_ANSWER_FRAGMENTS)


def random_uuid() -> str:
    return str(uuid.uuid4())



def approve_initial_answer_body(answer: str) -> Dict[str, Any]:
    """POST /:questionId/approve-initial-answer body."""
    return {"answer": answer, "approved": True}


# -----------------------------------------------------------------------------
# Moderator gate
# -----------------------------------------------------------------------------
def moderator_approve_body(
    question_id: str,
    answer_id: str,
    *,
    approve: bool = True,
    comment: str = "",
) -> Dict[str, Any]:
    """POST /api/answers/moderator/approve body."""
    return {
        "questionId": question_id,
        "answerId": answer_id,
        "approve": approve,
        "comment": comment,
    }

def allocated_body(
    page: int = 1,
    limit: int = 20,
    status_filter: Optional[str] = None,
    crop: Optional[str] = None,
    state: Optional[str] = None,
) -> Dict[str, Any]:
    """POST /api/questions/allocated body."""
    body: Dict[str, Any] = {"page": page, "limit": limit}
    if status_filter:
        body["status"] = status_filter
    if crop:
        body["crop"] = crop
    if state:
        body["state"] = state
    return body


def detailed_questions_body(
    page: int = 1,
    limit: int = 20,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    return {"page": page, "limit": limit, **({"status": status} if status else {})}
