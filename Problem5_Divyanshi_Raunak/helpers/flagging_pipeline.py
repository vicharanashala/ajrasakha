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
    
    # Check live farmer_feedback collection first
    fb_stats = list(db["farmer_feedback"].aggregate([
        {"$match": {"gdb_id": gdb_id}},
        {"$group": {
            "_id": "$gdb_id",
            "upvotes": {"$sum": {"$cond": [{"$eq": ["$rating", 1]}, 1, 0]}},
            "downvotes": {"$sum": {"$cond": [{"$eq": ["$rating", 2]}, 1, 0]}},
            "total": {"$sum": 1}
        }}
    ]))
    
    if fb_stats and fb_stats[0]["total"] > 0:
        upvotes = fb_stats[0]["upvotes"]
        downvotes = fb_stats[0]["downvotes"]
        total_fb = fb_stats[0]["total"]
    else:
        metrics = gdb.get("metrics", {})
        upvotes = metrics.get("upvotes", gdb.get("upvotes", 0))
        downvotes = metrics.get("downvotes", gdb.get("downvotes", 0))
        total_fb = metrics.get("total_feedback", upvotes + downvotes)
    
    if total_fb == 0:
        return None
        
    helpful_ratio = round(upvotes / total_fb, 3)
    now = datetime.utcnow().isoformat()
    
    # Update metrics on GDB entry
    db["gdb_entries"].update_one(
        {"_id": gdb_id},
        {"$set": {
            "upvotes": upvotes,
            "downvotes": downvotes,
            "metrics.total_feedback": total_fb,
            "metrics.upvotes": upvotes,
            "metrics.downvotes": downvotes,
            "metrics.helpful_ratio": helpful_ratio,
            "metrics.last_feedback_at": now,
            "updated_at": now
        }}
    )
    
    # Flagging Rule: helpful_ratio < threshold AND total_fb >= min_responses
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
        most_affected_state = max(set(states), key=states.count) if states else (gdb.get("primary_state") or "Punjab")
        
        flag_info = {
            "threshold_configured": settings.FLAG_HELPFUL_THRESHOLD,
            "min_samples_configured": settings.FLAG_MIN_RESPONSES,
            "flagged_at": now,
            "primary_negative_state": most_affected_state,
            "root_cause_breakdown": cause_percentages,
            "flag_reason": f"Helpfulness score ({int(helpful_ratio*100)}%) is below {int(settings.FLAG_HELPFUL_THRESHOLD*100)}% threshold across {total_fb} farmer responses.",
            "review_status": "PENDING_AGRI_REVIEW", # PENDING_AGRI_REVIEW, REVISED, RE_VALIDATED, RESOLVED
            "assigned_team": "ACE Agronomy Board",
            "revised_answer_hi": None,
            "revised_answer_en": None,
            "reviewer_note": None,
            "resolved_at": None,
            "is_resolved": False,
            "resolved": False
        }
        
        db["gdb_entries"].update_one(
            {"_id": gdb_id},
            {"$set": {
                "status": "FLAGGED_REVIEW",
                "is_flagged": True,
                "flag_info": flag_info
            }}
        )
        logger.info(f"Entry {gdb_id} flagged for review: helpfulness={helpful_ratio*100:.1f}%, responses={total_fb}")
        return flag_info
    return None

def scan_and_flag_all_candidates() -> Dict[str, Any]:
    """
    Daily Cron Job:
    Runs every day at 2:00 AM IST. Searches for all candidate GDB entries that meet
    the statistical flagging criteria (helpful_ratio < threshold & total_feedback >= min_responses)
    and flags them with comprehensive diagnostic information.
    """
    db = get_db()
    logger.info("CRON: Starting daily GDB flagging quality scan at 2:00 AM IST...")
    
    # Exclude retired entries
    cursor = db["gdb_entries"].find({"status": {"$nin": ["RETIRED"]}})
    
    scanned_count = 0
    flagged_newly = 0
    flagged_ids = []
    
    for doc in cursor:
        scanned_count += 1
        gdb_id = str(doc["_id"])
        
        # If already actively flagged (not yet resolved), check if it still needs update or skip
        is_already_flagged = doc.get("is_flagged") is True and doc.get("status") in ["FLAGGED", "FLAGGED_REVIEW"]
        
        flag_info = evaluate_and_flag_gdb(gdb_id)
        if flag_info:
            if not is_already_flagged:
                flagged_newly += 1
            flagged_ids.append(gdb_id)
            
    summary = {
        "status": "success",
        "scanned_entries": scanned_count,
        "newly_flagged_count": flagged_newly,
        "total_flagged_in_run": len(flagged_ids),
        "flagged_ids": flagged_ids,
        "executed_at": datetime.utcnow().isoformat(),
        "threshold": settings.FLAG_HELPFUL_THRESHOLD,
        "min_responses": settings.FLAG_MIN_RESPONSES
    }
    logger.info(f"CRON: Finished daily GDB flagging scan: {summary}")
    return summary

