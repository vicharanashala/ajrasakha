from fastapi import APIRouter, HTTPException, Request
from helpers.whatsapp_service import process_farmer_interaction, get_farmer_session, update_session
from helpers.session import WhatsAppSimulateRequest

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

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
