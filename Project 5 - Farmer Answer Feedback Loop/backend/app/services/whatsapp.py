"""
WhatsApp Cloud API service — sends messages to farmers.
Falls back gracefully if no API credentials are configured.
"""
import httpx
import logging
from app.config import settings

logger = logging.getLogger(__name__)


async def send_whatsapp_text(to_phone: str, message: str) -> bool:
    """Send a plain text WhatsApp message to a farmer."""
    if not settings.whatsapp_api_token or not settings.whatsapp_phone_number_id:
        logger.warning("WhatsApp credentials not configured — message not sent (simulation mode)")
        return False

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_phone,
        "type": "text",
        "text": {"preview_url": False, "body": message},
    }

    headers = {
        "Authorization": f"Bearer {settings.whatsapp_api_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                settings.whatsapp_api_url,
                json=payload,
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            logger.info(f"WhatsApp message sent to {to_phone}")
            return True
        except Exception as e:
            logger.error(f"WhatsApp send failed: {e}")
            return False


async def send_feedback_prompt(to_phone: str, gdb_question: str) -> bool:
    """
    After delivering a GDB answer, send the feedback follow-up prompt.
    """
    msg = (
        "Was this answer helpful? 🌾\n\n"
        "Reply *1* for 👍 Yes\n"
        "Reply *2* for 👎 No\n\n"
        "Your feedback helps us improve answers for all farmers."
    )
    return await send_whatsapp_text(to_phone, msg)


async def send_answer_to_farmer(to_phone: str, question: str, answer: str) -> bool:
    """Send the GDB answer to the farmer."""
    msg = f"*Answer to your question:*\n\n{answer}\n\n_Source: Ajrasakha Expert Knowledge Base_"
    return await send_whatsapp_text(to_phone, msg)


def format_whatsapp_incoming(webhook_body: dict) -> list[dict]:
    """
    Parse the WhatsApp Cloud API webhook payload and extract messages.
    Returns a list of {from, body, message_id} dicts.
    """
    messages = []
    try:
        entries = webhook_body.get("entry", [])
        for entry in entries:
            changes = entry.get("changes", [])
            for change in changes:
                value = change.get("value", {})
                msgs = value.get("messages", [])
                for msg in msgs:
                    if msg.get("type") == "text":
                        messages.append({
                            "from": msg.get("from"),
                            "body": msg.get("text", {}).get("body", "").strip(),
                            "message_id": msg.get("id"),
                        })
    except Exception as e:
        logger.error(f"Error parsing WhatsApp webhook: {e}")
    return messages
