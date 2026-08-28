import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Query
from shared.mongodb import get_db

router = APIRouter()


@router.get("/overview")
def get_dashboard_overview():
    db = get_db()

    total = db.feedback.count_documents({})
    helpful = db.feedback.count_documents({"response": "1"})
    not_helpful = db.feedback.count_documents({"response": "2"})

    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)

    this_week = db.feedback.count_documents({"timestamp": {"$gte": week_ago}})
    this_week_helpful = db.feedback.count_documents({"timestamp": {"$gte": week_ago}, "response": "1"})

    flagged_count = db.flagged_entries.count_documents({"status": "flagged"})

    gdb_entries_with_feedback = len(db.feedback.distinct("gdb_entry_id"))

    return {
        "total_feedback": total,
        "helpful_count": helpful,
        "not_helpful_count": not_helpful,
        "helpfulness_score": round((helpful / total * 100), 2) if total > 0 else 0,
        "total_gdb_entries": gdb_entries_with_feedback,
        "flagged_entries_count": flagged_count,
        "this_week_feedback": this_week,
        "this_week_helpfulness": round((this_week_helpful / this_week * 100), 2) if this_week > 0 else 0
    }


@router.get("/entries")
def get_entries_with_stats(
    domain: Optional[str] = None,
    language: Optional[str] = None,
    state: Optional[str] = None,
    sort_by: str = "helpfulness_score",
    order: str = "asc",
    limit: int = 50,
    offset: int = 0,
    include_qa: bool = True
):
    """
    Get GDB entries with their feedback statistics AND question/answer.
    Now returns ALL entries (including AI-generated without feedback).
    """
    db = get_db()

    # First, get feedback aggregation per entry
    feedback_pipeline = [
        {"$group": {
            "_id": "$gdb_entry_id",
            "total_responses": {"$sum": 1},
            "helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
            "last_feedback_at": {"$max": "$timestamp"}
        }}
    ]
    feedback_stats = {f["_id"]: f for f in db.feedback.aggregate(feedback_pipeline)}

    # Now query all GDB entries (with optional filters)
    query = {}
    if domain:
        query["domain"] = domain
    if language:
        query["language"] = language
    if state:
        query["state"] = state

    sort_order = -1 if order == "desc" else 1
    gdb_entries = list(db.gdb_entries.find(query).sort("_id", sort_order).skip(offset).limit(limit))

    # Merge feedback stats with GDB entries
    result = []
    for entry in gdb_entries:
        stats = feedback_stats.get(entry["_id"], {})
        total_responses = stats.get("total_responses", 0)
        helpful_count = stats.get("helpful_count", 0)
        helpfulness_score = round((helpful_count / total_responses * 100), 2) if total_responses > 0 else 0

        result.append({
            "gdb_entry_id": entry["_id"],
            "question": entry.get("question", ""),
            "answer": entry.get("answer", "") if include_qa else "",
            "ai_answer": entry.get("ai_answer", ""),
            "domain": entry.get("domain"),
            "language": entry.get("language", "English"),
            "state": entry.get("state"),
            "status": entry.get("status"),  # approved, pending_review, etc.
            "source": entry.get("source", "original"),
            "keywords": entry.get("keywords", []),
            "total_responses": total_responses,
            "helpful_count": helpful_count,
            "not_helpful_count": stats.get("not_helpful_count", 0),
            "helpfulness_score": helpfulness_score,
            "last_feedback_at": stats.get("last_feedback_at"),
            "generated_at": entry.get("generated_at"),
            "review_requested_at": entry.get("review_requested_at"),
            "reviewed_at": entry.get("reviewed_at"),
            "reviewer": entry.get("reviewer")
        })

    # Sort by requested field
    if sort_by == "helpfulness_score":
        result.sort(key=lambda x: x["helpfulness_score"], reverse=(order == "desc"))
    elif sort_by == "total_responses":
        result.sort(key=lambda x: x["total_responses"], reverse=(order == "desc"))
    elif sort_by == "helpful_count":
        result.sort(key=lambda x: x["helpful_count"], reverse=(order == "desc"))

    return result


@router.get("/breakdown/domain")
def get_domain_breakdown():
    db = get_db()

    pipeline = [
        {"$match": {"domain": {"$ne": None}}},
        {"$group": {
            "_id": "$domain",
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}}
        }},
        {"$addFields": {
            "helpfulness_score": {"$multiply": [{"$divide": ["$helpful", "$total"]}, 100]}
        }},
        {"$sort": {"total": -1}}
    ]

    results = list(db.feedback.aggregate(pipeline))

    return [
        {
            "domain": r["_id"],
            "total_responses": r["total"],
            "helpful_count": r["helpful"],
            "not_helpful_count": r["not_helpful"],
            "helpfulness_score": round(r["helpfulness_score"], 2)
        }
        for r in results
    ]


@router.get("/breakdown/language")
def get_language_breakdown():
    db = get_db()

    pipeline = [
        {"$match": {"language": {"$ne": None}}},
        {"$group": {
            "_id": "$language",
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}}
        }},
        {"$addFields": {
            "helpfulness_score": {"$multiply": [{"$divide": ["$helpful", "$total"]}, 100]}
        }},
        {"$sort": {"total": -1}}
    ]

    results = list(db.feedback.aggregate(pipeline))

    return [
        {
            "language": r["_id"],
            "total_responses": r["total"],
            "helpful_count": r["helpful"],
            "not_helpful_count": r["not_helpful"],
            "helpfulness_score": round(r["helpfulness_score"], 2)
        }
        for r in results
    ]


@router.get("/breakdown/state")
def get_state_breakdown():
    db = get_db()

    pipeline = [
        {"$match": {"state": {"$ne": None}}},
        {"$group": {
            "_id": "$state",
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}}
        }},
        {"$addFields": {
            "helpfulness_score": {"$multiply": [{"$divide": ["$helpful", "$total"]}, 100]}
        }},
        {"$sort": {"total": -1}}
    ]

    results = list(db.feedback.aggregate(pipeline))

    return [
        {
            "state": r["_id"],
            "total_responses": r["total"],
            "helpful_count": r["helpful"],
            "not_helpful_count": r["not_helpful"],
            "helpfulness_score": round(r["helpfulness_score"], 2)
        }
        for r in results
    ]