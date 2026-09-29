import sys
from pathlib import Path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import re
from typing import Optional, Dict, Any, Tuple
from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse
from shared.utils import Config
from config import TwilioConfig


class WhatsAppService:
    def __init__(self):
        self.client = None
        if TwilioConfig.is_configured():
            self.client = Client(TwilioConfig.ACCOUNT_SID, TwilioConfig.AUTH_TOKEN)
        self.whatsapp_number = TwilioConfig.WHATSAPP_NUMBER

    def send_message(self, to_number: str, body: str, media_url: Optional[str] = None) -> Optional[str]:
        if not self.client:
            print(f"[MOCK SEND] To: {to_number}, Body: {body}")
            return f"mock_{to_number}_{datetime.now().timestamp()}"

        try:
            message = self.client.messages.create(
                from_=f"whatsapp:{self.whatsapp_number}",
                body=body,
                to=f"whatsapp:{to_number}",
                media_url=[media_url] if media_url else None
            )
            return message.sid
        except Exception as e:
            print(f"Error sending message: {e}")
            return None

    def send_answer_with_feedback_request(
        self,
        to_number: str,
        answer: str,
        gdb_entry_id: str,
        state: Optional[str] = None,
        language: Optional[str] = None,
        domain: Optional[str] = None
    ) -> Tuple[Optional[str], Optional[str]]:
        full_message = f"{answer}\n\n___\nWas this helpful? Reply 1 for Yes, 2 for No"

        message_sid = self.send_message(to_number, full_message)
        return message_sid, "feedback_requested"

    def send_feedback_confirmation(self, to_number: str, is_helpful: bool) -> Optional[str]:
        if is_helpful:
            message = "Thank you for your feedback! 🙏 Glad this was helpful."
        else:
            message = "Thank you for your feedback. We'll work to improve this answer."

        return self.send_message(to_number, message)

    def parse_incoming_message(self, body: str) -> Tuple[str, Optional[str]]:
        body = body.strip().lower()

        if body == "1":
            return "feedback", "1"
        elif body == "2":
            return "feedback", "2"
        else:
            return "query", body

    @staticmethod
    def format_whatsapp_number(number: str) -> str:
        number = re.sub(r"[^\d+]", "", number)
        if not number.startswith("+"):
            number = "+" + number
        return number

    def build_twiml_response(self, message: str) -> str:
        response = MessagingResponse()
        response.message(message)
        return str(response)


from datetime import datetime