# FAQ MCP Server

Intelligent FAQ search system for bootcamp and internship questions.

## Features

- Hybrid search (TF-IDF + semantic embeddings)
- 54 FAQ entries covering bootcamp, ViBe platform, attendance, certification
- FastMCP framework with streamable-http transport
- Port: 9010

## Deployment

### Environment Variables
```bash
MONGODB_URI=<mongodb_connection_string>
EMBEDDING_PROVIDER=local  # or openai, anthropic
OPENAI_API_KEY=<key>      # if using openai
```

### Run Server
```bash
cd mcp/faq
python server.py
```

Server will start on `http://localhost:9010/mcp`

## Tool

**search_faq(query: str, top_k: int = 3)**
- Searches FAQ database using hybrid search
- Returns top matching FAQs with confidence scores

## Integration

Already configured in LibreChat:
```yaml
mcpServers:
  faq-bootcamp:
    type: streamable-http
    url: http://100.100.108.28:9010/mcp
    timeout: 60000
```

## Data

- Database: `faq_bootcamp`
- Collection: `questions`
- 54 FAQ entries (already ingested)
