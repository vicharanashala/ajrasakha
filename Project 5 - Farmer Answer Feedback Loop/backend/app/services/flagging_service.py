"""
Flagging Service — auto-detects GDB entries below helpfulness threshold
and adds them to the reviewer pipeline.
"""
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.config import settings
import logging

logger = logging.getLogger(__name__)


async def check_and_flag_entry(db: AsyncIOMotorDatabase, gdb_entry_id: str):
    """
    Called after every new feedback record is captured.
    Checks if this GDB entry crosses the flagging threshold.
    """
    entry = await db.gdb_entries.find_one({"_id": gdb_entry_id})
    if not entry:
        return

    total = entry.get("total_responses", 0)
    score = entry.get("helpfulness_score", 100.0)

    if total >= settings.min_responses_to_flag and score < settings.feedback_threshold:
        await _create_flag(db, entry)


async def _create_flag(db: AsyncIOMotorDatabase, entry: dict):
    """Creates or updates the flagged_entries record for a GDB entry."""
    gdb_entry_id = entry["_id"]
    now = datetime.now(timezone.utc)

    # Check if already flagged
    existing = await db.flagged_entries.find_one({"gdb_entry_id": gdb_entry_id})

    helpful = entry.get("helpful_count", 0)
    not_helpful = entry.get("not_helpful_count", 0)
    total = entry.get("total_responses", 0)
    score = entry.get("helpfulness_score", 0.0)
    priority = total * (100.0 - score)  # Higher priority = more responses + lower score

    if existing:
        # Update existing flag with latest stats
        if existing.get("status") == "resolved":
            # Re-open if quality dropped again
            await db.flagged_entries.update_one(
                {"gdb_entry_id": gdb_entry_id},
                {"$set": {
                    "total_responses": total,
                    "helpful_count": helpful,
                    "not_helpful_count": not_helpful,
                    "helpfulness_score": score,
                    "priority_score": priority,
                    "status": "flagged",
                    "flagged_at": now,
                    "last_feedback_at": now,
                }}
            )
            logger.info(f"Re-flagged GDB entry {gdb_entry_id} (score={score:.1f}%)")
        else:
            await db.flagged_entries.update_one(
                {"gdb_entry_id": gdb_entry_id},
                {"$set": {
                    "total_responses": total,
                    "helpful_count": helpful,
                    "not_helpful_count": not_helpful,
                    "helpfulness_score": score,
                    "priority_score": priority,
                    "last_feedback_at": now,
                }}
            )
    else:
        flag_doc = {
            "gdb_entry_id": gdb_entry_id,
            "domain": entry.get("domain"),
            "language": entry.get("language"),
            "total_responses": total,
            "helpful_count": helpful,
            "not_helpful_count": not_helpful,
            "helpfulness_score": score,
            "priority_score": priority,
            "status": "flagged",
            "flagged_at": now,
            "last_feedback_at": now,
            "review_notes": None,
        }
        await db.flagged_entries.insert_one(flag_doc)
        # Mark GDB entry as flagged
        await db.gdb_entries.update_one(
            {"_id": gdb_entry_id},
            {"$set": {"is_flagged": True}}
        )
        logger.info(
            f"Flagged GDB entry {gdb_entry_id} for re-review "
            f"(score={score:.1f}%, responses={total})"
        )


async def run_full_flagging_pipeline(db: AsyncIOMotorDatabase) -> dict:
    """
    Scans ALL GDB entries and flags any that cross the threshold.
    Returns a summary of what was flagged.
    """
    newly_flagged = []
    updated = []
    threshold = settings.feedback_threshold
    min_resp = settings.min_responses_to_flag

    cursor = db.gdb_entries.find(
        {
            "total_responses": {"$gte": min_resp},
            "helpfulness_score": {"$lt": threshold},
        }
    )

    async for entry in cursor:
        gdb_id = entry["_id"]
        existing = await db.flagged_entries.find_one({"gdb_entry_id": gdb_id})
        if not existing:
            await _create_flag(db, entry)
            newly_flagged.append(gdb_id)
        else:
            await _create_flag(db, entry)
            updated.append(gdb_id)

    return {
        "newly_flagged": len(newly_flagged),
        "updated": len(updated),
        "total_flagged": await db.flagged_entries.count_documents({"status": "flagged"}),
        "threshold": threshold,
        "min_responses": min_resp,
    }


async def update_gdb_helpfulness(db: AsyncIOMotorDatabase, gdb_entry_id: str):
    """
    Recomputes helpfulness_score, helpful_count, not_helpful_count
    for a GDB entry from the feedback collection.
    Called after every new feedback record.
    """
    pipeline = [
        {"$match": {"gdb_entry_id": gdb_entry_id}},
        {"$group": {
            "_id": "$gdb_entry_id",
            "total": {"$sum": 1},
            "helpful": {"$sum": {"$cond": [{"$eq": ["$response", "1"]}, 1, 0]}},
            "not_helpful": {"$sum": {"$cond": [{"$eq": ["$response", "2"]}, 1, 0]}},
        }}
    ]
    results = await db.feedback.aggregate(pipeline).to_list(1)
    if not results:
        return

    agg = results[0]
    total = agg["total"]
    helpful = agg["helpful"]
    not_helpful = agg["not_helpful"]
    score = round((helpful / total) * 100, 2) if total > 0 else 0.0

    await db.gdb_entries.update_one(
        {"_id": gdb_entry_id},
        {"$set": {
            "total_responses": total,
            "helpful_count": helpful,
            "not_helpful_count": not_helpful,
            "helpfulness_score": score,
        }}
    )
