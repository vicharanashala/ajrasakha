from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import (
    FeedbackCreate, Feedback, DashboardResponse,
    DomainStats, LanguageStats, StateStats,
    FlaggedEntry, FlaggedResponse,
    DigestEntry, DigestResponse,
    QuestionSample,
    PendingFeedbackCreate, PendingFeedback,
    FeedbackCompleteRequest
)
from database import (
    feedback_collection,
    questions_collection,
    answers_collection,
    pending_feedback_collection
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from digest_email import send_digest_email
from datetime import datetime
from bson import ObjectId
from reviewer_integration import check_and_flag_if_needed, push_to_reviewer_queue
import uuid
import logging
import pytz

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

app = FastAPI(title="Farmer Feedback API", version="1.3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# English-only feedback prompt
FEEDBACK_PROMPT_EN = "Was this helpful? Reply 1 for Yes, 2 for No"

# --- Shared lookup helper ---

async def _lookup_and_enrich(question_id: str, answer_id: str):
    """
    Looks up question and answer in the original DB.
    Returns (domain, state) derived from the question.
    Raises HTTPException if either ID is invalid or not found.
    Used by POST /feedback, POST /pending-feedback, POST /feedback/complete.
    """
    try:
        question = await questions_collection.find_one(
            {"_id": ObjectId(question_id)}
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid question_id format")
    if not question:
        raise HTTPException(status_code=404, detail=f"Question {question_id} not found")

    try:
        answer = await answers_collection.find_one(
            {"_id": ObjectId(answer_id)}
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid answer_id format")
    if not answer:
        raise HTTPException(status_code=404, detail=f"Answer {answer_id} not found")

    details = question.get("details", {})
    state = details.get("state", "unknown")
    domain_raw = details.get("domain", "unknown")
    domain = domain_raw[0] if isinstance(domain_raw, list) else domain_raw

    return domain, state


# --- Shared digest logic ---

async def _get_digest_entries(min_responses: int = 3, top_n: int = 20):
    """
    Shared logic for the scheduled job, manual trigger, and GET /feedback/digest.

    Fixes two bugs from the original implementation:
    1. Sort bug — was sorting by raw helpful count (wrong). Now sorts by
       helpfulness_rate in Python after computing it, which is the correct field.
    2. Threshold inconsistency — scheduled job and manual trigger used different
       min_responses values (3 vs 1). Both now use the same default of 3.

    Rank is assigned after sorting so rank 1 = worst performing entry.
    """
    all_entries = []
    below_threshold = 0

    async for doc in feedback_collection.aggregate([
        {"$group": {
            "_id": "$answer_id",
            "domain": {"$first": "$domain"},
            "state": {"$first": "$state"},
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}}
        }},
        {"$match": {"total": {"$gte": min_responses}}},
    ]):
        t = doc["total"]
        h = doc["helpful"]
        rate = round(h / t * 100, 1) if t > 0 else 0.0
        if rate < 60.0:
            below_threshold += 1
        all_entries.append({
            "answer_id": doc["_id"],
            "domain": doc["domain"] or "unknown",
            "state": doc["state"] or "unknown",
            "total_responses": t,
            "helpfulness_rate": rate,
        })

    # Sort by rate ascending (worst first) — done in Python after rate exists
    all_entries.sort(key=lambda e: e["helpfulness_rate"])

    # Assign rank AFTER sorting
    top_entries = all_entries[:top_n]
    for i, entry in enumerate(top_entries):
        entry["rank"] = i + 1

    return top_entries, len(all_entries), below_threshold


# --- Health Check ---

@app.get("/")
async def root():
    return {"status": "Farmer Feedback API is running", "version": "1.3"}


# --- Sample Questions (for Test Panel dropdown) ---

@app.get("/questions/sample")
async def get_sample_questions():
    samples = []

    cursor = answers_collection.find(
        {"isFinalAnswer": True, "status": "approved"},
        {"_id": 1, "questionId": 1}
    ).limit(10)

    async for answer in cursor:
        question = await questions_collection.find_one(
            {"_id": answer["questionId"]},
            {"_id": 1, "question": 1, "details": 1}
        )
        if not question:
            continue
        details = question.get("details", {})
        domain_raw = details.get("domain", "unknown")
        domain = domain_raw[0] if isinstance(domain_raw, list) else domain_raw
        samples.append(QuestionSample(
            question_id=str(question["_id"]),
            answer_id=str(answer["_id"]),
            question_text=question.get("question", "")[:100],
            domain=domain,
            state=details.get("state", "unknown")
        ))

    if not samples:
        cursor = answers_collection.find({}, {"_id": 1, "questionId": 1}).limit(5)
        async for answer in cursor:
            question = await questions_collection.find_one(
                {"_id": answer["questionId"]},
                {"_id": 1, "question": 1, "details": 1}
            )
            if not question:
                continue
            details = question.get("details", {})
            domain_raw = details.get("domain", "unknown")
            domain = domain_raw[0] if isinstance(domain_raw, list) else domain_raw
            samples.append(QuestionSample(
                question_id=str(question["_id"]),
                answer_id=str(answer["_id"]),
                question_text=question.get("question", "")[:100],
                domain=domain,
                state=details.get("state", "unknown")
            ))

    return {"samples": samples}


# --- Pending Feedback ---

@app.post("/pending-feedback")
async def create_pending_feedback(data: PendingFeedbackCreate):
    """
    Called by whichever service just delivered an answer to a farmer via WhatsApp
    (either the AI/GDB-match path or the expert-answered path).

    Registers that we are now waiting on this farmer's 1/2 reply.
    Returns the exact follow-up message text that service should send next.

    Upserts by phone number — a new answer supersedes any old unanswered
    pending request for the same farmer, avoiding stale/ambiguous state.
    """
    await _lookup_and_enrich(data.question_id, data.answer_id)

    pending = {
        "_id": str(uuid.uuid4()),
        "farmer_phone": data.farmer_phone,
        "question_id": data.question_id,
        "answer_id": data.answer_id,
        "message_text": FEEDBACK_PROMPT_EN,
        "created_at": datetime.now()
    }

    # Upsert: delete any existing pending for this farmer then insert fresh
    await pending_feedback_collection.delete_many(
        {"farmer_phone": data.farmer_phone}
    )
    await pending_feedback_collection.insert_one(pending)

    return {
        "pending_id": pending["_id"],
        "message_text": pending["message_text"]
    }


@app.get("/pending-feedback/all")
async def get_all_pending():
    """Returns all currently pending feedback requests. Useful for debugging."""
    pending = []
    async for doc in pending_feedback_collection.find():
        doc["id"] = doc.pop("_id")
        pending.append(doc)
    return {"count": len(pending), "pending": pending}


# --- Complete Feedback (farmer replies 1 or 2) ---

@app.post("/feedback/complete")
async def complete_feedback(data: FeedbackCompleteRequest):
    """
    Called when an inbound WhatsApp message from a farmer is just '1' or '2'
    and a pending feedback request exists for their phone number.

    Looks up the pending entry, enriches it with domain/state from the
    original DB, stores a real feedback record, then clears the pending entry.
    """
    pending = await pending_feedback_collection.find_one(
        {"farmer_phone": data.farmer_phone}
    )
    if not pending:
        raise HTTPException(
            status_code=404,
            detail=f"No pending feedback found for {data.farmer_phone}. "
                   f"The farmer must receive an answer first before rating it."
        )

    domain, state = await _lookup_and_enrich(
        pending["question_id"],
        pending["answer_id"]
    )

    feedback_doc = {
        "_id": str(uuid.uuid4()),
        "farmer_phone": data.farmer_phone,
        "question_id": pending["question_id"],
        "answer_id": pending["answer_id"],
        "domain": domain,
        "state": state,
        "language": "english",
        "response": data.response.value,
        "created_at": datetime.now()
    }

    await feedback_collection.insert_one(feedback_doc)
    await pending_feedback_collection.delete_one({"_id": pending["_id"]})

    # Auto-check if this answer has crossed the flagging threshold
    flag_result = await check_and_flag_if_needed(
        feedback_collection=feedback_collection,
        question_id=pending["question_id"],
        answer_id=pending["answer_id"],
        domain=domain,
    )

    return {
        "message": "Feedback recorded",
        "id": feedback_doc["_id"],
        "domain": domain,
        "state": state,
        "auto_flagged": flag_result is not None,
        "flag_result": flag_result.get("message") if flag_result else None
    }


# --- Submit Feedback (direct, for Test Panel one-shot mode) ---

@app.post("/feedback")
async def submit_feedback(data: FeedbackCreate):
    domain, state = await _lookup_and_enrich(data.question_id, data.answer_id)

    feedback_doc = {
        "_id": str(uuid.uuid4()),
        "farmer_phone": data.farmer_phone,
        "question_id": data.question_id,
        "answer_id": data.answer_id,
        "domain": domain,
        "state": state,
        "language": data.language,
        "response": data.response.value,
        "created_at": datetime.now()
    }

    await feedback_collection.insert_one(feedback_doc)

    # Auto-check if this answer has crossed the flagging threshold
    flag_result = await check_and_flag_if_needed(
        feedback_collection=feedback_collection,
        question_id=data.question_id,
        answer_id=data.answer_id,
        domain=domain,
    )

    return {
        "message": "Feedback recorded",
        "id": feedback_doc["_id"],
        "domain": domain,
        "state": state,
        "auto_flagged": flag_result is not None,
        "flag_result": flag_result.get("message") if flag_result else None
    }


# --- Get All Feedback ---

@app.get("/feedback/all")
async def get_all_feedback():
    feedbacks = []
    async for doc in feedback_collection.find():
        doc["id"] = doc.pop("_id")
        feedbacks.append(doc)
    return feedbacks


# --- Feedback Count ---

@app.get("/feedback/count")
async def get_feedback_count():
    total = await feedback_collection.count_documents({})
    return {"total": total}


# --- Dashboard ---

@app.get("/feedback/dashboard")
async def get_dashboard():
    total = await feedback_collection.count_documents({})

    if total == 0:
        return DashboardResponse(
            total_responses=0,
            overall_helpful=0,
            overall_not_helpful=0,
            overall_helpfulness_rate=0.0,
            by_domain=[],
            by_language=[],
            by_state=[]
        )

    helpful = await feedback_collection.count_documents({"response": "1"})
    not_helpful = total - helpful
    overall_rate = round(helpful / total * 100, 1)

    async def build_stats(group_field):
        results = []
        async for doc in feedback_collection.aggregate([
            {"$group": {
                "_id": f"${group_field}",
                "total": {"$sum": 1},
                "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}}
            }},
            {"$sort": {"total": -1}}
        ]):
            t = doc["total"]
            h = doc["helpful"]
            results.append({
                "label": doc["_id"] or "unknown",
                "total": t,
                "helpful": h,
                "not_helpful": t - h,
                "helpfulness_rate": round(h / t * 100, 1) if t > 0 else 0.0
            })
        return results

    domain_stats_raw = await build_stats("domain")
    language_stats_raw = await build_stats("language")
    state_stats_raw = await build_stats("state")

    by_domain = [DomainStats(domain=s["label"], **{k: v for k, v in s.items() if k != "label"}) for s in domain_stats_raw]
    by_language = [LanguageStats(language=s["label"], **{k: v for k, v in s.items() if k != "label"}) for s in language_stats_raw]
    by_state = [StateStats(state=s["label"], **{k: v for k, v in s.items() if k != "label"}) for s in state_stats_raw]

    return DashboardResponse(
        total_responses=total,
        overall_helpful=helpful,
        overall_not_helpful=not_helpful,
        overall_helpfulness_rate=overall_rate,
        by_domain=by_domain,
        by_language=by_language,
        by_state=by_state
    )


# --- Flagged Entries ---

@app.get("/feedback/flagged")
async def get_flagged(threshold: float = 60.0, min_responses: int = 10):
    entries = []
    async for doc in feedback_collection.aggregate([
        {"$group": {
            "_id": "$answer_id",
            "domain": {"$first": "$domain"},
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}}
        }},
        {"$match": {"total": {"$gte": min_responses}}},
    ]):
        t = doc["total"]
        h = doc["helpful"]
        rate = round(h / t * 100, 1) if t > 0 else 0.0
        if rate < threshold:
            entries.append(FlaggedEntry(
                answer_id=doc["_id"],
                domain=doc["domain"] or "unknown",
                total_responses=t,
                helpfulness_rate=rate,
                reason=f"Below {threshold}% helpfulness threshold"
            ))

    # Sort worst first in Python (same fix as digest)
    entries.sort(key=lambda e: e.helpfulness_rate)

    return FlaggedResponse(
        flagged_count=len(entries),
        threshold_used=threshold,
        min_responses_used=min_responses,
        entries=entries
    )

