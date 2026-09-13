import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
from fastapi import APIRouter, HTTPException
from shared.mongodb import get_db

router = APIRouter()


@router.get("/gdb-entry/{entry_id}")
def get_gdb_entry(entry_id: str):
    """Get full GDB entry details including question and answer"""
    db = get_db()

    entry = db.gdb_entries.find_one({"_id": entry_id})

    if not entry:
        raise HTTPException(status_code=404, detail="GDB entry not found")

    return {
        "_id": entry["_id"],
        "question": entry.get("question", ""),
        "answer": entry.get("answer", ""),
        "ai_answer": entry.get("ai_answer", ""),
        "domain": entry.get("domain"),
        "language": entry.get("language", "English"),
        "state": entry.get("state"),
        "keywords": entry.get("keywords", []),
        "status": entry.get("status"),
        "source": entry.get("source"),
        "created_at": entry.get("created_at"),
        "updated_at": entry.get("updated_at"),
        "reviewed_at": entry.get("reviewed_at"),
        "reviewer": entry.get("reviewer"),
        "auto_approved": entry.get("auto_approved", False),
        "feedback_count": entry.get("feedback_count", 0),
        "helpful_count": entry.get("helpful_count", 0),
        "not_helpful_count": entry.get("not_helpful_count", 0),
        "review_notes": entry.get("review_notes"),
    }


@router.get("/gdb-entry/{entry_id}/preview")
def get_gdb_entry_preview(entry_id: str):
    """Get a preview of the GDB entry (question + truncated answer)"""
    db = get_db()

    entry = db.gdb_entries.find_one(
        {"_id": entry_id},
        {"question": 1, "answer": 1, "domain": 1, "language": 1, "status": 1}
    )

    if not entry:
        raise HTTPException(status_code=404, detail="GDB entry not found")

    answer = entry.get("answer", "")
    preview_length = 200

    return {
        "_id": entry["_id"],
        "question": entry.get("question", ""),
        "answer_preview": answer[:preview_length] + ("..." if len(answer) > preview_length else ""),
        "answer_full": answer,
        "domain": entry.get("domain"),
        "language": entry.get("language"),
        "status": entry.get("status"),
    }
