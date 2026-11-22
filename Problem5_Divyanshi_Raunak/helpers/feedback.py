from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

class FarmerFeedbackCreate(BaseModel):
    gdb_id: str
    farmer_phone: str = "919876543210"
    farmer_state: str = "Punjab"
    farmer_district: Optional[str] = "Ludhiana"
    language: str = "hi"
    input_channel: str = "WHATSAPP_BUTTON" # WHATSAPP_BUTTON, WHATSAPP_TEXT, WHATSAPP_VOICE
    rating: int # 1 = Helpful, 2 = Not Helpful
    voice_transcription: Optional[str] = None
    root_cause_category: Optional[str] = None # TOO_TECHNICAL, MEDICINE_UNAVAILABLE, UNCLEAR_DOSAGE, INEFFECTIVE, GENERAL_POSITIVE
    query_text: str = ""

class FarmerFeedback(BaseModel):
    id: str = Field(alias="_id")
    gdb_id: str
    farmer_phone_hash: str
    farmer_state: str
    farmer_district: Optional[str] = ""
    language: str
    input_channel: str
    rating: int
    voice_transcription: Optional[str] = None
    root_cause_category: Optional[str] = None
    query_text: str
    scheduled_nudge_delivered: bool = False
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    class Config:
        populate_by_name = True
