from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from typing import Optional
from helpers.whatsapp_service import process_farmer_interaction, get_farmer_session, update_session
from helpers.session import WhatsAppSimulateRequest
from helpers.twilio_service import (
    send_nudge_via_whatsapp,
    send_gdb_response_via_whatsapp,
    handle_incoming_twilio_webhook,
    get_twilio_logs,
    get_twilio_status
)

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

class SendNudgeRequest(BaseModel):
    phone_number: str
    crop: Optional[str] = "Wheat"
    custom_message: Optional[str] = None

class SendGdbRequest(BaseModel):
    phone_number: str
    gdb_id: Optional[str] = None
    query: Optional[str] = None

class SimulateIncomingRequest(BaseModel):
    from_number: str
    body: Optional[str] = ""
    button_payload: Optional[str] = None
    button_text: Optional[str] = None

# ---------------------------------------------------------------------------
# Twilio WhatsApp Endpoints
# ---------------------------------------------------------------------------

@router.get("/twilio/status")
def get_status():
    """Returns Twilio connection status and delivery metrics."""
    return get_twilio_status()

@router.get("/twilio/logs")
def get_logs(limit: int = 50):
    """Returns recent Twilio WhatsApp interaction and dispatch logs."""
    return get_twilio_logs(limit=limit)

@router.post("/twilio/send-nudge")
def send_nudge(payload: SendNudgeRequest):
    """Sends an Agro-Chrono evening leisure nudge to a farmer on WhatsApp via Twilio."""
    return send_nudge_via_whatsapp(
        phone_number=payload.phone_number,
        crop=payload.crop or "Wheat",
        custom_message=payload.custom_message
    )

@router.post("/twilio/send-gdb")
def send_gdb(payload: SendGdbRequest):
    """Sends a verified GDB answer to a farmer on WhatsApp via Twilio."""
    return send_gdb_response_via_whatsapp(
        phone_number=payload.phone_number,
        gdb_id=payload.gdb_id,
        query=payload.query
    )

@router.post("/twilio/simulate-incoming")
def simulate_incoming(payload: SimulateIncomingRequest):
    """
    Simulates an incoming WhatsApp message or interactive button click from a farmer.
    If the farmer taps a Quick Reply button or provides feedback (1/2), the ongoing
    session is immediately updated to FEEDBACK_RECEIVED without requiring text reviews.
    If the message is an agricultural question, it queries GDB and automatically
    returns the verified answer with Quick Reply buttons.
    """
    return handle_incoming_twilio_webhook(
        from_number=payload.from_number,
        body=payload.body or "",
        button_payload=payload.button_payload,
        button_text=payload.button_text
    )

