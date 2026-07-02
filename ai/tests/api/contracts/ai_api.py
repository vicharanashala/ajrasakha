import os

AI_API_BASE_URL = os.getenv("AI_API_BASE_URL", "http://localhost:2026")
ASSISTANT_ID = os.getenv("ASSISTANT_ID", "ajrasakha_agent")

AI_API_CASES = [
    {
        "service": "ai_api",
        "name": "health_check",
        "method": "GET",
        "path": "/health",
        "expected_status": 200,
        "required_fields": ["status", "database"],
    },
    {
        "service": "ai_api",
        "name": "ready_check",
        "method": "GET",
        "path": "/ready",
        "expected_status": 200,
    },
    {
        "service": "ai_api",
        "name": "info_check",
        "method": "GET",
        "path": "/info",
        "expected_status": 200,
    },
    {
        "service": "ai_api",
        "name": "assistants_list",
        "method": "GET",
        "path": "/assistants",
        "expected_status": 200,
    },
    {
        "service": "ai_api",
        "name": "runs_stream_basic",
        "method": "POST",
        "path": "/runs/stream",
        "expected_status": 200,
        "timeout": 90,
        "json": {
            "assistant_id": ASSISTANT_ID,
            "input": {
                "messages": [
                    {
                        "role": "user",
                        "content": "Hello",
                    }
                ]
            },
            "stream": True,
            "stream_mode": "values",
        },
    },
]