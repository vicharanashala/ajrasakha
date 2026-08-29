"""
Analytics routes — aggregated helpfulness metrics across multiple dimensions.
"""
from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from datetime import datetime, timezone, timedelta
from typing import Optional

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/overview")
async def get_overview(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Overall KPIs: total feedback, helpfulness %, flagged count, trend."""
    pipeline = [
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }}
    ]
    result = await db.feedback.aggregate(pipeline).to_list(1)
    
    total_flagged = await db.flagged_entries.count_documents({"status": "flagged"})
    total_gdb = await db.gdb_entries.count_documents({})

    if result:
        agg = result[0]
        total = agg["total"]
        helpful = agg["helpful"]
        not_helpful = agg["not_helpful"]
        score = round((helpful / total) * 100, 2) if total > 0 else 0.0
    else:
        total = helpful = not_helpful = 0
        score = 0.0

    # Last 7 days trend
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_pipeline = [
        {"$match": {"timestamp": {"$gte": seven_days_ago}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
        }}
    ]
    recent = await db.feedback.aggregate(recent_pipeline).to_list(1)
    recent_score = 0.0
    if recent and recent[0]["total"] > 0:
        recent_score = round((recent[0]["helpful"] / recent[0]["total"]) * 100, 2)

    return {
        "total_feedback": total,
        "helpful_count": helpful,
        "not_helpful_count": not_helpful,
        "overall_helpfulness_score": score,
        "total_gdb_entries": total_gdb,
        "total_flagged": total_flagged,
        "last_7_days_score": recent_score,
        "last_7_days_total": recent[0]["total"] if recent else 0,
    }


@router.get("/gdb-entries")
async def get_gdb_entries(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    domain: Optional[str] = None,
    language: Optional[str] = None,
    state: Optional[str] = None,
    is_flagged: Optional[bool] = None,
    sort_by: str = Query("helpfulness_score", regex="^(helpfulness_score|total_responses|not_helpful_count)$"),
    sort_order: int = Query(-1, ge=-1, le=1),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Per-entry helpfulness table with filters and pagination."""
    query = {}
    if domain:
        query["domain"] = domain
    if language:
        query["language"] = language
    if state:
        query["state"] = state
    if is_flagged is not None:
        query["is_flagged"] = is_flagged

    skip = (page - 1) * limit
    total = await db.gdb_entries.count_documents(query)
    
    cursor = db.gdb_entries.find(query).sort(sort_by, sort_order).skip(skip).limit(limit)
    entries = await cursor.to_list(limit)

    # Serialize _id
    for e in entries:
        e["id"] = e.pop("_id", None)

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "data": entries,
    }


@router.get("/domain")
async def get_domain_breakdown(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Helpfulness score broken down by agricultural domain."""
    pipeline = [
        {"$group": {
            "_id": "$domain",
            "total_responses": {"$sum": 1},
            "helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }},
        {"$project": {
            "name": "$_id",
            "total_responses": 1,
            "helpful_count": 1,
            "not_helpful_count": 1,
            "helpfulness_score": {
                "$round": [
                    {"$multiply": [
                        {"$divide": ["$helpful_count", {"$max": ["$total_responses", 1]}]},
                        100
                    ]},
                    2
                ]
            }
        }},
        {"$sort": {"helpfulness_score": 1}},
    ]
    results = await db.feedback.aggregate(pipeline).to_list(100)
    for r in results:
        r.pop("_id", None)
    return results


@router.get("/language")
async def get_language_breakdown(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Helpfulness score broken down by farmer language."""
    pipeline = [
        {"$group": {
            "_id": "$language",
            "total_responses": {"$sum": 1},
            "helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }},
        {"$project": {
            "name": "$_id",
            "total_responses": 1,
            "helpful_count": 1,
            "not_helpful_count": 1,
            "helpfulness_score": {
                "$round": [
                    {"$multiply": [
                        {"$divide": ["$helpful_count", {"$max": ["$total_responses", 1]}]},
                        100
                    ]},
                    2
                ]
            }
        }},
        {"$sort": {"total_responses": -1}},
    ]
    results = await db.feedback.aggregate(pipeline).to_list(100)
    for r in results:
        r.pop("_id", None)
    return results


@router.get("/state")
async def get_state_breakdown(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Helpfulness score broken down by Indian state."""
    pipeline = [
        {"$group": {
            "_id": "$state",
            "total_responses": {"$sum": 1},
            "helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful_count": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }},
        {"$project": {
            "name": "$_id",
            "total_responses": 1,
            "helpful_count": 1,
            "not_helpful_count": 1,
            "helpfulness_score": {
                "$round": [
                    {"$multiply": [
                        {"$divide": ["$helpful_count", {"$max": ["$total_responses", 1]}]},
                        100
                    ]},
                    2
                ]
            }
        }},
        {"$sort": {"total_responses": -1}},
    ]
    results = await db.feedback.aggregate(pipeline).to_list(50)
    for r in results:
        r.pop("_id", None)
    return results


@router.get("/trends")
async def get_trends(
    days: int = Query(30, ge=7, le=90),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Daily feedback trend over the last N days."""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"timestamp": {"$gte": start_date}}},
        {"$group": {
            "_id": {
                "year": {"$year": "$timestamp"},
                "month": {"$month": "$timestamp"},
                "day": {"$dayOfMonth": "$timestamp"},
            },
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}},
    ]
    results = await db.feedback.aggregate(pipeline).to_list(days + 5)
    
    formatted = []
    for r in results:
        d = r["_id"]
        total = r["total"]
        helpful = r["helpful"]
        score = round((helpful / total) * 100, 2) if total > 0 else 0.0
        formatted.append({
            "date": f"{d['year']}-{d['month']:02d}-{d['day']:02d}",
            "total": total,
            "helpful": helpful,
            "not_helpful": r["not_helpful"],
            "helpfulness_score": score,
        })
    return formatted


@router.get("/top-bottom")
async def get_top_bottom_entries(
    n: int = Query(5, ge=3, le=20),
    min_responses: int = Query(5, ge=1),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Returns top N and bottom N GDB entries by helpfulness score."""
    base_query = {"total_responses": {"$gte": min_responses}}

    top_cursor = db.gdb_entries.find(base_query).sort("helpfulness_score", -1).limit(n)
    bottom_cursor = db.gdb_entries.find(base_query).sort("helpfulness_score", 1).limit(n)

    top = await top_cursor.to_list(n)
    bottom = await bottom_cursor.to_list(n)

    def serialize(entries):
        result = []
        for e in entries:
            result.append({
                "id": e["_id"],
                "question": e.get("question", ""),
                "domain": e.get("domain", ""),
                "language": e.get("language", ""),
                "state": e.get("state", ""),
                "helpfulness_score": e.get("helpfulness_score", 0),
                "total_responses": e.get("total_responses", 0),
                "helpful_count": e.get("helpful_count", 0),
                "not_helpful_count": e.get("not_helpful_count", 0),
                "is_flagged": e.get("is_flagged", False),
            })
        return result

    return {
        "top_entries": serialize(top),
        "bottom_entries": serialize(bottom),
    }


@router.get("/filters")
async def get_filter_options(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Returns distinct values for domain, language, state — used to populate filter dropdowns."""
    domains = await db.gdb_entries.distinct("domain")
    languages = await db.gdb_entries.distinct("language")
    states = await db.gdb_entries.distinct("state")
    return {
        "domains": sorted([d for d in domains if d]),
        "languages": sorted([l for l in languages if l]),
        "states": sorted([s for s in states if s]),
    }
