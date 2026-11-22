import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import re
from app.config import settings
from app.database import get_db
from helpers.flagging_pipeline import evaluate_and_flag_gdb
from helpers.voice_nlp_service import analyze_voice_feedback
from helpers.agro_chrono_service import format_evening_nudge_message

YES_TOKENS = {"1", "yes", "ha", "haan", "sahi", "helpful", "theek", "shukriya", "हाँ", "हा", "हाँजी", "सही", "उपयोगी", "काम", "ਹਾਂ", "ਹਾਂਜੀ", "ਠੀਕ"}
NO_TOKENS = {"2", "no", "nahi", "galat", "unhelpful", "kharab", "bekar", "नहीं", "ना", "गलत", "अनुपयोगी", "ਨਹੀਂ", "ਗਲਤ"}

def get_farmer_session(phone_number: str, state: str = "Punjab", language: str = "hi") -> Dict[str, Any]:
    db = get_db()
    session = db["farmer_sessions"].find_one({"phone_number": phone_number})
    if not session:
        session = {
            "phone_number": phone_number,
            "current_state": "IDLE",
            "active_gdb_id": None,
            "last_query": None,
            "crop_in_context": "Wheat",
            "language_preference": language,
            "farmer_state": state,
            "farmer_district": "Ludhiana" if state == "Punjab" else "Roorkee",
            "query_delivered_at": None,
            "nudge_scheduled": False,
            "updated_at": datetime.utcnow().isoformat()
        }
        db["farmer_sessions"].insert_one(session)
    return session

def update_session(phone_number: str, update_data: Dict[str, Any]):
    db = get_db()
    update_data["updated_at"] = datetime.utcnow().isoformat()
    db["farmer_sessions"].update_one({"phone_number": phone_number}, {"$set": update_data})

STOPWORDS = {
    "में", "की", "का", "के", "को", "से", "है", "हैं", "पर", "लिए", "और", "या",
    "क्या", "कैसे", "करें", "बताएं", "दीजिए", "होने", "वाले", "वाली", "उपाय", "बारे",
    "in", "on", "at", "to", "for", "the", "a", "an", "is", "are", "how", "what",
    "when", "which", "should", "be", "given", "during", "treatment", "उपचार"
}

def find_best_gdb_match(query: str) -> Optional[Dict[str, Any]]:
    """
    Finds the most accurate certified GDB entry matching the farmer's question.
    Scores relevance based on crop names, specific pest/disease sub-domains,
    canonical questions in Hindi/English, and discriminative keywords.
    """
    db = get_db()
    q_norm = (query or "").lower().strip()
    if not q_norm:
        return db["gdb_entries"].find_one({"status": {"$in": ["ACTIVE", "RE_VALIDATED"]}})

    # 1. Direct GDB ID detection (e.g., GDB-03102, GDB-09450)
    id_match = re.search(r'gdb[-_]?\d+', q_norm)
    if id_match:
        target_id = id_match.group(0).upper().replace('_', '-')
        entry = db["gdb_entries"].find_one({"_id": target_id})
        if entry:
            return entry

    # 2. Extract discriminative tokens (excluding conversational stopwords)
    q_tokens = [w for w in re.split(r'[\s,?.!/()]+', q_norm) if len(w) > 1 and w not in STOPWORDS]

    best_entry = None
    best_score = -1

    for entry in db["gdb_entries"].find():
        score = 0
        crop_text = (entry.get("crop") or "").lower()
        q_hi = (entry.get("question_hi") or "").lower()
        q_en = (entry.get("question_en") or "").lower()
        sub_dom = (entry.get("sub_domain") or "").lower()
        ans_hi = (entry.get("answer_hi") or "").lower()
        ans_en = (entry.get("answer_en") or "").lower()

        # Crop matching (Very High Priority: +30 pts)
        for token in q_tokens:
            if token in crop_text:
                score += 30
            if token in sub_dom:
                score += 25
            if token in q_hi or token in q_en:
                score += 20
            elif token in ans_hi or token in ans_en:
                score += 2

        # Direct phrase / substring bonus (+50 pts)
        if q_norm and (q_norm in q_hi or q_norm in q_en):
            score += 50

        if score > best_score:
            best_score = score
            best_entry = entry

    if best_score > 0 and best_entry:
        return best_entry

    return db["gdb_entries"].find_one({"status": {"$in": ["ACTIVE", "RE_VALIDATED"]}}) or db["gdb_entries"].find_one()

