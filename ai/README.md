# Ajrasakha AI

AI agent system for agricultural domain applications with LangChain and LangGraph.

## Features

- OpenAI-compatible chat completion API
- Streaming responses with reasoning content support
- Specialized tools for weather, location, market data, and knowledge retrieval
- RAG system using MongoDB Atlas vector search
- Async-first architecture

## Prerequisites

- Python 3.10 or higher
- uv package manager
- MongoDB Atlas account (for vector search)
- OpenWeather API key

## Setup

1. Create and activate virtual environment:

```bash
cd ai
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. Install dependencies:

```bash
uv pip install -e .
```

3. Create `.env` file in the `ajrasakha` directory:

```bash
# Required
OPENWEATHER_API_KEY=your_openweather_api_key

# For Golden RAG tool
GOLDEN_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
GOLDEN_MONGODB_URI=mongodb+srv://your_connection_string
GOLDEN_MONGODB_DATABASE=your_database
GOLDEN_MONGODB_COLLECTION=your_collection
GOLDEN_MONGODB_INDEX=your_index_name

# Optional
HUGGINGFACE_HUB_CACHE=/path/to/cache
```

4. Update LLM configuration in `ajrasakha/app.py`:

```python
llm = ChatQwen(
    model="your_model",
    api_key="your_api_key",
    base_url="your_base_url",
)
```

## Running

Start the FastAPI server:

```bash
cd ajrasakha
python app.py
```

The API will be available at `http://localhost:8000`

## API Usage

Send chat completion requests to `/chat/completions`:

```bash
curl -X POST http://localhost:8000/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [{"role": "user", "content": "What is the weather?"}],
    "stream": true
  }'
```

## Testing

Run tests:

```bash
pytest
```

Run specific tool tests:

```bash
pytest ajrasakha/tools/weather/test_weather_tool.py
pytest ajrasakha/tools/location/test_location_tool.py
```

## Project Structure

```
ajrasakha/
├── api/                    # API models and streaming utilities
├── tools/                  # LangChain tools (weather, location, market, RAG)
├── utils/                  # Shared utilities (embeddings, vector store)
└── app.py                  # Main FastAPI application
```

## Tools Available

- **weather_information_tool**: Current weather and 7-day forecast
- **location_information_tool**: Reverse geocoding (lat/lon to location)
- **golden_retriever_tool**: RAG-based knowledge retrieval with filtering
- **eNAM market tools**: Indian agricultural market data

## License

See LICENSE file in project root.
