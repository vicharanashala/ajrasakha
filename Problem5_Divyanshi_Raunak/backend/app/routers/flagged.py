from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.config import settings
from helpers.flagging_pipeline import resolve_flagged_entry

router = APIRouter(prefix="/flagged", tags=["Flagged Reviews"])

class ResolveRequest(BaseModel):
    revised_answer_hi: str
    revised_answer_en: str
    reviewer_note: str
    action: str = "REVISE_AND_REVALIDATE"

class ThresholdConfigRequest(BaseModel):
    helpful_threshold: float
    min_responses: int

@router.get("/queue")
def get_queue(status: Optional[str] = None):
    db = get_db()
    q = {}
    if status and status != "ALL":
        q["review_status"] = status
    items = list(db["flagged_queue"].find(q).sort("helpful_ratio", 1))
    for item in items:
        if "_id" in item:
            item["_id"] = str(item["_id"])
    return {"total": len(items), "queue": items}

@router.post("/{gdb_id}/resolve")
def resolve(gdb_id: str, payload: ResolveRequest):
    return resolve_flagged_entry(
        gdb_id=gdb_id,
        revised_answer_hi=payload.revised_answer_hi,
        revised_answer_en=payload.revised_answer_en,
        reviewer_note=payload.reviewer_note,
        action=payload.action
    )

@router.get("/config")
def get_config():
    return {"helpful_threshold": settings.FLAG_HELPFUL_THRESHOLD, "min_responses": settings.FLAG_MIN_RESPONSES}

@router.post("/config")
def update_config(payload: ThresholdConfigRequest):
    settings.FLAG_HELPFUL_THRESHOLD = payload.helpful_threshold
    settings.FLAG_MIN_RESPONSES = payload.min_responses
    return {"status": "success", "config": {"helpful_threshold": settings.FLAG_HELPFUL_THRESHOLD, "min_responses": settings.FLAG_MIN_RESPONSES}}
