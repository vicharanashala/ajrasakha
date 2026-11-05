import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class ChatQueryRequest(BaseModel):
    query: str
    language: str = "English"
    state: Optional[str] = None
    domain: Optional[str] = None
    source: str = "web"


class ChatQueryResponse(BaseModel):
    question: str
    answer: str
    entry_id: Optional[str] = None
    domain: Optional[str] = None
    language: str = "English"
    confidence: float = 1.0
    match_type: str = "existing"
    show_disclaimer: bool = False
    disclaimer_message: Optional[str] = None


@router.post("/chat-query", response_model=ChatQueryResponse)
def chat_query(request: ChatQueryRequest):
    """
    Chat query endpoint - uses smart AI question matcher.
    Project requirement: 2-hour disclaimer for new questions.
    Supports multilingual questions with auto language detection.
    """
    try:
        from services.question_matcher import matcher
    except ImportError:
        # Try to add telegram-bot services to path
        telegram_path = project_root / "telegram-bot"
        if str(telegram_path) not in sys.path:
            sys.path.insert(0, str(telegram_path))
        try:
            from services.question_matcher import matcher
        except ImportError:
            raise HTTPException(status_code=500, detail="Question matcher not available")

    # Auto-detect query language only if user chose "Auto Detect"
    from services.question_matcher import detect_language, sanitize_language, resolve_language
    if not request.language or request.language.strip().lower() in ("auto", "", "auto detect"):
        request_lang = resolve_language(detect_language(request.query))
    else:
        request_lang = resolve_language(request.language)

    answer_text, gdb_entry = matcher.find_or_generate(
        query=request.query,
        language=request_lang,
        source=request.source
    )

    return ChatQueryResponse(
        question=request.query,
        answer=answer_text,
        entry_id=gdb_entry.get("_id"),
        domain=gdb_entry.get("domain"),
        language=request_lang,
        confidence=gdb_entry.get("_confidence", 1.0),
        match_type=gdb_entry.get("_match_type", "existing"),
        show_disclaimer=gdb_entry.get("_show_disclaimer", False),
        disclaimer_message=gdb_entry.get("_disclaimer_message")
    )


@router.post("/submit-feedback")
def submit_feedback(feedback: dict):
    """Submit feedback for a chat answer"""
    from datetime import datetime
    from shared.mongodb import get_db

    db = get_db()

    doc = {
        "gdb_entry_id": feedback.get("gdb_entry_id"),
        "farmer_id": feedback.get("farmer_id", "dashboard_user"),
        "message_id": feedback.get("message_id", f"dash_{datetime.now().strftime('%Y%m%d%H%M%S')}"),
        "response": feedback.get("response"),
        "state": feedback.get("state"),
        "language": feedback.get("language", "English"),
        "domain": feedback.get("domain", "Chat"),
        "timestamp": datetime.utcnow(),
        "status": "captured"
    }

    db.feedback.insert_one(doc)

    return {"message": "Feedback recorded successfully", "status": "ok"}