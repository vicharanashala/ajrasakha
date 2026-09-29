import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from bson import ObjectId


class DateTimeUtils:
    @staticmethod
    def get_week_bounds(date: Optional[datetime] = None) -> tuple[datetime, datetime]:
        if date is None:
            date = datetime.utcnow()
        start = date - timedelta(days=date.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
        return start, end

    @staticmethod
    def format_datetime(dt: datetime) -> str:
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def parse_datetime(dt_str: str) -> datetime:
        return datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")


class IDUtils:
    @staticmethod
    def to_str_id(obj_id: ObjectId) -> str:
        return str(obj_id)

    @staticmethod
    def to_object_id(id_str: str) -> ObjectId:
        return ObjectId(id_str)


class Config:
    MONGODB_URI = os.getenv(
        "MONGODB_URI",
        "mongodb+srv://your_user:your_password@cluster.mongodb.net/?appName=your_app"
    )
    DATABASE_NAME = "farmer_feedback"

    FEEDBACK_EXPIRY_HOURS = int(os.getenv("FEEDBACK_EXPIRY_HOURS", "48"))
    HELPFULNESS_THRESHOLD = float(os.getenv("HELPFULNESS_THRESHOLD", "0.60"))
    MIN_RESPONSES_FOR_FLAG = int(os.getenv("MIN_RESPONSES_FOR_FLAG", "10"))

    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER", "")

    BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

    WEEKLY_DIGEST_DAY = int(os.getenv("WEEKLY_DIGEST_DAY", "0"))
    AUTO_FLAG_THRESHOLD = float(os.getenv("AUTO_FLAG_THRESHOLD", "0.60"))
    AUTO_FLAG_MIN_RESPONSES = int(os.getenv("AUTO_FLAG_MIN_RESPONSES", "10"))

    FEEDBACK_RESPONSE_HELPFUL = "1"
    FEEDBACK_RESPONSE_NOT_HELPFUL = "2"