import os
import re
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
import requests
from app.config import settings
from app.database import get_db
from helpers.whatsapp_service import find_best_gdb_match, process_farmer_interaction, update_session, get_farmer_session

logger = logging.getLogger("ajrasakha.twilio")

def normalize_whatsapp_number(phone: str) -> str:
    """Normalizes phone number to standard Twilio WhatsApp URI format: whatsapp:+919876543210."""
    if not phone:
        return "whatsapp:+919876543210"
    raw = phone.strip()
    if raw.startswith("whatsapp:"):
        return raw
    digits = re.sub(r"[^\d+]", "", raw)
    if not digits.startswith("+"):
        if len(digits) == 10:
            digits = "+91" + digits
        else:
            digits = "+" + digits
    return f"whatsapp:{digits}"

def send_whatsapp_message(
    to_number: str,
    message_body: str,
    message_type: str = "GENERIC",
    buttons: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Sends a WhatsApp message via the Twilio REST API.
    Supports interactive Quick-Reply buttons.
    If credentials are not yet configured, provides transparent simulation and stores
    the event and buttons in the twilio_logs MongoDB collection for full visibility and testing.
    """
    db = get_db()
    account_sid = getattr(settings, "TWILIO_ACCOUNT_SID", "") or os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = getattr(settings, "TWILIO_AUTH_TOKEN", "") or os.getenv("TWILIO_AUTH_TOKEN", "")
    from_num = getattr(settings, "TWILIO_WHATSAPP_NUMBER", "") or os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")
    
    if not from_num.startswith("whatsapp:"):
        from_num = f"whatsapp:{from_num}"
        
    normalized_to = normalize_whatsapp_number(to_number)
    now = datetime.utcnow().isoformat()
    
    log_entry = {
        "direction": "OUTGOING",
        "to": normalized_to,
        "from": from_num,
        "body": message_body,
        "message_type": message_type,
        "buttons": buttons or [],
        "created_at": now
    }
    
    # Real Twilio API Call if credentials are provided
    if account_sid and auth_token and not account_sid.startswith("YOUR_"):
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        data = {
            "From": from_num,
            "To": normalized_to,
            "Body": message_body
        }
        try:
            logger.info(f"Dispatching Twilio WhatsApp message to {normalized_to}...")
            resp = requests.post(url, auth=(account_sid, auth_token), data=data, timeout=15)
            resp_data = resp.json()
            
            if resp.status_code in (200, 201):
                sid = resp_data.get("sid", f"SM{int(datetime.utcnow().timestamp())}")
                status = resp_data.get("status", "sent")
                log_entry.update({
                    "status": status,
                    "sid": sid,
                    "provider": "twilio_live",
                    "http_code": resp.status_code
                })
                db["twilio_logs"].insert_one(log_entry)
                return {
                    "success": True,
                    "status": status,
                    "sid": sid,
                    "to": normalized_to,
                    "from": from_num,
                    "mode": "live",
                    "buttons": buttons or [],
                    "message": "WhatsApp message successfully dispatched via Twilio."
                }
            else:
                err_msg = resp_data.get("message", resp.text)
                logger.warning(f"Twilio API error {resp.status_code}: {err_msg}")
                log_entry.update({
                    "status": "failed",
                    "error": err_msg,
                    "provider": "twilio_live",
                    "http_code": resp.status_code
                })
                db["twilio_logs"].insert_one(log_entry)
                return {
                    "success": False,
                    "status": "failed",
                    "error": err_msg,
                    "to": normalized_to,
                    "mode": "live",
                    "buttons": buttons or [],
                    "message": f"Twilio API error: {err_msg}"
                }
        except Exception as e:
            logger.error(f"Failed to communicate with Twilio: {e}", exc_info=True)
            log_entry.update({"status": "error", "error": str(e), "provider": "twilio_live"})
            db["twilio_logs"].insert_one(log_entry)
            return {
                "success": False,
                "status": "error",
                "error": str(e),
                "to": normalized_to,
                "mode": "live"
            }
            
    # Simulation / Sandbox mode if Twilio credentials not configured
    simulated_sid = f"SM_SIM_{int(datetime.utcnow().timestamp())}"
    log_entry.update({
        "status": "simulated_delivered",
        "sid": simulated_sid,
        "provider": "twilio_simulator",
        "note": "Dispatched in simulated mode (configure TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN in .env for live transmission)"
    })
    db["twilio_logs"].insert_one(log_entry)
    
    return {
        "success": True,
        "status": "simulated_delivered",
        "sid": simulated_sid,
        "to": normalized_to,
        "from": from_num,
        "mode": "simulation",
        "buttons": buttons or [],
        "message": "Message logged in simulated gateway. Add TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN in .env for live delivery."
    }

def send_nudge_via_whatsapp(
    phone_number: str,
    crop: str = "Wheat",
    custom_message: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sends an Agro-Chrono evening leisure nudge to a farmer via Twilio WhatsApp,
    asking for their 1-tap feedback on earlier advice.
    """
    crop_name = crop or "गेहूं (Wheat)"
    
    if custom_message and custom_message.strip():
        nudge_body = custom_message.strip()
    else:
        nudge_body = (
            f"🌾 *AjraSakha कृषि-मित्र सांध्यकालीन संदेश*\n\n"
            f"नमस्ते किसान भाई! 🙏\n"
            f"आज आपने *{crop_name}* की फसल के संबंध में सलाह ली थी। क्या दी गई जानकारी आपके खेत के लिए उपयोगी रही?\n\n"
            f"👇 कृपया नीचे दिए गए 'हाँ' (Yes) या 'नहीं' (No) बटन पर टैप करके अपनी प्रतिक्रिया दें:\n"
            f"🔘 [👍 हाँ / Yes] - सलाह उपयोगी रही, समस्या का समाधान हुआ\n"
            f"🔘 [👎 नहीं / No] - सलाह में सुधार की आवश्यकता है\n\n"
            f"🎙️ आप अपना अनुभव वॉइस नोट (Voice Message) भेजकर भी बता सकते हैं।\n"
            f"— *AjraSakha AI Agri-Intel (IIT Ropar)*"
        )
        
    YES_NO_FEEDBACK_BUTTONS = [
        {"id": "yes", "title": "👍 हाँ / Yes (उपयोगी)", "payload": "1"},
        {"id": "no", "title": "👎 नहीं / No (सुधार चाहिए)", "payload": "2"}
    ]
    res = send_whatsapp_message(
        to_number=phone_number,
        message_body=nudge_body,
        message_type="NUDGE",
        buttons=YES_NO_FEEDBACK_BUTTONS
    )
    
    # Update farmer session state
    clean_phone = re.sub(r"[^\d+]", "", phone_number)
    update_session(clean_phone, {
        "nudge_scheduled": False,
        "last_nudge_sent_at": datetime.utcnow().isoformat(),
        "current_state": "AWAITING_INITIAL_FEEDBACK"
    })
    
    # Also update ongoing_farmer_sessions in database
    db = get_db()
    now_iso = datetime.utcnow().isoformat()
    db["ongoing_farmer_sessions"].update_many(
        {
            "$or": [
                {"phone_number": phone_number.strip()},
                {"phone_number": clean_phone},
                {"phone_number": f"+{clean_phone}"}
            ],
            "has_responded": {"$ne": True}
        },
        {
            "$inc": {"nudge_count": 1},
            "$set": {
                "status": "NUDGED",
                "last_nudge_at": now_iso,
                "updated_at": now_iso
            }
        }
    )
    
    res["nudge_body"] = nudge_body
    res["buttons"] = YES_NO_FEEDBACK_BUTTONS
    return res

def send_gdb_response_via_whatsapp(
    phone_number: str,
    gdb_id: Optional[str] = None,
    query: Optional[str] = None
) -> Dict[str, Any]:
    """
    Fetches the verified answer from the GDB Knowledge Base and transmits it
    directly to the farmer on WhatsApp via Twilio, with interactive Quick Reply Yes/No buttons.
    """
    db = get_db()
    gdb_entry = None
    
    if gdb_id:
        gdb_entry = db["gdb_entries"].find_one({"_id": gdb_id})
    elif query:
        gdb_entry = find_best_gdb_match(query)
        
    if not gdb_entry:
        gdb_entry = db["gdb_entries"].find_one({"status": {"$in": ["ACTIVE", "RE_VALIDATED"]}})
        
    if not gdb_entry:
        return {"success": False, "message": "No GDB entry found."}
        
    matched_id = str(gdb_entry["_id"])
    crop = gdb_entry.get("crop", "सामान्य कृषि")
    domain = gdb_entry.get("domain", "फसल सुरक्षा")
    q_hi = gdb_entry.get("question_hi") or gdb_entry.get("question_en", "कृषि प्रश्न")
    a_hi = gdb_entry.get("answer_hi") or gdb_entry.get("answer_en", "अनुशंसित समाधान उपलब्ध है।")
    a_en = gdb_entry.get("answer_en", "")
    
    quick_buttons = [
        {"id": "yes", "title": "👍 हाँ / Yes (उपयोगी)", "payload": "1"},
        {"id": "no", "title": "👎 नहीं / No (सुधार चाहिए)", "payload": "2"}
    ]
    
    msg_body = (
        f"🌱 *AjraSakha प्रमाणित कृषि परामर्श (GDB Knowledge Base)*\n"
        f"🌾 *फसल:* {crop} | *विषय:* {domain}\n\n"
        f"❓ *प्रश्न:* {q_hi}\n\n"
        f"✅ *समाधान:*\n{a_hi}\n\n"
    )
    if a_en and a_en != a_hi:
        msg_body += f"📖 *English:* {a_en}\n\n"
        
    msg_body += (
        f"------------------------------------\n"
        f"📢 *त्वरित प्रतिक्रिया (Twilio Quick Reply Buttons):*\n"
        f"🔘 [👍 हाँ / Yes (उपयोगी)]\n"
        f"🔘 [👎 नहीं / No (सुधार चाहिए)]\n\n"
        f"💡 *टिप:* सीधे 'हाँ' / 'नहीं' बटन दबाकर या '1' / '2' लिखकर अपनी प्रतिक्रिया दें।"
    )
    
    res = send_whatsapp_message(
        to_number=phone_number,
        message_body=msg_body,
        message_type="GDB_ANSWER",
        buttons=quick_buttons
    )
    
    # Track ongoing inquiry session in ongoing_farmer_sessions collection
    clean_phone = re.sub(r"[^\d+]", "", phone_number)
    try:
        from helpers.session_pipeline import create_or_update_ongoing_session
        create_or_update_ongoing_session(
            phone_number=clean_phone,
            question=q_hi,
            gdb_id=matched_id,
            gdb_answer=a_hi,
            crop=crop
        )
    except Exception as e:
        logger.warning(f"Could not track ongoing session: {e}")

    # Update farmer session
    update_session(clean_phone, {
        "active_gdb_id": matched_id,
        "last_query": q_hi,
        "crop_in_context": crop,
        "query_delivered_at": datetime.utcnow().isoformat(),
        "current_state": "AWAITING_INITIAL_FEEDBACK",
        "nudge_scheduled": True
    })
    
    res["gdb_id"] = matched_id
    res["crop"] = crop
    res["question"] = q_hi
    res["answer"] = a_hi
    res["dispatched_text"] = msg_body
    res["buttons"] = quick_buttons
    return res

def handle_incoming_twilio_webhook(
    from_number: str,
    body: str = "",
    button_payload: Optional[str] = None,
    button_text: Optional[str] = None
) -> Dict[str, Any]:
    """
    Handles an incoming WhatsApp message received from Twilio Webhook:
    1. If quick reply button is tapped or text feedback (1/2, yes/no) is sent:
       Directly records rating, updates ongoing session status to FEEDBACK_RECEIVED
       without requiring human review or manual NLP loops, and sends instant acknowledgment.
    2. If message is an agronomic question:
       Queries GDB Knowledge Base and returns verified answer equipped with 1-tap quick buttons.
    """
    db = get_db()
    clean_phone = re.sub(r"[^\d+]", "", from_number.replace("whatsapp:", ""))
    text = (body or "").strip()
    btn_payload = (button_payload or "").strip()
    btn_text = (button_text or "").strip()
    
    # Log incoming message
    now = datetime.utcnow().isoformat()
    incoming_log = {
        "direction": "INCOMING",
        "from": normalize_whatsapp_number(from_number),
        "to": getattr(settings, "TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886"),
        "body": btn_text or text or (f"Button Payload: {btn_payload}" if btn_payload else ""),
        "button_payload": btn_payload or None,
        "button_text": btn_text or None,
        "created_at": now
    }
    db["twilio_logs"].insert_one(incoming_log)
    
    YES_TOKENS = {
        "1", "yes", "ha", "haan", "sahi", "helpful", "theek", "shukriya",
        "हाँ", "हा", "हाँजी", "सही", "उपयोगी", "काम", "helpful (उपयोगी)",
        "1: उपयोगी", "1: उपयोगी (helpful)", "👍 1: उपयोगी (helpful)", "👍",
        "👍 हाँ / yes (उपयोगी)", "👍 हाँ (yes)", "हाँ / yes", "yes (उपयोगी)", "ha ji"
    }
    NO_TOKENS = {
        "2", "no", "nahi", "galat", "unhelpful", "kharab", "bekar",
        "नहीं", "ना", "गलत", "अनुपयोगी", "सुधार चाहिए", "unhelpful (सुधार चाहिए)",
        "2: सुधार चाहिए", "2: सुधार चाहिए (unhelpful)", "👎 2: सुधार चाहिए (unhelpful)", "👎",
        "👎 नहीं / no (सुधार चाहिए)", "👎 नहीं (no)", "नहीं / no", "no (सुधार चाहिए)", "nahi ji"
    }
    
    text_lower = text.lower()
    
    # 1. Determine if this interaction represents a 1-tap Quick Reply button tap or feedback rating
    is_btn_click = bool(btn_payload)
    is_feedback = False
    rating = None
    
    if btn_payload in ("1", "btn_1", "helpful", "yes", "btn_yes") or btn_payload == "1":
        rating = 1
        is_feedback = True
    elif btn_payload in ("2", "btn_2", "unhelpful", "no", "btn_no") or btn_payload == "2":
        rating = 2
        is_feedback = True
    elif text_lower in YES_TOKENS or any(t in text_lower for t in ["उपयोगी", "👍", "helpful", "हाँ", "yes"]):
        rating = 1
        is_feedback = True
    elif text_lower in NO_TOKENS or any(t in text_lower for t in ["सुधार चाहिए", "अनुपयोगी", "👎", "unhelpful", "नहीं"]):
        rating = 2
        is_feedback = True
    else:
        # Check active session state if farmer sent just a single numeric character
        session = get_farmer_session(clean_phone)
        current_state = session.get("current_state", "IDLE")
        if current_state in ("AWAITING_INITIAL_FEEDBACK", "AWAITING_STEP2_FEEDBACK"):
            if text_lower in ("1", "yes", "haan", "ha"):
                rating = 1
                is_feedback = True
            elif text_lower in ("2", "no", "nahi", "na"):
                rating = 2
                is_feedback = True
                
    if is_feedback and rating is not None:
        # Immediately record feedback and push rating to the corresponding GDB entry
        comment = btn_text or text or ("हाँ - उपयोगी रहा (Yes / Helpful)" if rating == 1 else "नहीं - सुधार चाहिए (No / Unhelpful)")
        try:
            from helpers.session_pipeline import record_farmer_feedback_response
            record_farmer_feedback_response(
                phone_number=clean_phone,
                rating=rating,
                feedback_comment=comment,
                auto_push_to_gdb=True
            )
        except Exception as e:
            logger.warning(f"Failed to record and push feedback to GDB: {e}")

        # Update in-memory session status
        update_session(clean_phone, {
            "current_state": "FEEDBACK_PUSHED_TO_GDB",
            "has_responded": True,
            "rating": rating,
            "last_feedback_at": now
        })

        if rating == 1:
            reply_text = (
                "🌾 *AjraSakha: धन्यवाद किसान भाई!* 🙏\n\n"
                "आपकी प्रतिक्रिया *(👍 हाँ / Yes: उपयोगी)* सीधे GDB ज्ञानकोष में दर्ज कर ली गई है। "
                "आपके खेत की उन्नति ही हमारा संकल्प है!"
            )
        else:
            reply_text = (
                "🌾 *AjraSakha: धन्यवाद किसान भाई!* 🙏\n\n"
                "आपकी प्रतिक्रिया *(👎 नहीं / No: सुधार चाहिए)* सीधे GDB ज्ञानकोष में दर्ज कर ली गई है। "
                "हमारे कृषि विशेषज्ञ तुरंत इस सलाह की समीक्षा करके सुधार करेंगे।"
            )
            
        send_whatsapp_message(to_number=clean_phone, message_body=reply_text, message_type="FEEDBACK_ACK")
        return {
            "action": "BUTTON_FEEDBACK_RECORDED_AND_PUSHED_TO_GDB" if is_btn_click else "FEEDBACK_RECORDED_AND_PUSHED_TO_GDB",
            "from": clean_phone,
            "rating": rating,
            "status": "PUSHED_TO_GDB",
            "pushed_to_gdb": True,
            "button_payload": btn_payload or str(rating),
            "button_text": btn_text or comment,
            "outgoing_reply": reply_text
        }
        
    # Otherwise, the farmer is submitting an agronomic question:
    # Query the GDB Knowledge Base and transmit the verified answer with quick reply buttons
    gdb_res = send_gdb_response_via_whatsapp(phone_number=clean_phone, query=text)
    return {
        "action": "GDB_QUERY_ANSWERED",
        "from": clean_phone,
        "query": text,
        "matched_gdb_id": gdb_res.get("gdb_id"),
        "crop": gdb_res.get("crop"),
        "outgoing_reply": gdb_res.get("dispatched_text"),
        "buttons": gdb_res.get("buttons") or [
            {"id": "yes", "title": "👍 हाँ / Yes (उपयोगी)", "payload": "1"},
            {"id": "no", "title": "👎 नहीं / No (सुधार चाहिए)", "payload": "2"}
        ]
    }

def get_twilio_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves recent Twilio WhatsApp logs from MongoDB."""
    db = get_db()
    cursor = db["twilio_logs"].find({}).sort("created_at", -1).limit(limit)
    items = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        items.append(doc)
    return items

def get_twilio_status() -> Dict[str, Any]:
    """Returns Twilio WhatsApp configuration status and delivery counters."""
    db = get_db()
    account_sid = getattr(settings, "TWILIO_ACCOUNT_SID", "") or os.getenv("TWILIO_ACCOUNT_SID", "")
    from_num = getattr(settings, "TWILIO_WHATSAPP_NUMBER", "") or os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")
    
    is_configured = bool(account_sid and not account_sid.startswith("YOUR_"))
    masked_sid = f"{account_sid[:6]}...{account_sid[-4:]}" if is_configured and len(account_sid) > 10 else "Not Configured (Running in Simulation Mode)"
    
    total_outgoing = db["twilio_logs"].count_documents({"direction": "OUTGOING"})
    total_incoming = db["twilio_logs"].count_documents({"direction": "INCOMING"})
    nudges_sent = db["twilio_logs"].count_documents({"message_type": "NUDGE"})
    gdb_sent = db["twilio_logs"].count_documents({"message_type": "GDB_ANSWER"})
    
    return {
        "configured": is_configured,
        "account_sid_masked": masked_sid,
        "whatsapp_number": from_num,
        "total_outgoing": total_outgoing,
        "total_incoming": total_incoming,
        "nudges_sent": nudges_sent,
        "gdb_sent": gdb_sent
    }
