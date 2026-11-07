import re
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from bson import ObjectId
from app.database import get_db
from helpers.flagging_pipeline import evaluate_and_flag_gdb

logger = logging.getLogger("ajrasakha.session_pipeline")

ONGOING_COLLECTION = "ongoing_farmer_sessions"

def create_or_update_ongoing_session(
    phone_number: str,
    question: str,
    gdb_id: str,
    gdb_answer: str,
    farmer_state: str = "Punjab",
    crop: str = "Wheat"
) -> Dict[str, Any]:
    """
    Stores an ongoing farmer inquiry session in the database.
    It remains in the ongoing_farmer_sessions collection until the farmer responds
    with feedback and the feedback is pushed to the corresponding GDB entry.
    """
    db = get_db()
    now = datetime.utcnow().isoformat()
    
    clean_phone = phone_number.strip()
    
    session_data = {
        "phone_number": clean_phone,
        "question": question,
        "gdb_id": gdb_id,
        "gdb_answer": gdb_answer,
        "crop": crop,
        "farmer_state": farmer_state,
        "status": "AWAITING_FEEDBACK", # AWAITING_FEEDBACK, NUDGED, FEEDBACK_RECEIVED
        "has_responded": False,
        "rating": None,
        "feedback_comment": None,
        "root_cause": None,
        "nudge_count": 0,
        "last_nudge_at": None,
        "created_at": now,
        "updated_at": now
    }
    
    # Check if there is an existing ongoing session for this phone number that hasn't completed feedback
    existing = db[ONGOING_COLLECTION].find_one({
        "phone_number": clean_phone,
        "has_responded": False
    })
    
    if existing:
        # Preserve nudge_count from the previous session — a new question supersedes
        # the old one but we keep track of how many nudges were sent overall.
        session_data["nudge_count"] = existing.get("nudge_count", 0)
        db[ONGOING_COLLECTION].update_one(
            {"_id": existing["_id"]},
            {"$set": session_data}
        )
        session_data["_id"] = str(existing["_id"])
        logger.info(f"Updated ongoing session for farmer {clean_phone} (new question, GDB: {gdb_id})")
    else:
        res = db[ONGOING_COLLECTION].insert_one(session_data)
        session_data["_id"] = str(res.inserted_id)
        logger.info(f"Created new ongoing session for farmer {clean_phone} (GDB: {gdb_id})")
        
    return session_data

def record_farmer_feedback_response(
    phone_number: str,
    rating: int, # 1 = Helpful, 2 = Unhelpful
    feedback_comment: Optional[str] = None,
    root_cause: Optional[str] = None,
    session_id: Optional[str] = None,
    auto_push_to_gdb: bool = True
) -> Optional[Dict[str, Any]]:
    """
    Records farmer feedback in the ongoing session and immediately pushes the rating
    to the corresponding GDB entry (updating upvotes/downvotes, logging to farmer_feedback,
    evaluating statistical flagging drift, and completing the ongoing session).
    """
    db = get_db()
    now = datetime.utcnow().isoformat()
    clean_phone = phone_number.strip()
    digits = re.sub(r"[^\d]", "", clean_phone)
    phone_candidates = list({clean_phone, digits, f"+{digits}"} if digits else {clean_phone})
    
    query: Dict[str, Any] = {}
    if session_id:
        try:
            query = {"_id": ObjectId(session_id)}
        except Exception:
            query = {"_id": session_id}
    else:
        query = {
            "phone_number": {"$in": phone_candidates},
            "has_responded": False
        }
        
    session = db[ONGOING_COLLECTION].find_one(query)
    if not session:
        # Fallback to the latest session for this phone number
        session = db[ONGOING_COLLECTION].find_one({"phone_number": {"$in": phone_candidates}}, sort=[("updated_at", -1)])
        if not session:
            logger.warning(f"No ongoing session found for phone {clean_phone}")
            return None
            
    update_data = {
        "has_responded": True,
        "rating": rating,
        "feedback_comment": feedback_comment or ("उपयोगी रहा" if rating == 1 else "समस्या का समाधान नहीं हुआ"),
        "root_cause": root_cause,
        "status": "FEEDBACK_RECEIVED",
        "responded_at": now,
        "updated_at": now
    }
    
    db[ONGOING_COLLECTION].update_one({"_id": session["_id"]}, {"$set": update_data})
    
    session.update(update_data)
    sid_str = str(session["_id"])
    session["_id"] = sid_str
    logger.info(f"Recorded feedback (rating={rating}) for farmer {clean_phone} session {sid_str}")

    # Immediately push rating to corresponding GDB entry as soon as farmer gives feedback
    if auto_push_to_gdb:
        push_res = push_feedback_to_gdb(session_id=sid_str, is_manual=False)
        session["gdb_push_result"] = push_res
        session["status"] = "PUSHED_TO_GDB"
        session["has_responded"] = True
        logger.info(f"Immediately pushed rating {rating} to GDB for session {sid_str}: {push_res}")

    return session

