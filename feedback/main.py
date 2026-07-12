from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import (
    FeedbackCreate, Feedback, DashboardResponse,
    DomainStats, LanguageStats, StateStats,
    FlaggedEntry, FlaggedResponse,
    DigestEntry, DigestResponse,
    QuestionSample
)
from database import (
    feedback_collection,
    questions_collection,
    answers_collection
)
from datetime import datetime
from bson import ObjectId
import uuid

app = FastAPI(title="Farmer Feedback API", version="0.4")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Health Check ---

@app.get("/")
async def root():
    return {"status": "Farmer Feedback API is running", "version": "0.4"}

# --- Sample Questions (for Test Panel dropdown) ---

@app.get("/questions/sample")
async def get_sample_questions():
    """
    Returns a handful of real question/answer pairs from the original DB.
    Used by the Test Panel to let testers pick real IDs instead of typing them.
    Only returns questions that have at least one approved final answer.
    """
    samples = []

    # Get approved final answers
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

    # If no approved final answers found, fall back to any answers
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

# --- Submit Feedback ---

@app.post("/feedback")
async def submit_feedback(data: FeedbackCreate):
    # Step 1: verify question exists in original DB
    try:
        question = await questions_collection.find_one(
            {"_id": ObjectId(data.question_id)}
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid question_id format")

    if not question:
        raise HTTPException(status_code=404, detail=f"Question {data.question_id} not found")

    # Step 2: verify answer exists in original DB
    try:
        answer = await answers_collection.find_one(
            {"_id": ObjectId(data.answer_id)}
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid answer_id format")

    if not answer:
        raise HTTPException(status_code=404, detail=f"Answer {data.answer_id} not found")

    # Step 3: pull state from question details
    details = question.get("details", {})
    state = details.get("state", "unknown")

    # Step 4: pull and normalise domain
    domain_raw = details.get("domain", "unknown")
    domain = domain_raw[0] if isinstance(domain_raw, list) else domain_raw

    # Step 5: build and store feedback document
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

    return {
        "message": "Feedback recorded",
        "id": feedback_doc["_id"],
        "domain": domain,
        "state": state
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

    def make_stats(group_field, model_class, label_field):
        return feedback_collection.aggregate([
            {"$group": {
                "_id": f"${group_field}",
                "total": {"$sum": 1},
                "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}}
            }},
            {"$sort": {"total": -1}}
        ])

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
        {"$sort": {"helpful": 1}}
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

    return FlaggedResponse(
        flagged_count=len(entries),
        threshold_used=threshold,
        min_responses_used=min_responses,
        entries=entries
    )

# --- Weekly Digest ---

@app.get("/feedback/digest")
async def get_digest(top_n: int = 20, min_responses: int = 3):
    all_entries = []
    below_threshold = 0

    async for doc in feedback_collection.aggregate([
        {"$group": {
            "_id": "$answer_id",
            "domain": {"$first": "$domain"},
            "language": {"$first": "$language"},
            "state": {"$first": "$state"},
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}}
        }},
        {"$match": {"total": {"$gte": min_responses}}},
        {"$sort": {"helpful": 1}}
    ]):
        t = doc["total"]
        h = doc["helpful"]
        rate = round(h / t * 100, 1) if t > 0 else 0.0
        if rate < 60.0:
            below_threshold += 1
        all_entries.append({
            "answer_id": doc["_id"],
            "domain": doc["domain"] or "unknown",
            "language": doc.get("language"),
            "state": doc["state"] or "unknown",
            "total_responses": t,
            "helpfulness_rate": rate
        })

    top_entries = all_entries[:top_n]
    digest_entries = [
        DigestEntry(rank=i + 1, **entry)
        for i, entry in enumerate(top_entries)
    ]

    return DigestResponse(
        generated_at=datetime.now(),
        total_entries_analysed=len(all_entries),
        entries_below_threshold=below_threshold,
        top_n=top_n,
        entries=digest_entries
    )