# --- Manual reviewer push (V1.2) ---

@app.post("/flagged/push-to-reviewer")
async def push_flagged_to_reviewer(answer_id: str, question_id: str):
    """
    Manually push a specific flagged answer to the reviewer queue.
    Useful for testing the integration before WhatsApp is wired up,
    or for re-pushing an entry that was missed.
    """
    # Look up current stats for this answer
    total = await feedback_collection.count_documents({"answer_id": answer_id})
    if total == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No feedback found for answer_id {answer_id}"
        )

    helpful = await feedback_collection.count_documents(
        {"answer_id": answer_id, "response": "1"}
    )
    rate = round(helpful / total * 100, 1)

    # Get domain from stored feedback
    sample = await feedback_collection.find_one({"answer_id": answer_id})
    domain = sample.get("domain", "unknown") if sample else "unknown"

    result = await push_to_reviewer_queue(
        question_id=question_id,
        answer_id=answer_id,
        helpfulness_rate=rate,
        total_responses=total,
        domain=domain,
    )

    return {
        "answer_id": answer_id,
        "question_id": question_id,
        "helpfulness_rate": rate,
        "total_responses": total,
        "domain": domain,
        **result
    }

# --- Weekly Digest (GET endpoint) ---

@app.get("/feedback/digest")
async def get_digest(top_n: int = 20, min_responses: int = 3):
    entries, total_analysed, below_threshold = await _get_digest_entries(
        min_responses=min_responses,
        top_n=top_n
    )
    return DigestResponse(
        generated_at=datetime.now(),
        total_entries_analysed=total_analysed,
        entries_below_threshold=below_threshold,
        top_n=top_n,
        entries=[DigestEntry(**e) for e in entries]
    )


