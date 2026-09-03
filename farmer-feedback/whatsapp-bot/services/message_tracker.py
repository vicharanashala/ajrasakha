import sys
from pathlib import Path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from shared.mongodb import get_db, MessageTrackingSchema, FeedbackResponse, FeedbackStatus, FlagStatus
from shared.utils import Config, DateTimeUtils


class MessageTracker:
    def __init__(self):
        self.db = get_db()

    def track_outgoing_message(
        self,
        message_id: str,
        gdb_entry_id: str,
        farmer_id: str,
        content: str,
        state: Optional[str] = None,
        language: Optional[str] = None,
        domain: Optional[str] = None
    ) -> str:
        expires_at = datetime.utcnow() + timedelta(hours=Config.FEEDBACK_EXPIRY_HOURS)

        doc = {
            "message_id": message_id,
            "gdb_entry_id": gdb_entry_id,
            "farmer_id": farmer_id,
            "content": content,
            "state": state,
            "language": language,
            "domain": domain,
            "feedback_requested": True,
            "feedback_received": False,
            "feedback_response": None,
            "created_at": datetime.utcnow(),
            "feedback_received_at": None,
            "expires_at": expires_at
        }

        result = self.db.message_tracking.insert_one(doc)
        return str(result.inserted_id)

    def get_pending_message(self, farmer_id: str) -> Optional[Dict[str, Any]]:
        return self.db.message_tracking.find_one({
            "farmer_id": farmer_id,
            "feedback_requested": True,
            "feedback_received": False,
            "expires_at": {"$gt": datetime.utcnow()}
        }, sort=[("created_at", -1)])

    def mark_feedback_received(
        self,
        message_id: str,
        response: FeedbackResponse
    ) -> bool:
        result = self.db.message_tracking.update_one(
            {"message_id": message_id},
            {
                "$set": {
                    "feedback_received": True,
                    "feedback_response": response.value,
                    "feedback_received_at": datetime.utcnow()
                }
            }
        )
        return result.modified_count > 0

    def store_feedback(
        self,
        message_id: str,
        gdb_entry_id: str,
        farmer_id: str,
        response: FeedbackResponse,
        state: Optional[str] = None,
        language: Optional[str] = None,
        domain: Optional[str] = None
    ) -> str:
        doc = {
            "gdb_entry_id": gdb_entry_id,
            "farmer_id": farmer_id,
            "message_id": message_id,
            "response": response.value,
            "state": state,
            "language": language,
            "domain": domain,
            "timestamp": datetime.utcnow(),
            "status": FeedbackStatus.CAPTURED.value
        }

        result = self.db.feedback.insert_one(doc)
        self.mark_feedback_received(message_id, response)
        return str(result.inserted_id)

    def get_gdb_entry_context(self, gdb_entry_id: str) -> Optional[Dict[str, Any]]:
        return self.db.gdb_entries.find_one({"_id": gdb_entry_id}) or \
               self.db.message_tracking.find_one({"gdb_entry_id": gdb_entry_id})