@router.post("/twilio/webhook")
async def twilio_webhook(request: Request):
    """
    Official Twilio WhatsApp Webhook Endpoint.
    Configured in Twilio Console under 'When a message comes in'.
    Receives incoming farmer message (From, Body, ButtonPayload, ButtonText),
    handles Quick Reply button taps, queries GDB, and responds via WhatsApp.
    """
    try:
        content_type = request.headers.get("content-type", "")
        from_num = ""
        body = ""
        button_payload = None
        button_text = None
        
        if "application/x-www-form-urlencoded" in content_type:
            form_data = await request.form()
            from_num = form_data.get("From", "")
            body = form_data.get("Body", "")
            button_payload = form_data.get("ButtonPayload") or form_data.get("button_payload")
            button_text = form_data.get("ButtonText") or form_data.get("button_text")
        else:
            json_data = await request.json()
            from_num = json_data.get("From") or json_data.get("from", "")
            body = json_data.get("Body") or json_data.get("body", "")
            button_payload = json_data.get("ButtonPayload") or json_data.get("button_payload")
            button_text = json_data.get("ButtonText") or json_data.get("button_text")
            
        if not from_num and not body and not button_payload:
            return Response(content="<Response></Response>", media_type="application/xml")
            
        result = handle_incoming_twilio_webhook(
            from_number=from_num,
            body=body,
            button_payload=button_payload,
            button_text=button_text
        )
        
        # Return standard TwiML response
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <!-- Message dispatched via Twilio WhatsApp API -->
</Response>"""
        return Response(content=twiml, media_type="application/xml")
    except Exception as e:
        return Response(content=f"<Response><!-- Error: {str(e)} --></Response>", media_type="application/xml")

# ---------------------------------------------------------------------------
# Ongoing Farmer Sessions & Feedback Push Pipeline Endpoints
# ---------------------------------------------------------------------------

class FarmerQuestionRequest(BaseModel):
    phone_number: str
    question: str
    crop: Optional[str] = "Wheat"
    farmer_state: Optional[str] = "Punjab"

class FarmerFeedbackSubmitRequest(BaseModel):
    phone_number: Optional[str] = None
    session_id: Optional[str] = None
    rating: int # 1 = Helpful, 2 = Unhelpful
    feedback_comment: Optional[str] = None
    root_cause: Optional[str] = None

@router.post("/ask-question")
def ask_question(payload: FarmerQuestionRequest):
    """
    Farmer asks an agricultural question.
    Searches GDB Knowledge Catalog for certified answer,
    and creates/updates an ongoing session in ongoing_farmer_sessions.
    The question inquiry alone is NOT considered feedback.
    """
    from helpers.whatsapp_service import find_best_gdb_match
    from helpers.session_pipeline import create_or_update_ongoing_session
    
    gdb_match = find_best_gdb_match(payload.question)
    if not gdb_match:
        raise HTTPException(status_code=404, detail="No matching GDB entry found.")
        
    gdb_id = str(gdb_match["_id"])
    ans_hi = gdb_match.get("answer_hi") or gdb_match.get("answer_en", "")
    ans_en = gdb_match.get("answer_en", "")
    crop = gdb_match.get("crop", payload.crop or "Wheat")
    
    session = create_or_update_ongoing_session(
        phone_number=payload.phone_number,
        question=payload.question,
        gdb_id=gdb_id,
        gdb_answer=ans_hi,
        farmer_state=payload.farmer_state or "Punjab",
        crop=crop
    )
    
    return {
        "status": "success",
        "session": session,
        "gdb_id": gdb_id,
        "crop": crop,
        "answer_hi": ans_hi,
        "answer_en": ans_en,
        "question_hi": gdb_match.get("question_hi"),
        "question_en": gdb_match.get("question_en")
    }

@router.post("/submit-feedback")
def submit_feedback(payload: FarmerFeedbackSubmitRequest):
    """
    Farmer submits feedback (1 = Helpful, 2 = Unhelpful + root cause).
    Immediately pushes the rating to the corresponding GDB entry (updating upvotes/downvotes,
    evaluating flagging drift thresholds, inserting into farmer_feedback, and completing ongoing session)
    instead of waiting for a cron job.
    """
    from helpers.session_pipeline import record_farmer_feedback_response
    session = record_farmer_feedback_response(
        phone_number=payload.phone_number or "",
        rating=payload.rating,
        feedback_comment=payload.feedback_comment,
        root_cause=payload.root_cause,
        session_id=payload.session_id,
        auto_push_to_gdb=True
    )
    if not session:
        raise HTTPException(status_code=404, detail="No active ongoing session found.")
    return {"status": "success", "session": session, "pushed_to_gdb": True}

@router.post("/feedback/push/{session_id}")
def manual_push_feedback(session_id: str):
    """
    Manually pushes completed feedback to the corresponding GDB entry.
    1. Updates GDB metrics (upvotes, downvotes, helpful ratio).
    2. Notifies the farmer via WhatsApp that their feedback was received.
    3. Deletes the session from ongoing_farmer_sessions.
    """
    from helpers.session_pipeline import push_feedback_to_gdb
    res = push_feedback_to_gdb(session_id=session_id, is_manual=True)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

@router.post("/feedback/push-all")
def manual_push_all_feedback():
    """
    Manually pushes all pending feedback to their GDB entries and cleans up ongoing sessions.
    """
    from helpers.session_pipeline import push_all_pending_feedback_to_gdb
    return push_all_pending_feedback_to_gdb(is_manual=True)

@router.get("/ongoing-sessions")
def list_ongoing_sessions(limit: int = 50):
    """Returns all active documents in ongoing_farmer_sessions."""
    from helpers.session_pipeline import get_ongoing_sessions
    return get_ongoing_sessions(limit=limit)

@router.delete("/ongoing-sessions/{session_id}")
def remove_ongoing_session(session_id: str):
    """Deletes an ongoing session from the database."""
    from helpers.session_pipeline import delete_ongoing_session
    success = delete_ongoing_session(session_id)
    return {"status": "success" if success else "not_found", "deleted": success}

@router.post("/nudge/cron/run-now")
def run_nudge_cron_now():
    """
    Manually executes the unresponded farmers feedback nudge cron job
    (which normally runs at 7:00 PM and 9:00 PM IST) to send feedback reminder messages
    with Yes/No buttons attached only to farmers who have not yet responded.
    """
    from helpers.session_pipeline import run_unresponded_farmer_nudge_cron
    return run_unresponded_farmer_nudge_cron()

@router.get("/nudge/cron/status")
def get_nudge_cron_status():
    """Returns scheduler status for active cron jobs."""
    from helpers.scheduler import get_scheduler_info
    return get_scheduler_info()

# ---------------------------------------------------------------------------
# Legacy Session Management Endpoints
# ---------------------------------------------------------------------------

@router.post("/simulate-turn")
def simulate_interaction(payload: WhatsAppSimulateRequest):
    result = process_farmer_interaction(
        phone_number=payload.phone_number,
        message_body=payload.message_body or "",
        farmer_state=payload.farmer_state,
        language=payload.language,
        input_type=payload.input_type,
        voice_audio_note=payload.voice_audio_note,
        button_value=payload.button_value,
        root_cause_selected=payload.root_cause_selected
    )
    return result

@router.get("/session/{phone_number}")
def get_session(phone_number: str):
    sess = get_farmer_session(phone_number)
    if "_id" in sess:
        sess["_id"] = str(sess["_id"])
    return sess

@router.post("/session/{phone_number}/reset")
def reset_session(phone_number: str):
    update_session(phone_number, {
        "current_state": "IDLE",
        "active_gdb_id": None,
        "last_query": None,
        "nudge_scheduled": False
    })
    return {"status": "success", "message": f"Session for {phone_number} reset to IDLE"}

@router.post("/webhook")
async def webhook_handler(request: Request):
    try:
        body = await request.json()
        entry = body.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        messages = changes.get("value", {}).get("messages", [])
        if messages:
            msg = messages[0]
            from_phone = msg.get("from")
            text = msg.get("text", {}).get("body", "")
            res = process_farmer_interaction(phone_number=from_phone, message_body=text)
            return {"status": "success", "result": res}
        return {"status": "no_messages"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

