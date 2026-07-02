import os

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "https://desk.vicharanashala.ai/api")

BACKEND_AUTH_CASES = [
    {"service": "backend_auth", "name": "auth_login_rejects_empty_body", "method": "POST", "path": "/auth/login", "json": {}, "allowed_statuses": [400, 401, 422]},
    {"service": "backend_auth", "name": "auth_sync_requires_auth", "method": "POST", "path": "/auth/sync", "json": {}, "allowed_statuses": [401, 403]},
]