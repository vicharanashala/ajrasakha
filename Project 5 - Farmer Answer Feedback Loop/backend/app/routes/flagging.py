"""
Flagging routes — manage the auto-flagging pipeline and reviewer queue.
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.services.flagging_service import run_full_flagging_pipeline
from app.config import settings
from datetime import datetime, timezone
from typing import Optional


class FlaggingSettingsUpdate(BaseModel):
    feedback_threshold: Optional[float] = Field(None, gt=0, le=100)
    min_responses_to_flag: Optional[int] = Field(None, ge=1)

router = APIRouter(prefix="/flagging", tags=["Flagging Pipeline"])

# In-memory override for dynamic thresholds (persisted to DB for durability)
_threshold_override: Optional[float] = None
_min_responses_override: Optional[int] = None


def get_effective_threshold() -> float:
    return _threshold_override if _threshold_override is not None else settings.feedback_threshold


def get_effective_min_responses() -> int:
    return _min_responses_override if _min_responses_override is not None else settings.min_responses_to_flag


@router.get("/settings", summary="Get current flagging thresholds")
async def get_flagging_settings(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Returns the current flagging threshold and minimum responses setting."""
    # Try to load from DB first (persisted settings)
    saved = await db.flagging_settings.find_one({"_id": "global"})
    if saved:
        return {
            "feedback_threshold": saved.get("feedback_threshold", settings.feedback_threshold),
            "min_responses_to_flag": saved.get("min_responses_to_flag", settings.min_responses_to_flag),
            "source": "database",
        }
    return {
        "feedback_threshold": settings.feedback_threshold,
        "min_responses_to_flag": settings.min_responses_to_flag,
        "source": "env_default",
    }