def process_farmer_interaction(
    phone_number: str,
    message_body: str = "",
    farmer_state: str = "Punjab",
    language: str = "hi",
    input_type: str = "TEXT", # "TEXT", "BUTTON_CLICK", "VOICE_NOTE", "ROOT_CAUSE", "TRIGGER_NUDGE"
    voice_audio_note: Optional[str] = None,
    button_value: Optional[int] = None,
    root_cause_selected: Optional[str] = None
) -> Dict[str, Any]:
    db = get_db()
    session = get_farmer_session(phone_number, farmer_state, language)
    current_state = session.get("current_state", "IDLE")
    active_gdb_id = session.get("active_gdb_id")
    crop_name = session.get("crop_in_context", "गेहूँ")
    phone_hash = hashlib.sha256(phone_number.encode()).hexdigest()[:16]
    
    # -------------------------------------------------------------
    # Action 1: Trigger Simulated Evening Scheduled Nudge
    # -------------------------------------------------------------
    if input_type == "TRIGGER_NUDGE":
        nudge_text = format_evening_nudge_message(crop_name, language)
        buttons = [
            {"id": "btn_yes", "title": "👍 हाँ, उपयोगी रहा", "value": 1},
            {"id": "btn_no", "title": "👎 नहीं, सुधार चाहिए", "value": 2}
        ]
        update_session(phone_number, {"current_state": "AWAITING_FEEDBACK", "nudge_scheduled": True})
        return {
            "status": "success",
            "step": "SCHEDULED_NUDGE_SENT",
            "phone_number": phone_number,
            "outgoing_messages": [nudge_text],
            "quick_reply_buttons": buttons,
            "gdb_id": active_gdb_id,
            "session_state": "AWAITING_FEEDBACK"
        }

    # -------------------------------------------------------------
    # Action 2: Handling Root Cause Selection on Downvote
    # -------------------------------------------------------------
    if input_type == "ROOT_CAUSE" or (current_state == "AWAITING_ROOT_CAUSE" and root_cause_selected):
        db["farmer_feedback"].update_one(
            {"gdb_id": active_gdb_id, "farmer_phone_hash": phone_hash},
            {"$set": {"root_cause_category": root_cause_selected}},
            sort=[("timestamp", -1)]
        )
        evaluate_and_flag_gdb(active_gdb_id)
        update_session(phone_number, {"current_state": "IDLE", "active_gdb_id": None})
        
        ack = (
            "प्रतिक्रिया दर्ज कर ली गई है! 🙏🌾\n"
            "हमने आपके द्वारा बताए गए कारण को नोट कर लिया है। हमारे कृषि वैज्ञानिक इसे तुरंत सुधारेंगे।"
            if language == "hi" else
            "Thank you! Your specific feedback has been shared with the ACE Agronomy Board for immediate revision. 🌾"
        )
        return {
            "status": "success",
            "step": "ROOT_CAUSE_CAPTURED",
            "phone_number": phone_number,
            "outgoing_messages": [ack],
            "gdb_id": active_gdb_id,
            "session_state": "IDLE"
        }

    # -------------------------------------------------------------
    # Action 3: Voice Note Ingestion
    # -------------------------------------------------------------
    if input_type == "VOICE_NOTE" and voice_audio_note:
        analysis = analyze_voice_feedback(voice_audio_note)
        rating = analysis["rating"]
        root_cause = analysis["root_cause"]
        
        fb_id = f"FB-VOICE-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{phone_hash[:4]}"
        db["farmer_feedback"].insert_one({
            "_id": fb_id,
            "gdb_id": active_gdb_id or "GDB-04821",
            "farmer_phone_hash": phone_hash,
            "farmer_state": farmer_state,
            "farmer_district": session.get("farmer_district", "Ludhiana"),
            "language": language,
            "input_channel": "WHATSAPP_VOICE",
            "rating": rating,
            "voice_transcription": voice_audio_note,
            "root_cause_category": root_cause,
            "query_text": session.get("last_query", "Voice Query"),
            "timestamp": datetime.utcnow().isoformat()
        })
        
        vote_field = "metrics.upvotes" if rating == 1 else "metrics.downvotes"
        db["gdb_entries"].update_one(
            {"_id": active_gdb_id or "GDB-04821"},
            {"$inc": {vote_field: 1, "metrics.voice_feedback_count": 1}}
        )
        flag_info = evaluate_and_flag_gdb(active_gdb_id or "GDB-04821")
        update_session(phone_number, {"current_state": "IDLE", "active_gdb_id": None})
        
        reply_msg = (
            f"🎙️ *आपकी आवाज़ सुनी गई:* \"{voice_audio_note}\"\n\n"
            f"धन्यवाद! आपकी प्रतिक्रिया दर्ज कर ली गई है। ({'👍 उपयोगी' if rating == 1 else '👎 सुधार चाहिए'})\n"
            "🌾 *किसान प्रतिदान:* आपकी प्रतिक्रिया से आपके क्षेत्र के अन्य 500+ किसान भाइयों को बेहतर सलाह मिलेगी!"
            if language == "hi" else
            f"🎙️ *Voice Note Processed:* \"{voice_audio_note}\"\nFeedback recorded successfully! 🌾"
        )
        return {
            "status": "success",
            "step": "FEEDBACK_RECORDED",
            "phone_number": phone_number,
            "outgoing_messages": [reply_msg],
            "gdb_id": active_gdb_id,
            "voice_analysis": analysis,
            "flagged_info": flag_info,
            "session_state": "IDLE"
        }

    # -------------------------------------------------------------
    # Action 4: Rating Button Click or Text '1'/'2'
    # -------------------------------------------------------------
    cleaned = message_body.strip().lower()
    is_voting = (
        input_type == "BUTTON_CLICK" or
        cleaned in YES_TOKENS or
        cleaned in NO_TOKENS or
        button_value in [1, 2]
    )
    
    if current_state == "AWAITING_FEEDBACK" and is_voting and active_gdb_id:
        if button_value:
            rating = button_value
        else:
            rating = 1 if cleaned in YES_TOKENS else 2
            
        fb_id = f"FB-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{phone_hash[:4]}"
        db["farmer_feedback"].insert_one({
            "_id": fb_id,
            "gdb_id": active_gdb_id,
            "farmer_phone_hash": phone_hash,
            "farmer_state": farmer_state,
            "farmer_district": session.get("farmer_district", "General"),
            "language": language,
            "input_channel": "WHATSAPP_BUTTON" if input_type == "BUTTON_CLICK" else "WHATSAPP_TEXT",
            "rating": rating,
            "root_cause_category": "GENERAL_POSITIVE" if rating == 1 else "AWAITING_REASON",
            "query_text": session.get("last_query", "WhatsApp query"),
            "timestamp": datetime.utcnow().isoformat()
        })
        
        vote_field = "metrics.upvotes" if rating == 1 else "metrics.downvotes"
        db["gdb_entries"].update_one(
            {"_id": active_gdb_id},
            {"$inc": {vote_field: 1, "metrics.total_queries": 1}}
        )
        flag_info = evaluate_and_flag_gdb(active_gdb_id)
        
        if rating == 2:
            # Trigger 1-Tap Root Cause Follow-up
            update_session(phone_number, {"current_state": "AWAITING_ROOT_CAUSE"})
            root_cause_msg = (
                "सुधार के लिए कृपया मुख्य कारण बताएं (1 टैप करें):"
                if language == "hi" else "Please select the primary reason for improvement:"
            )
            options = [
                {"id": "TOO_TECHNICAL", "label": "📖 भाषा बहुत कठिन / अंग्रेजी शब्द"},
                {"id": "MEDICINE_UNAVAILABLE_LOCALLY", "label": "🏪 बाजार/दुकान पर दवा नहीं मिली"},
                {"id": "UNCLEAR_DOSAGE", "label": "🧪 पानी व दवा की मात्रा अस्पष्ट"},
                {"id": "INEFFECTIVE", "label": "⚠️ दवा से बीमारी/कीट नहीं रुका"}
            ]
            return {
                "status": "success",
                "step": "AWAITING_ROOT_CAUSE",
                "phone_number": phone_number,
                "outgoing_messages": [root_cause_msg],
                "root_cause_options": options,
                "gdb_id": active_gdb_id,
                "session_state": "AWAITING_ROOT_CAUSE"
            }
        else:
            update_session(phone_number, {"current_state": "IDLE", "active_gdb_id": None})
            ack = (
                "धन्यवाद! आपकी प्रतिक्रिया दर्ज कर ली गई है। 🙏🌾\n"
                "🌾 *किसान प्रतिदान:* आपकी रेटिंग से आपके जिले के 500+ किसान भाइयों को बेहतर सलाह मिलेगी।"
                if language == "hi" else
                "Thank you! Your feedback helps 500+ fellow farmers receive validated agronomic advice. 🙏🌾"
            )
            return {
                "status": "success",
                "step": "FEEDBACK_RECORDED",
                "phone_number": phone_number,
                "outgoing_messages": [ack],
                "gdb_id": active_gdb_id,
                "flagged_info": flag_info,
                "session_state": "IDLE"
            }

    # -------------------------------------------------------------
    # Action 5: New or Follow-up Farmer Question (answers from GDB)
    # If the farmer sends a new question while in ANY state (including
    # AWAITING_FEEDBACK), we always answer from GDB and update the
    # active session context. A question is never treated as feedback.
    # -------------------------------------------------------------
    gdb_entry = find_best_gdb_match(message_body)
    matched_id = gdb_entry["_id"]
    crop = gdb_entry.get("crop", "गेहूँ")

    # If the farmer had an existing open session (AWAITING_FEEDBACK),
    # note that the previous question is being superseded by this new one.
    is_new_question_on_open_session = (
        current_state == "AWAITING_FEEDBACK" and active_gdb_id and active_gdb_id != matched_id
    )

    answer_text = (
        f"🌾 *अजरासखा कृषि सलाह (GDB: {matched_id})* 🌾\n\n"
        f"{gdb_entry.get('answer_hi', gdb_entry.get('answer_en'))}"
    )
    if is_new_question_on_open_session:
        answer_text = (
            f"📋 *नया प्रश्न स्वीकार किया गया* — पुराना सत्र अद्यतन किया जा रहा है।\n\n"
        ) + answer_text

    prompt_text = (
        "❓ *क्या यह सलाह आपके लिए उपयोगी रही? कृपया 1-टैप रेटिंग दें:*"
        if language == "hi" else
        "❓ *Was this agronomic advice helpful? Please provide 1-tap rating:*"
    )

    quick_buttons = [
        {"id": "btn_yes", "title": "👍 हाँ, उपयोगी था", "value": 1, "payload": 1},
        {"id": "btn_no", "title": "👎 नहीं, सुधार चाहिए", "value": 2, "payload": 2}
    ]

    update_session(phone_number, {
        "current_state": "AWAITING_FEEDBACK",
        "active_gdb_id": matched_id,
        "crop_in_context": crop,
        "last_query": message_body,
        "query_delivered_at": datetime.utcnow().isoformat(),
        "nudge_scheduled": False
    })

    db["gdb_entries"].update_one({"_id": matched_id}, {"$inc": {"metrics.total_queries": 1}})

    return {
        "status": "success",
        "step": "ANSWER_DELIVERED",
        "phone_number": phone_number,
        "outgoing_messages": [answer_text, prompt_text],
        "bot_response_text": f"{answer_text}\n\n{prompt_text}",
        "answer_text": answer_text,
        "prompt_text": prompt_text,
        "quick_reply_buttons": quick_buttons,
        "gdb_id": matched_id,
        "crop": crop,
        "is_new_question_on_open_session": is_new_question_on_open_session,
        "session_state": "AWAITING_FEEDBACK"
    }
