# Translation MCP Server

An MCP (Model Context Protocol) server for translating text using the Sarvam AI translation model via vLLM.

## Features

- **Single Text Translation**: Translate individual texts to any supported language
- **Batch Translation**: Translate multiple texts in a single request
- **Auto Language Detection**: Automatically detect source language if not specified
- **Retry Logic**: Built-in exponential backoff for handling transient errors
- **Comprehensive Error Handling**: Detailed error messages and logging

## Prerequisites

- Python 3.10 or higher
- vLLM server running with `sarvamai/sarvam-translate` model
- Poetry for dependency management

## Installation

### Using Poetry

```bash
poetry install
```

### Using Docker

```bash
docker build -t mcp-translator .
docker run -p 9010:9010 -e VLLM_ENDPOINT=http://host.docker.internal:8012/v1/chat/completions mcp-translator
```

## Configuration

The server can be configured using environment variables:

- `VLLM_ENDPOINT`: The vLLM server endpoint (default: `http://localhost:8012/v1/chat/completions`)

## Usage

### Running the Server

```bash
python translator.py
```

### Available Tools

#### 1. `translate_text`

Translate a single text to a target language.

**Parameters:**
- `text` (str, required): The text to translate
- `target_language` (str, required): Target language (e.g., "Hindi", "English", "Tamil")
- `source_language` (str, optional): Source language (auto-detected if not provided)
- `vllm_endpoint` (str, optional): Custom vLLM endpoint URL
- `model_name` (str, optional): Model name (default: "sarvamai/sarvam-translate")

**Example:**
```python
result = await translate_text(
    text="How are you today?",
    target_language="Hindi"
)
# Returns: {"success": True, "translated_text": "आपका कैसे है?", ...}
```

#### 2. `batch_translate`

Translate multiple texts to a target language.

**Parameters:**
- `texts` (list[str], required): List of texts to translate
- `target_language` (str, required): Target language
- `source_language` (str, optional): Source language (auto-detected if not provided)
- `vllm_endpoint` (str, optional): Custom vLLM endpoint URL
- `model_name` (str, optional): Model name (default: "sarvamai/sarvam-translate")

**Example:**
```python
result = await batch_translate(
    texts=["Hello", "Goodbye", "Thank you"],
    target_language="Hindi"
)
# Returns: {"success": True, "translations": [...], "successful_count": 3, ...}
```

## Testing with curl

You can test the vLLM server directly:

```bash
curl http://localhost:8012/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sarvamai/sarvam-translate",
    "messages": [
      {"role": "system", "content": "You are a translation assistant."},
      {"role": "user", "content": "Translate this to Hindi: How are you today?"}
    ]
  }'
```

## Supported Languages

The Sarvam AI translation model supports multiple Indian and international languages including:
- Hindi (हिन्दी)
- English
- Tamil (தமிழ்)
- Telugu (తెలుగు)
- Bengali (বাংলা)
- Marathi (मराठी)
- Gujarati (ગુજરાતી)
- Kannada (ಕನ್ನಡ)
- Malayalam (മലയാളം)
- Punjabi (ਪੰਜਾਬੀ)
- And more...

## Error Handling

The server includes comprehensive error handling:
- Network errors with automatic retry
- Rate limiting (429) with exponential backoff
- Server errors (5xx) with retry logic
- Detailed error messages in responses

## Logging

The server logs all translation requests and errors at INFO level. Configure logging level via standard Python logging configuration.

## License

MIT

## Author

Ajrasakha MCP Team
