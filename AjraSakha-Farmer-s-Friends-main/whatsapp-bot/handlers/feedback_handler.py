import sys
from pathlib import Path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from typing import Optional, Dict, Any
from services import WhatsAppService, MessageTracker, GDBService
from config import TwilioConfig


class FeedbackHandler:
    def __init__(self):
        self.whatsapp_service = WhatsAppService()
        self.message_tracker = MessageTracker()
        self.gdb_service = GDBService()

    def handle_farmer_response(self, farmer_id: str, response_text: str) -> Optional[str]:
        msg_type, parsed_response = self.whatsapp_service.parse_incoming_message(response_text)

        if msg_type == "feedback" and parsed_response in ["1", "2"]:
            return self._handle_feedback(farmer_id, parsed_response)

        return None

    def _handle_feedback(self, farmer_id: str, response: str) -> str:
        pending_message = self.message_tracker.get_pending_message(farmer_id)

        if not pending_message:
            return self.whatsapp_service.send_message(
                farmer_id,
                "We couldn't find a pending question to match your feedback with. "
                "Please try asking your question again."
            )

        from shared.utils import Config
        is_helpful = response == "1"
        feedback_response = Config.FeEDBACK_RESPONSE_HELPFUL if is_helpful else Config.FEEDBACK_RESPONSE_NOT_HELPFUL

        self.message_tracker.store_feedback(
            message_id=pending_message["message_id"],
            gdb_entry_id=pending_message["gdb_entry_id"],
            farmer_id=farmer_id,
            response=feedback_response,
            state=pending_message.get("state"),
            language=pending_message.get("language"),
            domain=pending_message.get("domain")
        )

        confirmation = self.whatsapp_service.send_feedback_confirmation(farmer_id, is_helpful)
        return confirmation

    def deliver_answer(
        self,
        farmer_id: str,
        gdb_entry_id: str,
        state: Optional[str] = None,
        language: Optional[str] = None,
        domain: Optional[str] = None
    ) -> Optional[str]:
        answer = self.gdb_service.get_entry_content(gdb_entry_id)

        if not answer:
            return self.whatsapp_service.send_message(
                farmer_id,
                "Sorry, we couldn't find an answer to your question. "
                "Please try again later."
            )

        message_sid, status = self.whatsapp_service.send_answer_with_feedback_request(
            to_number=farmer_id,
            answer=answer,
            gdb_entry_id=gdb_entry_id,
            state=state,
            language=language,
            domain=domain
        )

        if message_sid:
            self.message_tracker.track_outgoing_message(
                message_id=message_sid,
                gdb_entry_id=gdb_entry_id,
                farmer_id=farmer_id,
                content=answer,
                state=state,
                language=language,
                domain=domain
            )

        return message_sid

    def handle_incoming_query(
        self,
        farmer_id: str,
        query: str,
        state: Optional[str] = None,
        language: Optional[str] = None,
        domain: Optional[str] = None
    ) -> Optional[str]:
        entries = self.gdb_service.search_entries(
            query=query,
            language=language,
            state=state,
            domain=domain
        )

        if not entries:
            return self.whatsapp_service.send_message(
                farmer_id,
                "Sorry, we couldn't find any answers matching your query. "
                "Please try rephrasing or contact support."
            )

        best_entry = entries[0]
        return self.deliver_answer(
            farmer_id=farmer_id,
            gdb_entry_id=str(best_entry["_id"]),
            state=state,
            language=language,
            domain=domain
        )