@router.patch("/settings", summary="Update flagging thresholds dynamically")
async def update_flagging_settings(
    body: FlaggingSettingsUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Dynamically update the flagging threshold and/or minimum responses.
    Changes are persisted to the database and take effect immediately.
    """
    global _threshold_override, _min_responses_override

    update_fields = {"updated_at": datetime.now(timezone.utc)}
    if body.feedback_threshold is not None:
        update_fields["feedback_threshold"] = body.feedback_threshold
        _threshold_override = body.feedback_threshold
        # Patch the live settings object so check_and_flag_entry uses the new threshold immediately
        settings.feedback_threshold = body.feedback_threshold
    if body.min_responses_to_flag is not None:
        update_fields["min_responses_to_flag"] = body.min_responses_to_flag
        _min_responses_override = body.min_responses_to_flag
        settings.min_responses_to_flag = body.min_responses_to_flag

    if len(update_fields) == 1:  # only updated_at
        raise HTTPException(status_code=422, detail="Provide at least one of: feedback_threshold, min_responses_to_flag")

    await db.flagging_settings.update_one(
        {"_id": "global"},
        {"$set": update_fields},
        upsert=True,
    )

    # Auto-run pipeline so DB flags are immediately in sync with new threshold
    pipeline_result = await run_full_flagging_pipeline(db)

    return {
        "message": "Flagging settings updated and pipeline re-run",
        "feedback_threshold": get_effective_threshold(),
        "min_responses_to_flag": get_effective_min_responses(),
        "pipeline": pipeline_result,
    }


@router.get("/flagged", summary="Get all flagged GDB entries")
async def get_flagged_entries(
    status: Optional[str] = None,
    domain: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Returns all flagged GDB entries, enriched with question text from gdb_entries."""
    query = {}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$in": ["flagged", "under_review"]}
    if domain:
        query["domain"] = domain

    cursor = db.flagged_entries.find(query).sort("priority_score", -1)
    flagged = await cursor.to_list(500)

    # Enrich with GDB entry question text
    results = []
    for f in flagged:
        gdb_id = f.get("gdb_entry_id")
        gdb_entry = await db.gdb_entries.find_one({"_id": gdb_id}, {"question": 1, "answer": 1})

        results.append({
            "id": str(f.get("_id", "")),
            "gdb_entry_id": gdb_id,
            "domain": f.get("domain"),
            "language": f.get("language"),
            "total_responses": f.get("total_responses", 0),
            "helpful_count": f.get("helpful_count", 0),
            "not_helpful_count": f.get("not_helpful_count", 0),
            "helpfulness_score": f.get("helpfulness_score", 0),
            "priority_score": f.get("priority_score", 0),
            "status": f.get("status"),
            "flagged_at": f.get("flagged_at", "").isoformat() if hasattr(f.get("flagged_at"), "isoformat") else str(f.get("flagged_at", "")),
            "last_feedback_at": f.get("last_feedback_at", "").isoformat() if hasattr(f.get("last_feedback_at"), "isoformat") else str(f.get("last_feedback_at", "")),
            "review_notes": f.get("review_notes"),
            "question": gdb_entry.get("question", "") if gdb_entry else "",
            "answer": gdb_entry.get("answer", "") if gdb_entry else "",
        })

    return {"total": len(results), "data": results}


@router.post("/run", summary="Run full flagging pipeline scan")
async def run_flagging_pipeline(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Scans all GDB entries and flags any that cross the threshold.
    Safe to run multiple times (idempotent).
    """
    result = await run_full_flagging_pipeline(db)
    return {
        "message": "Flagging pipeline completed",
        **result,
    }


@router.patch("/{gdb_entry_id}/resolve", summary="Resolve a flagged entry")
async def resolve_flagged_entry(
    gdb_entry_id: str,
    review_notes: Optional[str] = Body(None, embed=True),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Mark a flagged GDB entry as resolved (after the agri team has improved it)."""
    existing = await db.flagged_entries.find_one({"gdb_entry_id": gdb_entry_id})
    if not existing:
        raise HTTPException(status_code=404, detail=f"No flagged entry found for '{gdb_entry_id}'")

    await db.flagged_entries.update_one(
        {"gdb_entry_id": gdb_entry_id},
        {"$set": {
            "status": "resolved",
            "review_notes": review_notes,
            "resolved_at": datetime.now(timezone.utc),
        }}
    )
    await db.gdb_entries.update_one(
        {"_id": gdb_entry_id},
        {"$set": {"is_flagged": False}}
    )

    return {"message": f"Entry '{gdb_entry_id}' marked as resolved", "gdb_entry_id": gdb_entry_id}


@router.patch("/{gdb_entry_id}/status", summary="Update flag status")
async def update_flag_status(
    gdb_entry_id: str,
    new_status: str = Body(..., embed=True),
    review_notes: Optional[str] = Body(None, embed=True),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update the status of a flagged entry (flagged → under_review → resolved)."""
    valid_statuses = {"flagged", "under_review", "resolved"}
    if new_status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"Status must be one of: {valid_statuses}")

    result = await db.flagged_entries.update_one(
        {"gdb_entry_id": gdb_entry_id},
        {"$set": {
            "status": new_status,
            "review_notes": review_notes,
            "updated_at": datetime.now(timezone.utc),
        }}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Flagged entry not found")

    if new_status == "resolved":
        await db.gdb_entries.update_one(
            {"_id": gdb_entry_id},
            {"$set": {"is_flagged": False}}
        )

    return {"message": f"Status updated to '{new_status}'", "gdb_entry_id": gdb_entry_id}


@router.patch("/{gdb_entry_id}/edit-entry", summary="Expert edit: update question and/or answer")
async def edit_gdb_entry(
    gdb_entry_id: str,
    question: Optional[str] = Body(None, embed=True),
    answer: Optional[str] = Body(None, embed=True),
    review_notes: Optional[str] = Body(None, embed=True),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Allows an expert reviewer to directly edit the question and/or answer
    text of a GDB entry from the flagged entries review page.
    Also optionally records review notes on the flag record.
    """
    gdb_entry = await db.gdb_entries.find_one({"_id": gdb_entry_id})
    if not gdb_entry:
        raise HTTPException(status_code=404, detail=f"GDB entry '{gdb_entry_id}' not found")

    if not question and not answer:
        raise HTTPException(status_code=422, detail="Provide at least one of: question, answer")

    gdb_update = {"updated_at": datetime.now(timezone.utc)}
    if question:
        gdb_update["question"] = question.strip()
    if answer:
        gdb_update["answer"] = answer.strip()

    await db.gdb_entries.update_one(
        {"_id": gdb_entry_id},
        {"$set": gdb_update},
    )

    # Also update review notes on the flag record if provided
    if review_notes is not None:
        await db.flagged_entries.update_one(
            {"gdb_entry_id": gdb_entry_id},
            {"$set": {
                "review_notes": review_notes,
                "updated_at": datetime.now(timezone.utc),
            }},
        )

    updated = await db.gdb_entries.find_one({"_id": gdb_entry_id})
    return {
        "message": f"GDB entry '{gdb_entry_id}' updated successfully",
        "gdb_entry_id": gdb_entry_id,
        "question": updated.get("question"),
        "answer": updated.get("answer"),
    }
