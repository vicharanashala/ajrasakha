"""
Digest routes — generate and retrieve AI-powered weekly digests.
"""
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.services.groq_service import generate_weekly_digest_analysis
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/digest", tags=["Weekly Digest"])


@router.get("/latest", summary="Get the latest weekly digest")
async def get_latest_digest(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Returns the most recently generated weekly digest."""
    digest = await db.weekly_digests.find_one({}, sort=[("created_at", -1)])
    if not digest:
        raise HTTPException(status_code=404, detail="No digest found. Run POST /digest/generate first.")
    digest["id"] = str(digest.pop("_id", ""))
    _serialize_dates(digest)
    return digest


@router.get("/history", summary="Get all past weekly digests")
async def get_digest_history(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Returns all generated weekly digests, newest first."""
    cursor = db.weekly_digests.find({}).sort("created_at", -1).limit(12)
    digests = await cursor.to_list(12)
    for d in digests:
        d["id"] = str(d.pop("_id", ""))
        _serialize_dates(d)
    return digests


@router.post("/generate", summary="Generate a new weekly digest with GROQ AI analysis")
async def generate_digest(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Aggregates the last 7 days of feedback data and calls GROQ to
    produce an AI-written analysis + recommendations.
    """
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)

    # Aggregate feedback for last 7 days
    pipeline = [
        {"$match": {"timestamp": {"$gte": week_start}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }}
    ]
    overview_result = await db.feedback.aggregate(pipeline).to_list(1)

    if overview_result:
        ov = overview_result[0]
        total = ov["total"]
        helpful = ov["helpful"]
        not_helpful = ov["not_helpful"]
        score = round((helpful / total) * 100, 2) if total > 0 else 0.0
    else:
        # Use all-time data if no recent data
        pipeline[0] = {"$match": {}}
        overview_result = await db.feedback.aggregate(pipeline).to_list(1)
        if overview_result:
            ov = overview_result[0]
            total, helpful, not_helpful = ov["total"], ov["helpful"], ov["not_helpful"]
            score = round((helpful / total) * 100, 2) if total > 0 else 0.0
        else:
            total = helpful = not_helpful = 0
            score = 0.0

    # Domain breakdown
    domain_pipeline = [
        {"$group": {
            "_id": "$domain",
            "total_responses": {"$sum": 1},
            "helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }},
        {"$project": {
            "name": "$_id",
            "total_responses": 1, "helpful_count": 1, "not_helpful_count": 1,
            "helpfulness_score": {
                "$round": [{"$multiply": [{"$divide": ["$helpful_count", {"$max": ["$total_responses", 1]}]}, 100]}, 2]
            }
        }},
        {"$sort": {"helpfulness_score": 1}},
    ]
    domain_breakdown = await db.feedback.aggregate(domain_pipeline).to_list(20)
    for d in domain_breakdown:
        d.pop("_id", None)

    # Language breakdown
    lang_pipeline = [
        {"$group": {
            "_id": "$language",
            "total_responses": {"$sum": 1},
            "helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }},
        {"$project": {
            "name": "$_id",
            "total_responses": 1, "helpful_count": 1, "not_helpful_count": 1,
            "helpfulness_score": {
                "$round": [{"$multiply": [{"$divide": ["$helpful_count", {"$max": ["$total_responses", 1]}]}, 100]}, 2]
            }
        }},
        {"$sort": {"total_responses": -1}},
    ]
    language_breakdown = await db.feedback.aggregate(lang_pipeline).to_list(20)
    for d in language_breakdown:
        d.pop("_id", None)

    # State breakdown
    state_pipeline = [
        {"$group": {
            "_id": "$state",
            "total_responses": {"$sum": 1},
            "helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }},
        {"$project": {
            "name": "$_id",
            "total_responses": 1, "helpful_count": 1, "not_helpful_count": 1,
            "helpfulness_score": {
                "$round": [{"$multiply": [{"$divide": ["$helpful_count", {"$max": ["$total_responses", 1]}]}, 100]}, 2]
            }
        }},
        {"$sort": {"total_responses": -1}},
    ]
    state_breakdown = await db.feedback.aggregate(state_pipeline).to_list(30)
    for d in state_breakdown:
        d.pop("_id", None)

    # Lowest rated entries (for digest)
    lowest_cursor = db.gdb_entries.find(
        {"total_responses": {"$gte": 5}},
    ).sort("helpfulness_score", 1).limit(10)
    lowest_raw = await lowest_cursor.to_list(10)
    lowest_rated = [
        {
            "gdb_entry_id": e["_id"],
            "domain": e.get("domain"),
            "total_responses": e.get("total_responses", 0),
            "helpfulness_score": e.get("helpfulness_score", 0),
            "question": e.get("question", ""),
        }
        for e in lowest_raw
    ]

    digest_data = {
        "week_start": week_start.isoformat(),
        "week_end": now.isoformat(),
        "total_feedback_count": total,
        "total_helpful": helpful,
        "total_not_helpful": not_helpful,
        "overall_helpfulness_score": score,
        "lowest_rated_entries": lowest_rated,
        "domain_breakdown": domain_breakdown,
        "language_breakdown": language_breakdown,
        "state_breakdown": state_breakdown,
    }

    # Generate GROQ analysis
    analysis, recommendations = await generate_weekly_digest_analysis(digest_data)

    digest_doc = {
        **digest_data,
        "groq_analysis": analysis,
        "groq_recommendations": recommendations,
        "created_at": now,
    }
    # Convert ISO strings back to datetime for storage
    digest_doc["week_start"] = week_start
    digest_doc["week_end"] = now

    result = await db.weekly_digests.insert_one(digest_doc)
    digest_doc["id"] = str(result.inserted_id)
    # Remove _id (ObjectId) to avoid serialization errors
    digest_doc.pop("_id", None)
    _serialize_dates(digest_doc)

    return {"message": "Weekly digest generated successfully", "digest": digest_doc}


def _serialize_dates(obj):
    """Recursively convert datetime objects to ISO strings for JSON serialization."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if hasattr(v, "isoformat"):
                obj[k] = v.isoformat()
            elif isinstance(v, (dict, list)):
                _serialize_dates(v)
    elif isinstance(obj, list):
        for item in obj:
            _serialize_dates(item)