def push_feedback_to_gdb(session_id: str, is_manual: bool = True) -> Dict[str, Any]:
    """
    Pushes completed feedback from ongoing_farmer_sessions to the corresponding GDB entry:
    1. Updates GDB metrics (upvotes, downvotes, total_feedback, helpful_ratio).
    2. Logs structured record in farmer_feedback collection.
    3. Triggers statistical flagging pipeline evaluation if helpful_ratio drops.
    4. If manual push: Notifies farmer via WhatsApp that feedback was received.
    5. Deletes the ongoing session from ongoing_farmer_sessions.
    """
    db = get_db()
    now = datetime.utcnow().isoformat()
    
    try:
        obj_id = ObjectId(session_id)
        session = db[ONGOING_COLLECTION].find_one({"_id": obj_id})
    except Exception:
        session = db[ONGOING_COLLECTION].find_one({"_id": session_id})
        
    if not session:
        return {"success": False, "message": f"Session {session_id} not found."}
        
    gdb_id = session.get("gdb_id")
    if not gdb_id:
        return {"success": False, "message": "Session has no associated GDB entry ID."}
        
    rating = session.get("rating", 1) # Default to 1 if not set
    phone = session.get("phone_number", "")
    crop = session.get("crop", "Wheat")
    state = session.get("farmer_state", "Punjab")
    comment = session.get("feedback_comment", "")
    root_cause = session.get("root_cause")
    
    # 1. Update GDB Entry metrics
    gdb = db["gdb_entries"].find_one({"_id": gdb_id})
    if gdb:
        curr_up = gdb.get("upvotes", 0) + (1 if rating == 1 else 0)
        curr_down = gdb.get("downvotes", 0) + (1 if rating == 2 else 0)
        tot_fb = curr_up + curr_down
        ratio = round(curr_up / tot_fb, 3) if tot_fb > 0 else 1.0
        
        db["gdb_entries"].update_one(
            {"_id": gdb_id},
            {
                "$set": {
                    "upvotes": curr_up,
                    "downvotes": curr_down,
                    "helpful_ratio": ratio,
                    "helpful_percentage": round(ratio * 100, 1),
                    "metrics.upvotes": curr_up,
                    "metrics.downvotes": curr_down,
                    "metrics.total_feedback": tot_fb,
                    "metrics.helpful_ratio": ratio,
                    "metrics.last_feedback_at": now,
                    "updated_at": now
                }
            }
        )
        logger.info(f"Updated GDB {gdb_id} metrics: up={curr_up}, down={curr_down}, ratio={ratio}")
        
        # 2. Trigger flagging evaluation
        evaluate_and_flag_gdb(gdb_id)
        
    # 3. Log to farmer_feedback collection
    feedback_doc = {
        "gdb_id": gdb_id,
        "phone_number": phone,
        "rating": rating,
        "feedback_text": comment,
        "root_cause_category": root_cause,
        "crop": crop,
        "farmer_state": state,
        "query_text": session.get("question", ""),
        "input_channel": "WHATSAPP_NUDGE",
        "created_at": now,
        "pushed_via": "MANUAL" if is_manual else "CRON_AUTO"
    }
    db["farmer_feedback"].insert_one(feedback_doc)
    
    # 4. If pushed manually, notify farmer via WhatsApp as required
    notified = False
    if is_manual and phone:
        try:
            from helpers.twilio_service import send_whatsapp_message
            ack_msg = (
                f"🙏 *नमस्ते किसान भाई!*\n\n"
                f"आपकी फसल (*{crop}*) के संबंध में दी गई प्रतिक्रिया AjraSakha GDB ज्ञानकोष में सफलतापूर्वक दर्ज कर ली गई है।\n\n"
                f"हमारे कृषि वैज्ञानिक आपके दिए गए सुझावों के आधार पर अनुशंसाओं को और अधिक उपयोगी बना रहे हैं। धन्यवाद! 🌱\n"
                f"— *AjraSakha AI Agri-Intel (IIT Ropar)*"
            )
            send_whatsapp_message(to_number=phone, message_body=ack_msg, message_type="FEEDBACK_ACK_MANUAL")
            notified = True
            logger.info(f"Sent manual push confirmation WhatsApp message to {phone}")
        except Exception as e:
            logger.warning(f"Could not send farmer notification: {e}")
            
    # 5. Delete session from ongoing collection (per requirement: 'after responding delete it and push the feedback to corresponding to GDB entry')
    db[ONGOING_COLLECTION].delete_one({"_id": session["_id"]})
    logger.info(f"Deleted completed ongoing session {session_id} after pushing feedback to GDB.")
    
    return {
        "success": True,
        "session_id": str(session["_id"]),
        "gdb_id": gdb_id,
        "rating": rating,
        "pushed_via": "MANUAL" if is_manual else "CRON_AUTO",
        "notified_farmer": notified,
        "message": f"Feedback for GDB {gdb_id} successfully pushed and ongoing session deleted."
    }

