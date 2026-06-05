import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

PROXY_HOST = os.getenv("PROXY_HOST", "0.0.0.0")
PROXY_PORT = int(os.getenv("PROXY_PORT", "8001"))
REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "300"))

# LangGraph AjraSakha agent (langgraph dev / Aegra / Agent Server)
LANGGRAPH_BASE_URL = os.getenv("LANGGRAPH_BASE_URL", "http://127.0.0.1:2024").rstrip("/")
LANGGRAPH_ASSISTANT_ID = os.getenv("LANGGRAPH_ASSISTANT_ID", "ajrasakha_agent")
LANGGRAPH_API_KEY = os.getenv("LANGGRAPH_API_KEY", "not_required")

# Source sent to upload_question_to_reviewer_system (adapter sets this; client does not)
QUESTION_SOURCE = os.getenv("QUESTION_SOURCE", "AJRASAKHA").strip()

# MongoDB (LibreChat farmerProfile.location lookup via X-User-ID)
MONGO_URI = os.getenv("MONGO_URI", "").strip()
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "").strip()
MONGO_USERS_COLLECTION = os.getenv("MONGO_USERS_COLLECTION", "users")
LOCATION_CACHE_TTL_SEC = float(os.getenv("LOCATION_CACHE_TTL_SEC", "60"))
# When live GPS is parsed from the system prompt, update farmerProfile.location in MongoDB.
LOCATION_SYNC_TO_DB = os.getenv("LOCATION_SYNC_TO_DB", "true").strip().lower() in (
    "1",
    "true",
    "yes",
)


def resolve_mongo_db_name() -> str:
    if MONGO_DB_NAME:
        return MONGO_DB_NAME
    if MONGO_URI:
        path = urlparse(MONGO_URI).path.strip("/")
        if path:
            return path.split("/")[0]
    return "test"
