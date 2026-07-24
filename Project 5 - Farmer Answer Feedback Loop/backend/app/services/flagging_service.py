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
    Flags the entry immediately if score < threshold (no minimum responses gate).
    Also auto-resolves the flag if the score has risen back above threshold.
    """
    entry = await db.gdb_entries.find_one({"_id": gdb_entry_id})
    if not entry:
        return

    score = entry.get("helpfulness_score", 100.0)

    if score < settings.feedback_threshold:
        await _create_flag(db, entry)
    else:
        # Score is now healthy — auto-resolve any existing flag
        existing = await db.flagged_entries.find_one({"gdb_entry_id": gdb_entry_id})
        if existing and existing.get("status") != "resolved":
            await db.flagged_entries.update_one(
                {"gdb_entry_id": gdb_entry_id},
                {"$set": {
                    "status": "resolved",
                    "review_notes": f"Auto-resolved: score recovered to {score:.1f}%",
                    "resolved_at": datetime.now(timezone.utc),
                }}
            )
            await db.gdb_entries.update_one(
                {"_id": gdb_entry_id},
                {"$set": {"is_flagged": False}}
            )
            logger.info(f"Auto-resolved flag for {gdb_entry_id} (score recovered to {score:.1f}%)")


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
    Scans ALL GDB entries and flags any whose score is below threshold.
    No minimum-responses gate — any entry below threshold gets flagged.
    Also unflag entries that have recovered above threshold.
    Returns a summary of what was flagged.
    """
    threshold = settings.feedback_threshold

    # --- Flag everything below threshold ---
    newly_flagged = []
    updated = []

    async for entry in db.gdb_entries.find({"helpfulness_score": {"$lt": threshold}}):
        gdb_id = entry["_id"]
        existing = await db.flagged_entries.find_one({"gdb_entry_id": gdb_id})
        if not existing:
            newly_flagged.append(gdb_id)
        else:
            updated.append(gdb_id)
        await _create_flag(db, entry)
        # Always ensure DB field is in sync
        await db.gdb_entries.update_one(
            {"_id": gdb_id},
            {"$set": {"is_flagged": True}}
        )

    # --- Unflag everything that has recovered ---
    async for entry in db.gdb_entries.find({"helpfulness_score": {"$gte": threshold}, "is_flagged": True}):
        gdb_id = entry["_id"]
        await db.gdb_entries.update_one({"_id": gdb_id}, {"$set": {"is_flagged": False}})
        await db.flagged_entries.update_one(
            {"gdb_entry_id": gdb_id, "status": {"$ne": "resolved"}},
            {"$set": {"status": "resolved", "review_notes": "Auto-resolved by pipeline: score recovered"}}
        )

    return {
        "newly_flagged": len(newly_flagged),
        "updated": len(updated),
        "total_flagged": await db.flagged_entries.count_documents({"status": "flagged"}),
        "threshold": threshold,
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