def push_all_pending_feedback_to_gdb(is_manual: bool = False) -> Dict[str, Any]:
    """
    Pushes all ongoing sessions that have received feedback to their corresponding GDB entries.
    Called automatically by the 7:00 PM and 9:00 PM IST cron jobs or manually via API.
    """
    db = get_db()
    cursor = db[ONGOING_COLLECTION].find({
        "$or": [
            {"has_responded": True},
            {"status": "FEEDBACK_RECEIVED"},
            {"rating": {"$ne": None}}
        ]
    })
    
    pushed = []
    errors = []
    
    for doc in list(cursor):
        sid = str(doc["_id"])
        res = push_feedback_to_gdb(sid, is_manual=is_manual)
        if res.get("success"):
            pushed.append(res)
        else:
            errors.append({"session_id": sid, "error": res.get("message")})
            
    logger.info(f"Batch push completed: {len(pushed)} pushed, {len(errors)} failed.")
    return {
        "status": "success",
        "total_pushed": len(pushed),
        "total_failed": len(errors),
        "pushed_sessions": pushed,
        "errors": errors,
        "executed_at": datetime.utcnow().isoformat()
    }

def send_nudges_to_unresponded_sessions() -> Dict[str, Any]:
    """
    Cron Job Function:
    Finds ongoing sessions where the farmer has NOT yet responded with feedback,
    and sends an Agro-Chrono evening leisure nudge via WhatsApp.
    """
    db = get_db()
    now = datetime.utcnow().isoformat()
    
    cursor = db[ONGOING_COLLECTION].find({
        "has_responded": {"$ne": True},
        "status": {"$in": ["AWAITING_FEEDBACK", "NUDGED"]}
    })
    
    nudged = []
    from helpers.twilio_service import send_nudge_via_whatsapp
    
    for doc in cursor:
        phone = doc.get("phone_number")
        if not phone:
            continue
        crop = doc.get("crop", "Wheat")
        
        try:
            nudge_res = send_nudge_via_whatsapp(phone_number=phone, crop=crop)
            db[ONGOING_COLLECTION].update_one(
                {"_id": doc["_id"]},
                {
                    "$inc": {"nudge_count": 1},
                    "$set": {
                        "status": "NUDGED",
                        "last_nudge_at": now,
                        "updated_at": now
                    }
                }
            )
            nudged.append({
                "session_id": str(doc["_id"]),
                "phone": phone,
                "crop": crop,
                "nudge_res": nudge_res
            })
        except Exception as e:
            logger.error(f"Failed to send nudge to {phone}: {e}")
            
    logger.info(f"Dispatched {len(nudged)} evening leisure nudges to unresponded farmers.")
    return {
        "status": "success",
        "nudges_sent_count": len(nudged),
        "nudged_sessions": nudged,
        "executed_at": now
    }

def run_unresponded_farmer_nudge_cron() -> Dict[str, Any]:
    """
    Scheduled Daily Cron Job:
    Runs everyday at 7:00 PM IST (19:00 IST) and 9:00 PM IST (21:00 IST).
    ONLY sends feedback reminder message with Yes/No interactive buttons attached
    to those farmers who haven't given any feedback yet.
    Feedback is pushed to GDB immediately as soon as a farmer gives feedback,
    so this cron job focuses exclusively on unresponded farmers.
    """
    now_ist = datetime.now().isoformat()
    logger.info(f"CRON: Executing Unresponded Farmer Nudge at {now_ist}...")
    
    nudge_summary = send_nudges_to_unresponded_sessions()
    
    summary = {
        "status": "success",
        "cron_job": "unresponded_farmer_nudge_cron",
        "executed_at": datetime.utcnow().isoformat(),
        "total_nudged": nudge_summary.get("nudges_sent_count", 0),
        "nudges": nudge_summary
    }
    logger.info(f"CRON: Finished Unresponded Farmer Nudge run: {summary}")
    return summary

# Backward-compatible alias
run_evening_nudge_and_push_cron = run_unresponded_farmer_nudge_cron

def get_ongoing_sessions(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves all active documents from ongoing_farmer_sessions collection."""
    db = get_db()
    cursor = db[ONGOING_COLLECTION].find({}).sort("updated_at", -1).limit(limit)
    items = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        items.append(doc)
    return items

def delete_ongoing_session(session_id: str) -> bool:
    """Manually deletes a session from ongoing_farmer_sessions."""
    db = get_db()
    try:
        obj_id = ObjectId(session_id)
        res = db[ONGOING_COLLECTION].delete_one({"_id": obj_id})
    except Exception:
        res = db[ONGOING_COLLECTION].delete_one({"_id": session_id})
    return res.deleted_count > 0
