from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class WhatsAppSimulateRequest(BaseModel):
    phone_number: str = "919876543210"
    message_body: Optional[str] = ""
    farmer_state: str = "Punjab"
    farmer_district: str = "Ludhiana"
    language: str = "hi"
    input_type: str = "TEXT" # "TEXT", "BUTTON_CLICK", "VOICE_NOTE", "ROOT_CAUSE"
    voice_audio_note: Optional[str] = None # simulated spoken words
    button_value: Optional[int] = None # 1 for Yes, 2 for No
    root_cause_selected: Optional[str] = None

class WhatsAppSimulateResponse(BaseModel):
    status: str
    step: str # "ANSWER_DELIVERED", "FEEDBACK_RECORDED", "AWAITING_ROOT_CAUSE", "ROOT_CAUSE_CAPTURED", "SCHEDULED_NUDGE_SENT"
    phone_number: str
    outgoing_messages: List[str]
    quick_reply_buttons: Optional[List[Dict[str, Any]]] = None
    root_cause_options: Optional[List[Dict[str, Any]]] = None
    gdb_id: Optional[str] = None
    feedback_recorded: Optional[Dict[str, Any]] = None
    voice_analysis: Optional[Dict[str, Any]] = None
    session_state: str
