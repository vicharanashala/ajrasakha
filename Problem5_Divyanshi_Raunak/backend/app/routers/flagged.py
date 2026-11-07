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
    if status and status != "ALL":
        if status in ("RESOLVED", "RE_VALIDATED", "RETIRED"):
            q = {
                "$or": [
                    {"status": {"$in": ["RE_VALIDATED", "RESOLVED", "RETIRED"]}},
                    {"flag_info.review_status": {"$in": ["RESOLVED", "RE_VALIDATED", "RETIRED"]}},
                    {"flag_info.is_resolved": True}
                ]
            }
        elif status in ("FLAGGED", "FLAGGED_REVIEW", "PENDING_REVIEW", "PENDING_AGRI_REVIEW"):
            q = {
                "$and": [
                    {
                        "$or": [
                            {"status": {"$in": ["FLAGGED", "FLAGGED_REVIEW"]}},
                            {"flag_info.review_status": {"$in": ["PENDING_REVIEW", "PENDING_AGRI_REVIEW"]}},
                            {"is_flagged": True}
                        ]
                    },
                    {"flag_info.is_resolved": {"$ne": True}},
                    {"status": {"$nin": ["RE_VALIDATED", "RESOLVED", "RETIRED"]}}
                ]
            }
        else:
            q = {
                "$or": [
                    {"status": status},
                    {"flag_info.review_status": status}
                ]
            }
    else:
        # ALL: show both resolved (RE_VALIDATED) and flagged (FLAGGED / FLAGGED_REVIEW)
        q = {
            "$or": [
                {"status": {"$in": ["FLAGGED", "FLAGGED_REVIEW", "RE_VALIDATED", "RESOLVED"]}},
                {"is_flagged": True},
                {"flag_info": {"$ne": None}}
            ]
        }
            
    cursor = db["gdb_entries"].find(q).sort("metrics.helpful_ratio", 1)
    items = []
    for doc in cursor:
        flag_info = doc.get("flag_info") or {}
        metrics = doc.get("metrics") or {}
        upvotes = metrics.get("upvotes", doc.get("upvotes", 0))
        downvotes = metrics.get("downvotes", doc.get("downvotes", 0))
        tot = metrics.get("total_feedback", upvotes + downvotes)
        ratio = metrics.get("helpful_ratio", round(upvotes / tot, 3) if tot > 0 else 1.0)
        
        is_resolved = (
            doc.get("status") in ("RE_VALIDATED", "RESOLVED", "RETIRED") or 
            flag_info.get("review_status") in ("RE_VALIDATED", "RESOLVED", "RETIRED") or 
            flag_info.get("is_resolved") is True
        )
        
        item = {
            "_id": str(doc["_id"]),
            "gdb_id": str(doc["_id"]),
            "crop": doc.get("crop"),
            "domain": doc.get("domain"),
            "sub_domain": doc.get("sub_domain"),
            "question_en": doc.get("question_en"),
            "question_hi": doc.get("question_hi"),
            "answer_en": doc.get("answer_en"),
            "answer_hi": doc.get("answer_hi"),
            "technical_level": doc.get("technical_level"),
            "status": doc.get("status"),
            "upvotes": upvotes,
            "downvotes": downvotes,
            "total_responses": tot,
            "total_feedback": tot,
            "helpful_ratio": ratio,
            "helpful_percentage": round(ratio * 100, 1),
            "primary_state": doc.get("primary_state") if is_resolved else (flag_info.get("primary_negative_state") or doc.get("primary_state")),
            "is_flagged": doc.get("is_flagged", not is_resolved),
            "is_resolved": is_resolved,
            "flag_info": flag_info,
            "metrics": metrics,
            "review_status": flag_info.get("review_status", "RESOLVED" if is_resolved else "PENDING_AGRI_REVIEW"),
            "flag_reason": None if is_resolved else flag_info.get("flag_reason"),
            "flagged_at": flag_info.get("flagged_at"),
            "primary_negative_state": None if is_resolved else flag_info.get("primary_negative_state"),
            "root_cause_breakdown": None if is_resolved else flag_info.get("root_cause_breakdown"),
            "threshold_configured": flag_info.get("threshold_configured", 0.60),
            "min_samples_configured": flag_info.get("min_samples_configured", 10),
            "revised_answer_hi": flag_info.get("revised_answer_hi") or doc.get("revised_answer_hi"),
            "revised_answer_en": flag_info.get("revised_answer_en") or doc.get("revised_answer_en"),
            "reviewer_note": flag_info.get("reviewer_note") or doc.get("reviewer_note"),
            "resolved_at": flag_info.get("resolved_at") or doc.get("resolved_at"),
            "assigned_team": flag_info.get("assigned_team", "ACE Agronomy Board")
        }
        items.append(item)
    unresolved_count = len([i for i in items if not i.get("is_resolved")])
    resolved_count = len([i for i in items if i.get("is_resolved")])
    return {
        "total": len(items),
        "unresolved_count": unresolved_count,
        "resolved_count": resolved_count,
        "queue": items
    }

@router.post("/{gdb_id}/ai-answer")
def generate_ai_answer(gdb_id: str):
    """
    Generates a suitable replacement answer (<100 words in Hindi and English)
    using the NVIDIA Build NIM API based on the flagged question and crop context.
    """
    db = get_db()
    gdb = db["gdb_entries"].find_one({"_id": gdb_id})
    if not gdb:
        return {"status": "error", "message": f"Entry {gdb_id} not found."}
        
    from helpers.nvidia_service import generate_suitable_answer_with_nvidia
    flag_info = gdb.get("flag_info") or {}
    causes = list(flag_info.get("root_cause_breakdown", {}).keys()) if isinstance(flag_info.get("root_cause_breakdown"), dict) else []
    
    result = generate_suitable_answer_with_nvidia(
        crop=gdb.get("crop", ""),
        domain=gdb.get("domain", ""),
        question_hi=gdb.get("question_hi", ""),
        question_en=gdb.get("question_en", ""),
        current_answer_hi=gdb.get("answer_hi", ""),
        current_answer_en=gdb.get("answer_en", ""),
        root_causes=causes
    )
    return {
        "status": "success",
        "gdb_id": gdb_id,
        **result
    }

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

@router.get("/cron/status")
def get_cron_status():
    """Returns the status, timezone, and next run time of the daily 2:00 AM IST cron job."""
    from helpers.scheduler import get_scheduler_info
    return get_scheduler_info()

@router.post("/cron/run-now")
def run_cron_now():
    """Manually triggers the daily GDB flagging quality scan immediately."""
    from helpers.scheduler import trigger_cron_now
    return trigger_cron_now()