def resolve_flagged_entry(gdb_id: str, revised_answer_hi: str, revised_answer_en: str, reviewer_note: str, action: str):
    db = get_db()
    if action == "REVISE_AND_REVALIDATE":
        now = datetime.utcnow().isoformat()
        db["gdb_entries"].update_one(
            {"_id": gdb_id},
            {"$set": {
                "answer_hi": revised_answer_hi,
                "answer_en": revised_answer_en,
                "revised_answer_hi": revised_answer_hi,
                "revised_answer_en": revised_answer_en,
                "reviewer_note": reviewer_note,
                "resolved_at": now,
                "status": "RE_VALIDATED",
                "technical_level": "Simple",
                "updated_at": now,
                "is_flagged": False,
                "upvotes": 0,
                "downvotes": 0,
                "metrics": {
                    "total_queries": 0,
                    "total_feedback": 0,
                    "upvotes": 0,
                    "downvotes": 0,
                    "helpful_ratio": 1.0,
                    "voice_feedback_count": 0,
                    "last_feedback_at": None,
                    "revalidated_at": now
                },
                "flag_info.is_resolved": True,
                "flag_info.resolved": True,
                "flag_info.review_status": "RESOLVED",
                "flag_info.flag_reason": None,
                "flag_info.root_cause_breakdown": None,
                "flag_info.primary_negative_state": None,
                "flag_info.revised_answer_hi": revised_answer_hi,
                "flag_info.revised_answer_en": revised_answer_en,
                "flag_info.reviewer_note": reviewer_note,
                "flag_info.resolved_at": now,
                "flag_info.resolution_action": action,
                "flag_info.resolved_by": "ACE Agronomy Board"
            }}
        )
        return {"status": "success", "message": f"Entry {gdb_id} revised and re-validated in GDB."}
    elif action == "RETIRE":
        now = datetime.utcnow().isoformat()
        gdb = db["gdb_entries"].find_one({"_id": gdb_id}) or {}
        
        # Check if revised answers were provided from AI generation, or generate via NVIDIA Build API
        final_hi = (revised_answer_hi or "").strip()
        final_en = (revised_answer_en or "").strip()
        final_note = (reviewer_note or "").strip()
        
        ai_meta = {}
        if not final_hi or not final_en:
            from helpers.nvidia_service import generate_suitable_answer_with_nvidia
            flag_info = gdb.get("flag_info") or {}
            causes = list(flag_info.get("root_cause_breakdown", {}).keys()) if isinstance(flag_info.get("root_cause_breakdown"), dict) else []
            ai_res = generate_suitable_answer_with_nvidia(
                crop=gdb.get("crop", ""),
                domain=gdb.get("domain", ""),
                question_hi=gdb.get("question_hi", ""),
                question_en=gdb.get("question_en", ""),
                current_answer_hi=gdb.get("answer_hi", ""),
                current_answer_en=gdb.get("answer_en", ""),
                root_causes=causes
            )
            final_hi = ai_res.get("answer_hi", "")
            final_en = ai_res.get("answer_en", "")
            if not final_note:
                final_note = ai_res.get("reviewer_note", "Retired unhelpful entry; generated verified AI agronomic replacement.")
            ai_meta = {
                "source": ai_res.get("source", "nvidia_build_api"),
                "model": ai_res.get("model", ""),
                "word_count_hi": ai_res.get("word_count_hi", 0),
                "word_count_en": ai_res.get("word_count_en", 0),
                "generated_at": now
            }
        else:
            from helpers.nvidia_service import enforce_max_words, count_words
            final_hi = enforce_max_words(final_hi, 100)
            final_en = enforce_max_words(final_en, 100)
            ai_meta = {
                "source": "nvidia_build_api",
                "word_count_hi": count_words(final_hi),
                "word_count_en": count_words(final_en),
                "saved_at": now
            }

        db["gdb_entries"].update_one(
            {"_id": gdb_id},
            {"$set": {
                "status": "RETIRED",
                "answer_hi": final_hi,
                "answer_en": final_en,
                "revised_answer_hi": final_hi,
                "revised_answer_en": final_en,
                "ai_generated_replacement": {
                    "answer_hi": final_hi,
                    "answer_en": final_en,
                    **ai_meta
                },
                "reviewer_note": final_note,
                "resolved_at": now,
                "updated_at": now,
                "is_flagged": False,
                "upvotes": 0,
                "downvotes": 0,
                "metrics": {
                    "total_queries": 0,
                    "total_feedback": 0,
                    "upvotes": 0,
                    "downvotes": 0,
                    "helpful_ratio": 1.0,
                    "voice_feedback_count": 0,
                    "last_feedback_at": None,
                    "retired_at": now
                },
                "flag_info.is_resolved": True,
                "flag_info.resolved": True,
                "flag_info.review_status": "RETIRED",
                "flag_info.flag_reason": None,
                "flag_info.root_cause_breakdown": None,
                "flag_info.primary_negative_state": None,
                "flag_info.revised_answer_hi": final_hi,
                "flag_info.revised_answer_en": final_en,
                "flag_info.reviewer_note": final_note,
                "flag_info.resolved_at": now,
                "flag_info.resolution_action": action,
                "flag_info.resolved_by": "ACE Agronomy Board (NVIDIA AI Assisted)"
            }}
        )
        return {
            "status": "success", 
            "message": f"Entry {gdb_id} retired and updated in GDB with NVIDIA AI suitable answer (<100 words in Hindi & English).",
            "ai_replacement": {
                "answer_hi": final_hi,
                "answer_en": final_en,
                **ai_meta
            }
        }
    elif action == "SEND_TO_ACE_PIPELINE":
        db["gdb_entries"].update_one(
            {"_id": gdb_id},
            {"$set": {
                "status": "UNDER_REVISION",
                "updated_at": datetime.utcnow().isoformat(),
                "flag_info.review_status": "SENT_TO_ACE_PIPELINE",
                "flag_info.reviewer_note": reviewer_note,
                "flag_info.sent_to_pipeline_at": datetime.utcnow().isoformat()
            }}
        )
        return {"status": "success", "message": f"Entry {gdb_id} routed to ACE Reviewer Pipeline."}
    return {"status": "error", "message": "Unknown action."}
