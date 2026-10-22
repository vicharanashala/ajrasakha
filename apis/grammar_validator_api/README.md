# Grammar Validator API

Validates text for grammatical correctness and English language compliance using a locally deployed MiniMax model.

## Features

- **Grammar Validation**: Checks for grammatical errors in text
- **Language Detection**: Ensures text is written in English
- **Correction Suggestions**: Provides corrected suggestions when issues are found
- **Error Details**: Lists specific validation errors with error types and positions

## Quick Start

### Prerequisites

- Python 3.10+
- Docker (optional, for containerized deployment)
- Access to MiniMax LLM endpoint

### Local Installation

1. Clone the repository and navigate to this directory:
   ```bash
   cd grammar_validator_api
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy the environment file and configure:
   ```bash
   cp .env.example .env
   # Edit .env with your settings if needed
   ```

4. Run the server:
   ```bash
   python main.py
   ```
   Or with uvicorn directly:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8002
   ```

### Docker Deployment

1. Navigate to the directory:
   ```bash
   cd grammar_validator_api
   ```

2. Build and start the container:
   ```bash
   docker-compose up --build
   ```

3. The API will be available at `http://localhost:8002`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/ready` | Readiness check (verifies LLM connectivity) |
| POST | `/validate` | Validate text for grammar and language |

## Usage Example

```bash
curl -X POST http://localhost:8002/validate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "She go to school yesterday.",
    "maxSuggestions": 3
  }'
```

## Response Format

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
      "description": "Incorrect verb tense",
      "position": "0-5"
    }
  ]
}
```

## Documentation

For detailed API documentation, see [apiGuide.md](./apiGuide.md).

## Project Structure

```
grammar_validator_api/
├── main.py           # FastAPI application entry point
├── llm_client.py     # LLM client for MiniMax model
├── models.py         # Pydantic request/response models
├── config.py         # Configuration settings
├── requirements.txt  # Python dependencies
├── Dockerfile        # Docker image definition
├── docker-compose.yml # Docker Compose configuration
├── .env.example      # Example environment variables
└── apiGuide.md       # Detailed API documentation
```

## License

Internal use only.