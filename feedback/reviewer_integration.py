"""
Reviewer pipeline integration for the Farmer Feedback System.

When an answer's helpfulness rate drops below the flagging threshold
with enough responses, this module automatically creates a request in
the ACE reviewer system so a moderator can queue it for re-review.

V1.2 status:
- Flag logic: fully built and tested
- POST /requests call: built, stubbed with placeholder auth token
- Unblocked by: team providing a service account auth token

Integration contract (hand this to whoever owns the reviewer backend):

  POST {REVIEWER_BASE_URL}/api/requests
  Authorization: Bearer <service_account_token>
  Content-Type: application/json

  {
    "reason": "Farmer feedback: 45% helpful across 12 responses
               (answer_id: 6a4f6c0c...) — automatically flagged for re-review",
    "entityId": "<question_id>",
    "details": {
      "requestType": "others",
      "details": {
        "source": "farmer_feedback_system",
        "answer_id": "<answer_id>",
        "helpfulness_rate": 45.0,
        "total_responses": 12,
        "threshold_used": 60.0
      }
    }
  }
"""

import os
import logging
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

REVIEWER_BASE_URL = os.getenv("REVIEWER_BASE_URL", "")
REVIEWER_AUTH_TOKEN = os.getenv("REVIEWER_AUTH_TOKEN", "")
FLAGGING_THRESHOLD = float(os.getenv("FLAGGING_THRESHOLD", "60.0"))
MIN_RESPONSES_TO_FLAG = int(os.getenv("MIN_RESPONSES_TO_FLAG", "10"))


def _build_request_payload(
    question_id: str,
    answer_id: str,
    helpfulness_rate: float,
    total_responses: int,
    domain: str,
) -> dict:
    """Build the POST /requests payload for the reviewer backend."""
    return {
        "reason": (
            f"Farmer feedback: {helpfulness_rate}% helpful across "
            f"{total_responses} responses "
            f"(answer_id: {answer_id}, domain: {domain}) "
            f"— automatically flagged for re-review by the feedback system"
        ),
        "entityId": question_id,
        "details": {
            "requestType": "others",
            "details": {
                "source": "farmer_feedback_system",
                "answer_id": answer_id,
                "helpfulness_rate": helpfulness_rate,
                "total_responses": total_responses,
                "threshold_used": FLAGGING_THRESHOLD,
                "domain": domain,
            }
        }
    }


async def push_to_reviewer_queue(
    question_id: str,
    answer_id: str,
    helpfulness_rate: float,
    total_responses: int,
    domain: str,
) -> dict:
    """
    Creates a flag request in the ACE reviewer pipeline.

    Returns a result dict with keys:
      - success (bool)
      - message (str)
      - request_id (str | None) — the created request ID if successful
      - blocked (bool) — True if credentials are not yet configured
    """

    # Check if credentials are configured
    if not REVIEWER_BASE_URL or not REVIEWER_AUTH_TOKEN:
        logger.warning(
            "Reviewer integration not configured. "
            "Set REVIEWER_BASE_URL and REVIEWER_AUTH_TOKEN in .env "
            "to enable automatic pushing to reviewer queue."
        )
        return {
            "success": False,
            "blocked": True,
            "message": (
                "Reviewer integration pending credentials. "
                "Flag was recorded locally. "
                "Set REVIEWER_BASE_URL and REVIEWER_AUTH_TOKEN in .env to enable."
            ),
            "request_id": None,
            "payload": _build_request_payload(
                question_id, answer_id, helpfulness_rate,
                total_responses, domain
            )
        }

    payload = _build_request_payload(
        question_id, answer_id, helpfulness_rate, total_responses, domain
    )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{REVIEWER_BASE_URL}/api/requests",
                json=payload,
                headers={
                    "Authorization": f"Bearer {REVIEWER_AUTH_TOKEN}",
                    "Content-Type": "application/json",
                }
            )

        if response.status_code in (200, 201):
            data = response.json()
            request_id = data.get("_id") or data.get("id")
            logger.info(
                f"Successfully pushed to reviewer queue. "
                f"Request ID: {request_id}, "
                f"answer_id: {answer_id}, "
                f"rate: {helpfulness_rate}%"
            )
            return {
                "success": True,
                "blocked": False,
                "message": "Successfully pushed to reviewer queue",
                "request_id": request_id,
                "payload": payload
            }
        else:
            logger.error(
                f"Reviewer API returned {response.status_code}: {response.text}"
            )
            return {
                "success": False,
                "blocked": False,
                "message": f"Reviewer API error: {response.status_code} — {response.text}",
                "request_id": None,
                "payload": payload
            }

    except httpx.TimeoutException:
        logger.error("Reviewer API request timed out")
        return {
            "success": False,
            "blocked": False,
            "message": "Reviewer API request timed out",
            "request_id": None,
            "payload": payload
        }
    except Exception as e:
        logger.error(f"Failed to push to reviewer queue: {e}")
        return {
            "success": False,
            "blocked": False,
            "message": f"Unexpected error: {str(e)}",
            "request_id": None,
            "payload": payload
        }


async def check_and_flag_if_needed(
    feedback_collection,
    question_id: str,
    answer_id: str,
    domain: str,
) -> dict | None:
    """
    Called after every feedback submission.
    Checks if this answer has newly crossed below the flagging threshold.
    If yes, pushes to reviewer queue.

    Returns the flag result if flagging was triggered, None otherwise.
    """
    # Count responses for this specific answer
    total = await feedback_collection.count_documents(
        {"answer_id": answer_id}
    )

    # Not enough responses yet to flag
    if total < MIN_RESPONSES_TO_FLAG:
        return None

    helpful = await feedback_collection.count_documents(
        {"answer_id": answer_id, "response": "1"}
    )
    rate = round(helpful / total * 100, 1)

    # Above threshold — no flag needed
    if rate >= FLAGGING_THRESHOLD:
        return None

    # Check if we already pushed this answer to the reviewer queue
    # to avoid pushing the same answer repeatedly on every new response
    already_flagged = await feedback_collection.find_one(
        {"_flagged_answer_id": answer_id}
    )
    if already_flagged:
        logger.info(
            f"Answer {answer_id} already flagged previously — skipping duplicate push"
        )
        return None

    logger.info(
        f"Answer {answer_id} crossed flagging threshold: "
        f"{rate}% helpful across {total} responses. Pushing to reviewer queue."
    )

    result = await push_to_reviewer_queue(
        question_id=question_id,
        answer_id=answer_id,
        helpfulness_rate=rate,
        total_responses=total,
        domain=domain,
    )

    # Record that this answer has been flagged so we don't push it again
    if result["success"] or result["blocked"]:
        await feedback_collection.insert_one({
            "_flagged_answer_id": answer_id,
            "_flagged_at": __import__("datetime").datetime.now(),
            "_flag_result": result.get("message"),
            "_helpfulness_rate": rate,
            "_total_responses": total,
        })

    return result