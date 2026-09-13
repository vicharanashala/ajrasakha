"""
WhatsApp Webhook — handles incoming messages from farmers.
GET  /webhook/whatsapp  → verification handshake
POST /webhook/whatsapp  → process incoming message (answer or feedback reply)
POST /webhook/simulate  → dashboard simulation (no real WhatsApp needed)
"""
from fastapi import APIRouter, Request, Response, Query, Depends, HTTPException, Body
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.config import settings
from app.services.whatsapp import (
    format_whatsapp_incoming,
    send_answer_to_farmer,
    send_feedback_prompt,
)
from app.services.groq_service import (
    get_groq_chat_response,
    _is_greeting_or_off_topic,
)
from app.services.flagging_service import update_gdb_helpfulness, check_and_flag_entry
from datetime import datetime, timezone, timedelta
import uuid
import logging

router = APIRouter(prefix="/webhook", tags=["WhatsApp Webhook"])
logger = logging.getLogger(__name__)


@router.get("/whatsapp")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """WhatsApp Cloud API webhook verification endpoint."""
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        logger.info("WhatsApp webhook verified successfully")
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/whatsapp")
async def receive_whatsapp_message(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Receives incoming WhatsApp messages.
    - If message is a question → search GDB, send answer + feedback prompt
    - If message is '1' or '2' → capture feedback for pending session
    """
    body = await request.json()
    messages = format_whatsapp_incoming(body)

    for msg in messages:
        farmer_phone = msg["from"]
        text = msg["body"].strip()
        message_id = msg["message_id"]

        session = await db.whatsapp_sessions.find_one({"farmer_phone": farmer_phone})

        if session and session.get("state") == "awaiting_feedback" and text in ("1", "2"):
            await _capture_feedback(db, session, text, message_id)
        else:
            await _handle_question(db, farmer_phone, text)

    return {"status": "ok"}


@router.post("/simulate", summary="Simulate WhatsApp flow (no real WhatsApp needed)")
async def simulate_whatsapp(
    payload: dict = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Simulation endpoint for the dashboard WhatsApp Simulator page.
    Accepts { farmer_phone, message } and returns the bot response.
    Uses GROQ for greetings and conversational messages.
    """
    farmer_phone = payload.get("farmer_phone", "+919999999999")
    text = payload.get("message", "").strip()

    if not text:
        return {
            "type": "no_answer",
            "message": "Please type a message or farming question.",
        }

    session = await db.whatsapp_sessions.find_one({"farmer_phone": farmer_phone})

    # If waiting for feedback and user replied 1 or 2
    if session and session.get("state") == "awaiting_feedback" and text in ("1", "2"):
        result = await _capture_feedback(db, session, text, str(uuid.uuid4()))
        helpful = text == "1"
        return {
            "type": "feedback_captured",
            "response": text,
            "gdb_entry_id": session.get("pending_feedback_for"),
            "message": (
                "Thank you! Glad it helped. Feel free to ask another farming question anytime."
                if helpful else
                "Thank you for your feedback! We will review this answer and improve it. Ask another question anytime."
            ),
            **result,
        }

    # Handle the incoming text
    result = await _handle_question(db, farmer_phone, text)
    return result


async def _handle_question(db: AsyncIOMotorDatabase, farmer_phone: str, question: str) -> dict:
    """
    Main handler:
    1. Detect if greeting/off-topic → use GROQ to respond conversationally
    2. Otherwise search GDB for a matching answer
    3. Use GROQ to enhance/format the GDB answer if available
    4. Set up feedback session
    """
    question_lower = question.lower().strip()

    # ── GROQ-powered greeting / off-topic handler ─────────────────────────────
    if _is_greeting_or_off_topic(question):
        groq_reply = await get_groq_chat_response(question)
        if groq_reply:
            return {
                "type": "conversational",
                "message": groq_reply,
                "gdb_entry_id": None,
                "answer": groq_reply,
                "domain": "General",
                "follow_up": None,
            }
        # Fallback if GROQ not configured
        return {
            "type": "conversational",
            "message": (
                "Namaste! I am Ajrasakha, your agricultural assistant.\n\n"
                "I can help you with:\n"
                "- Crop diseases and treatments\n"
                "- Pest control methods\n"
                "- Fertilizer recommendations\n"
                "- Irrigation and soil health\n"
                "- Weather and market guidance\n\n"
                "Please ask me a farming question!"
            ),
            "gdb_entry_id": None,
            "answer": None,
            "domain": "General",
            "follow_up": None,
        }

    # ── GDB keyword search ────────────────────────────────────────────────────
    words = [w for w in question_lower.split() if len(w) > 3]
    query_conditions = []
    for word in words[:6]:
        query_conditions.append({"question": {"$regex": word, "$options": "i"}})
        query_conditions.append({"keywords": {"$elemMatch": {"$regex": word, "$options": "i"}}})
        query_conditions.append({"answer": {"$regex": word, "$options": "i"}})

    gdb_entry = None
    if query_conditions:
        # Try to find a matching entry, prefer entries with more responses
        gdb_entry = await db.gdb_entries.find_one(
            {"$or": query_conditions},
            sort=[("total_responses", -1)],
        )

    # Fallback: GROQ handles directly if no GDB match
    if not gdb_entry:
        groq_reply = await get_groq_chat_response(question)
        if groq_reply:
            # No GDB entry, so no feedback session needed
            return {
                "type": "groq_answer",
                "message": groq_reply,
                "gdb_entry_id": None,
                "answer": groq_reply,
                "domain": "General",
                "question_matched": question,
                "follow_up": None,
            }
        # Last resort: hard fallback
        return {
            "type": "no_answer",
            "message": (
                "I could not find a specific answer in our knowledge base for your question. "
                "Please try rephrasing, or contact your local agricultural officer (KVK) for assistance."
            ),
        }

    gdb_id = gdb_entry["_id"]
    raw_answer = gdb_entry["answer"]

    # ── GROQ enhances the GDB answer ─────────────────────────────────────────
    enhanced_answer = await get_groq_chat_response(question, gdb_answer=raw_answer)
    final_answer = enhanced_answer if enhanced_answer else raw_answer

    # ── Set up feedback session ───────────────────────────────────────────────
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    await db.whatsapp_sessions.update_one(
        {"farmer_phone": farmer_phone},
        {"$set": {
            "farmer_phone": farmer_phone,
            "pending_feedback_for": gdb_id,
            "last_question": question,
            "state": "awaiting_feedback",
            "created_at": datetime.now(timezone.utc),
            "expires_at": expires_at,
        }},
        upsert=True,
    )

    return {
        "type": "answer_delivered",
        "gdb_entry_id": gdb_id,
        "question_matched": gdb_entry["question"],
        "answer": final_answer,
        "domain": gdb_entry.get("domain"),
        "follow_up": "Was this helpful? Reply 1 for Yes, 2 for No",
    }


async def _capture_feedback(
    db: AsyncIOMotorDatabase, session: dict, response: str, message_id: str
) -> dict:
    """Record farmer feedback and update GDB helpfulness score."""
    gdb_entry_id = session["pending_feedback_for"]
    farmer_phone = session["farmer_phone"]

    gdb_entry = await db.gdb_entries.find_one({"_id": gdb_entry_id})

    fb_doc = {
        "_id": f"fb_{gdb_entry_id}_{uuid.uuid4().hex[:8]}",
        "gdb_entry_id": gdb_entry_id,
        "farmer_id": farmer_phone,
        "message_id": message_id,
        "response": response,
        "state": gdb_entry.get("state") if gdb_entry else None,
        "language": gdb_entry.get("language") if gdb_entry else None,
        "domain": gdb_entry.get("domain") if gdb_entry else None,
        "timestamp": datetime.now(timezone.utc),
        "status": "captured",
    }

    await db.feedback.insert_one(fb_doc)
    await update_gdb_helpfulness(db, gdb_entry_id)
    await check_and_flag_entry(db, gdb_entry_id)

    # Reset session to allow new questions
    await db.whatsapp_sessions.update_one(
        {"farmer_phone": farmer_phone},
        {"$set": {"state": "done"}}
    )

    logger.info(f"Feedback captured: {gdb_entry_id} → {response} from {farmer_phone}")

    updated_entry = await db.gdb_entries.find_one({"_id": gdb_entry_id})
    return {
        "gdb_entry_id": gdb_entry_id,
        "new_score": updated_entry.get("helpfulness_score", 0) if updated_entry else 0,
        "total_responses": updated_entry.get("total_responses", 0) if updated_entry else 0,
        "is_flagged": updated_entry.get("is_flagged", False) if updated_entry else False,
    }
