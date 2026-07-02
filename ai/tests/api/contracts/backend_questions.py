import os

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:3000")

BACKEND_QUESTIONS_CASES = [
    {
        "service": "backend_questions",
        "name": "questions_list_requires_auth",
        "method": "GET",
        "path": "/questions/",
        "allowed_statuses": [401, 403],
    },
    {
        "service": "backend_questions",
        "name": "questions_status_summary_requires_auth",
        "method": "POST",
        "path": "/questions/status-summary",
        "allowed_statuses": [401, 403],
        "json": {},
    },
    {
        "service": "backend_questions",
        "name": "questions_allocated_requires_auth",
        "method": "POST",
        "path": "/questions/allocated",
        "allowed_statuses": [401, 403],
        "json": {},
    },
    {
        "service": "backend_questions",
        "name": "questions_detailed_requires_auth",
        "method": "POST",
        "path": "/questions/detailed",
        "allowed_statuses": [401, 403],
        "json": {},
    },
]