# --- Scheduled weekly digest job ---

async def run_weekly_digest():
    """Runs every Monday at 9:00 AM IST via APScheduler."""
    logger.info("Running weekly digest job...")
    try:
        entries, total_analysed, below_threshold = await _get_digest_entries(
            min_responses=3,
            top_n=20
        )
        send_digest_email(
            entries=entries,
            total_analysed=total_analysed,
            below_threshold=below_threshold
        )
        logger.info("Weekly digest email sent successfully")
    except Exception as e:
        logger.error(f"Failed to send weekly digest: {e}")


@app.on_event("startup")
async def startup_event():
    IST = pytz.timezone("Asia/Kolkata")
    scheduler.add_job(
        run_weekly_digest,
        CronTrigger(day_of_week="sat", hour=9, minute=0, timezone="Asia/Kolkata"),  # Saturday 18:20 UTC = Monday 9:50 IST
        id="weekly_digest",
        replace_existing=True
    )
    scheduler.start()
    logger.info("Scheduler started — weekly digest runs every Monday 9:00 AM IST")


@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()


# --- Manual digest trigger ---

@app.post("/digest/send")
async def send_digest_now():
    """
    Manually trigger the weekly digest email.
    Uses identical logic and thresholds as the scheduled Monday job.
    What you see here is exactly what Monday's email will contain.
    """
    entries, total_analysed, below_threshold = await _get_digest_entries(
        min_responses=3,
        top_n=20
    )
    try:
        result = send_digest_email(
            entries=entries,
            total_analysed=total_analysed,
            below_threshold=below_threshold
        )
        return {"message": "Digest email sent successfully", **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")