# Grammar Validator API Guide

## Overview

The Grammar Validator API validates text for grammatical correctness and English language compliance using a locally deployed MiniMax model.

**Base URL:** `http://localhost:8002` (or your deployed URL)

---

## Authentication

This API uses API Key authentication via the `Authorization` header. The API key should be included in your requests to the LLM backend.

---

## Endpoints

### 1. `GET /health`

Basic health check endpoint to verify the service is running.

**Example request:**
```bash
curl -X GET http://127.0.0.1:8002/health
```

**Example response:**
```json
{
  "status": "ok",
  "service": "grammar-validator",
  "version": "1.0.0"
}
```

---

### 2. `GET /health/ready`

Readiness check that verifies the LLM service is reachable.

**Example request:**
```bash
curl -X GET http://127.0.0.1:8002/health/ready
```

**Example response (success):**
```json
{
  "status": "ready",
  "service": "grammar-validator",
  "llm_service": "reachable",
  "llm_url": "http://100.100.108.41:8001/v1/chat/completions"
}
```

**Example response (service unavailable):**
```json
{
  "detail": {
    "status": "not_ready",
    "message": "LLM service is not reachable",
    "llm_url": "http://100.100.108.41:8001/v1/chat/completions"
  }
}
```

---

### 3. `POST /validate`

Validates text for grammatical correctness and English language compliance.

**Request body:**

```json
{
  "text": "string (required) - The text to validate",
  "maxSuggestions": "integer (optional, default: 3, range: 1-10) - Maximum suggestions to return"
}
```

**Example request:**
```bash
curl -X POST http://127.0.0.1:8002/validate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "She go to school yesterday.",
    "maxSuggestions": 3
  }'
```

**Example response (text with errors):**
```json
{
  "isValid": false,
  "originalText": "She go to school yesterday.",
  "suggestions": [
    {
      "original": "She go to school yesterday.",
      "corrected": "She went to school yesterday.",
      "explanation": "Use past tense 'went' instead of 'go' for an action that happened in the past."
    }
  ],
  "validationErrors": [
    {
      "error_type": "grammar",
      "description": "Incorrect verb tense: 'go' should be 'went' for past actions",
      "position": "0-5"
    }
  ]
}
```

**Example response (correct text):**
```json
{
  "isValid": true,
  "originalText": "She went to school yesterday.",
  "suggestions": [],
  "validationErrors": []
}
```

**Example response (non-English text):**
```json
{
  "isValid": false,
  "originalText": "Это русский текст",
  "suggestions": [],
  "validationErrors": [
    {
      "error_type": "language",
      "description": "Text is not in English. Detected language: Russian.",
      "position": null
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "detail": "text is a required non-empty string"
}
```

### 502 Bad Gateway
```json
{
  "detail": {
    "message": "LLM service error",
    "error": "Error details...",
    "llm_url": "http://100.100.108.41:8001/v1/chat/completions"
  }
}
```

### 503 Service Unavailable
```json
{
  "detail": {
    "status": "not_ready",
    "message": "LLM service is not reachable",
    "llm_url": "http://100.100.108.41:8001/v1/chat/completions"
  }
}
```

---

## Sample Integration (Python)

```python
import httpx

async def validate_text():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://127.0.0.1:8002/validate",
            json={
                "text": "They was going to the market.",
                "maxSuggestions": 3
            }
        )
        result = response.json()
        
        if result["isValid"]:
            print("Text is grammatically correct!")
        else:
            print("Issues found:")
            for error in result["validationErrors"]:
                print(f"  - {error['error_type']}: {error['description']}")
            print("\nSuggestions:")
            for sug in result["suggestions"]:
                print(f"  '{sug['original']}' -> '{sug['corrected']}'")
                print(f"    Explanation: {sug['explanation']}")

# Run the validation
import asyncio
asyncio.run(validate_text())
```

---

## Docker Deployment

The API is containerized and can be deployed using Docker Compose:

```bash
# Build and run
docker-compose up --build

# Run in background
docker-compose up -d
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GRAMMAR_VALIDATOR_PORT` | API server port | `8002` |
| `GRAMMAR_VALIDATOR_HOST` | API server host | `0.0.0.0` |
| `LLM_API_URL` | MiniMax LLM API endpoint | `http://100.100.108.41:8001/v1/chat/completions` |
| `LLM_MODEL` | MiniMax model ID | `MiniMaxAI/MiniMax-M2` |
| `LLM_API_KEY` | API key for MiniMax | Provided API key |
| `LLM_TIMEOUT_SECONDS` | LLM request timeout | `30` |
| `LLM_MAX_TOKENS` | Max tokens for response | `1000` |
| `LOG_LEVEL` | Logging level | `INFO` |