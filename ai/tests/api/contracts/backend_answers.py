import os

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "https://desk.vicharanashala.ai/api")

BACKEND_ANSWERS_CASES = [
    {"service": "backend_answers", "name": "answers_submissions_requires_auth", "method": "GET", "path": "/answers/submissions", "allowed_statuses": [401, 403]},
    {"service": "backend_answers", "name": "answers_finalized_requires_auth", "method": "GET", "path": "/answers/finalizedAnswers", "allowed_statuses": [401, 403]},
    {"service": "backend_answers", "name": "answers_faqs_mod_requires_auth", "method": "GET", "path": "/answers/faqs/mod", "allowed_statuses": [401, 403]},
]