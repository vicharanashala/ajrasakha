from datetime import datetime
from typing import Dict, Any, Optional
import logging
from app.config import settings
from app.database import get_db

logger = logging.getLogger("ajrasakha.flagging")

def evaluate_and_flag_gdb(gdb_id: str) -> Optional[Dict[str, Any]]:
    """
    Evaluates whether a GDB entry has dropped below the quality threshold:
    Condition: total_feedback >= FLAG_MIN_RESPONSES (10) AND helpful_ratio < 0.60
    """
    db = get_db()
    gdb = db["gdb_entries"].find_one({"_id": gdb_id})
    if not gdb:
        return None
    
    metrics = gdb.get("metrics", {})
    upvotes = metrics.get("upvotes", 0)
    downvotes = metrics.get("downvotes", 0)
    total_fb = upvotes + downvotes
    
    if total_fb == 0:
        return None
        
    helpful_ratio = round(upvotes / total_fb, 3)
    
    # Update metrics on GDB entry
    db["gdb_entries"].update_one(
        {"_id": gdb_id},
        {"$set": {
            "metrics.total_feedback": total_fb,
            "metrics.upvotes": upvotes,
            "metrics.downvotes": downvotes,
            "metrics.helpful_ratio": helpful_ratio,
            "metrics.last_feedback_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }}
    )
    
    # Flagging Rule
    is_failing = (total_fb >= settings.FLAG_MIN_RESPONSES) and (helpful_ratio < settings.FLAG_HELPFUL_THRESHOLD)
    
    if is_failing:
        # Aggregate root cause feedback
        causes = list(db["farmer_feedback"].find(
            {"gdb_id": gdb_id, "rating": 2},
            {"root_cause_category": 1, "farmer_state": 1}
        ))
        
        cause_counts = {}
        states = []
        for c in causes:
            cat = c.get("root_cause_category") or "TOO_TECHNICAL"
            cause_counts[cat] = cause_counts.get(cat, 0) + 1
            if c.get("farmer_state"):
                states.append(c["farmer_state"])
                
        tot_neg = len(causes) or 1
        cause_percentages = {k: f"{round((v/tot_neg)*100)}%" for k, v in cause_counts.items()}
        most_affected_state = max(set(states), key=states.count) if states else "Punjab"
        
        flag_data = {
            "gdb_id": gdb_id,
            "crop": gdb.get("crop"),
            "domain": gdb.get("domain"),
            "question_en": gdb.get("question_en"),
            "question_hi": gdb.get("question_hi"),
            "current_answer_en": gdb.get("answer_en"),
            "current_answer_hi": gdb.get("answer_hi"),
            "helpful_ratio": helpful_ratio,
            "total_feedback": total_fb,
            "upvotes": upvotes,
            "downvotes": downvotes,
            "threshold_configured": settings.FLAG_HELPFUL_THRESHOLD,
            "min_samples_configured": settings.FLAG_MIN_RESPONSES,
            "flagged_at": datetime.utcnow().isoformat(),
            "primary_negative_state": most_affected_state,
            "root_cause_breakdown": cause_percentages,
            "flag_reason": f"Helpfulness ({int(helpful_ratio*100)}%) dropped below {int(settings.FLAG_HELPFUL_THRESHOLD*100)}% across {total_fb} farmer responses.",
            "review_status": "PENDING_AGRI_REVIEW", # PENDING_AGRI_REVIEW, REVISED, RE_VALIDATED
            "assigned_team": "ACE Agronomy Board"
        }
        
        db["flagged_queue"].update_one(
            {"gdb_id": gdb_id},
            {"$set": flag_data},
            upsert=True
        )
        
        db["gdb_entries"].update_one(
            {"_id": gdb_id},
            {"$set": {"status": "FLAGGED_REVIEW"}}
        )
        return flag_data
    return None

def resolve_flagged_entry(gdb_id: str, revised_answer_hi: str, revised_answer_en: str, reviewer_note: str, action: str):
    db = get_db()
    if action == "REVISE_AND_REVALIDATE":
        db["gdb_entries"].update_one(
            {"_id": gdb_id},
            {"$set": {
                "answer_hi": revised_answer_hi,
                "answer_en": revised_answer_en,
                "status": "RE_VALIDATED",
                "technical_level": "Simple",
                "updated_at": datetime.utcnow().isoformat()
            }}
        )
        db["flagged_queue"].update_one(
            {"gdb_id": gdb_id},
            {"$set": {
                "review_status": "RE_VALIDATED",
                "reviewer_note": reviewer_note,
                "resolved_at": datetime.utcnow().isoformat()
            }}
        )
        return {"status": "success", "message": f"Entry {gdb_id} revised and re-validated in GDB."}
    elif action == "SEND_TO_ACE_PIPELINE":
        db["flagged_queue"].update_one(
            {"gdb_id": gdb_id},
            {"$set": {
                "review_status": "SENT_TO_ACE_PIPELINE",
                "reviewer_note": reviewer_note,
                "sent_to_pipeline_at": datetime.utcnow().isoformat()
            }}
        )
        return {"status": "success", "message": f"Entry {gdb_id} routed to ACE Reviewer Pipeline."}
    return {"status": "error", "message": "Unknown action."}
