import os

BACKEND_BASE_URL = os.getenv(
    "BACKEND_BASE_URL",
    "https://reviewer-backend-239934307367.asia-south2.run.app",
)

BACKEND_QUESTIONS_CASES = [
    {
        "service": "backend_questions",
        "name": "questions_list_requires_auth",
        "method": "GET",
        "path": "/api/questions/",
        "allowed_statuses": [401, 403],
    },
    {
        "service": "backend_questions",
        "name": "questions_status_summary_requires_auth",
        "method": "POST",
        "path": "/api/questions/status-summary",
        "allowed_statuses": [401, 403],
        "json": {},
    },
    {
        "service": "backend_questions",
        "name": "questions_allocated_requires_auth",
        "method": "POST",
        "path": "/api/questions/allocated",
        "allowed_statuses": [401, 403],
        "json": {},
    },
    {
        "service": "backend_questions",
        "name": "questions_detailed_requires_auth",
        "method": "POST",
        "path": "/api/questions/detailed",
        "allowed_statuses": [401, 403],
        "json": {},
    },
]
