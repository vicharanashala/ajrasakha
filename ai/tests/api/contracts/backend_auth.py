import os

BACKEND_BASE_URL = os.getenv(
    "BACKEND_BASE_URL",
    "https://reviewer-backend-239934307367.asia-south2.run.app",
)

BACKEND_AUTH_CASES = [
    {"service": "backend_auth", "name": "auth_login_rejects_empty_body", "method": "POST", "path": "/api/auth/login", "json": {}, "allowed_statuses": [400, 401, 422]},
    {"service": "backend_auth", "name": "auth_sync_requires_auth", "method": "POST", "path": "/api/auth/sync", "json": {}, "allowed_statuses": [401, 403]},
]
