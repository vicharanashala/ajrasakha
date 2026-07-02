import os

WHATSAPP_BASE_URL = os.getenv("WHATSAPP_BASE_URL", "http://localhost:4000")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")

headers = {"Content-Type": "application/json"}

if WHATSAPP_ACCESS_TOKEN:
    headers["Authorization"] = f"Bearer {WHATSAPP_ACCESS_TOKEN}"

WHATSAPP_CASES = [
    {
        "service": "whatsapp_api",
        "name": "unique_users_requires_or_accepts_auth",
        "method": "GET",
        "path": "/api/whatsapp/unique-users",
        "headers": headers,
        "allowed_statuses": [200] if WHATSAPP_ACCESS_TOKEN else [401, 403],
    }
]