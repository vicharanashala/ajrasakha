# POP MCP Server Setup Guide

## Overview

This project exposes the POP (Package of Practices) retrieval system as a standalone MCP (Model Context Protocol) server using Docker.

The server:

- Detects state and crop from user queries
- Retrieves relevant POP documents from MongoDB
- Performs embedding similarity search on document chunks
- Returns top relevant chunks
- Supports MCP-compatible AI agents and tools

---

# Architecture

```text
User Query
    ↓
MCP Tool: get_context_from_pop()
    ↓
State + Crop Extraction
    ↓
MongoDB Filtering
    ↓
Chunk Embedding Similarity Search
    ↓
Top Relevant Results Returned
```

---

# Features

- Standalone MCP server
- Dockerized deployment
- MongoDB-based storage
- Embedding similarity search
- State alias handling
- Short code handling (AP, UP, TN, etc.)
- Ambiguity detection
- Sequential retrieval logic
- Async retrieval
- MCP Streamable HTTP transport

---

# Tech Stack

| Component             | Usage             |
| --------------------- | ----------------- |
| Python 3.12           | Runtime           |
| FastMCP               | MCP server        |
| MongoDB               | Document storage  |
| Sentence Transformers | Embeddings        |
| scikit-learn          | Cosine similarity |
| Docker                | Containerization  |

---

# Project Structure

```text
project/
│
├── pop.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .env
└── README.md
```

---

# Environment Variables

Create a `.env` file:

```env
POP_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

POP_MONGODB_URI=mongodb://local:27017

POP_MONGODB_DATABASE=your_database_name

POP_MONGODB_COLLECTION=your_collection_name
```

---

# Install Requirements (Local)

```bash
pip install -r requirements.txt
```

---

# requirements.txt

```txt
mcp
pymongo
numpy
scikit-learn
rapidfuzz
sentence-transformers
python-dotenv
```

---

# Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 9003

CMD ["python", "pop.py"]
```

---

# docker-compose.yml

```yaml
services:
  pop-mcp:
    build:
      context: .
    container_name: pop-mcp
    ports:
      - "9043:9003"
    env_file:
      - .env
    restart: unless-stopped
    volumes:
      - ./:/app
```

---

# Build Docker Image

```bash
docker compose build
```

---

# Start MCP Server

```bash
docker compose up
```

Expected logs:

```text
INFO: Uvicorn running on http://0.0.0.0:9003
```

---

# MCP Endpoint

```text
http://localhost:9043/mcp
```

---

# MCP Start

```
mcp-inspector
```

---

# MCP Protocol Flow

MCP requires this lifecycle:

```text
initialize
    ↓
notifications/initialized
    ↓
tools/list
    ↓
tools/call
```

---

# Testing the MCP Server

## 1. Initialize Session

```
curl -i -N \
  -H "Accept: application/json, text/event-stream" \
  http://localhost:9043/mcp
```

```bash
curl -N \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":0,
    "method":"initialize",
    "params":{
      "protocolVersion":"2024-11-05",
      "capabilities":{},
      "clientInfo":{
        "name":"curl",
        "version":"1.0"
      }
    }
  }' \
  http://localhost:9043/mcp
```

Response contains:

```text
mcp-session-id
```

Copy that value.

---

## 2. List Tools

```bash
curl -N \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/list"
  }' \
  http://localhost:9043/mcp
```

---

## 3. Call Tool

```bash
curl -N \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"get_context_from_pop",
      "arguments":{
        "query":"Paddy in Punjab"
      }
    }
  }' \
  http://localhost:9043/mcp
```

---

# Retrieval Logic

The retrieval logic runs sequentially.

---

## Step 1 — Extract State and Crop

Example:

```text
Query:
"Best fertilizer for paddy in Punjab"

Detected:
state = Punjab
crop = Paddy
```

---

## Step 2 — Case 1

Retrieve documents where:

```text
document.state == detected_state
```

AND

```text
doc_usage.state == detected_state
doc_usage.crop == detected_crop
```

Then:

- perform embedding similarity search
- rank chunks
- collect top results

---

## Step 3 — Case 2

If fewer than 5 results:

Retrieve documents where:

```text
document.state == "central"
```

AND same `doc_usage` filtering.

---

## Step 4 — Case 3

If still fewer than 5 results:

Retrieve all remaining states excluding:

- detected state
- central

Again filtered by:

- doc_usage.state
- doc_usage.crop

---

# State Detection Logic

Supports:

- Full names
- Partial names
- Aliases
- Short codes

Examples:

| Input         | Detected       |
| ------------- | -------------- |
| AP            | Andhra Pradesh |
| UP            | Uttar Pradesh  |
| TN            | Tamil Nadu     |
| andhra        | Andhra Pradesh |
| uttar pradesh | Uttar Pradesh  |

---

# Ambiguity Handling

If a short code maps to multiple possible states:

```json
{
  "error": "AMBIGUOUS_STATE",
  "possible_states": ["Andhra Pradesh", "Arunachal Pradesh"]
}
```

---

# MongoDB Schema

```json
{
  "document": {
    "doc_id": "...",
    "doc_name": "...",
    "doc_origin": "...",
    "state": "tamil nadu",
    "doc_usage": [
      {
        "state": "Punjab",
        "crop": "Paddy",
        "verified_by": "..."
      }
    ]
  },
  "chunks": [
    {
      "chunk_id": "...",
      "embedding_vector": [...],
      "chunk_content": "...",
      "page_no": 1
    }
  ]
}
```

---

# Similarity Search

Uses:

```python
cosine_similarity(query_embedding, chunk_embeddings)
```

Top scoring chunk from each document is selected.

---

# Common Issues

## 1. `Connection Refused`

Cause:

- server not running
- wrong port mapping

Check:

```bash
docker ps
```

---

## 2. `Missing session ID`

Cause:

- initialize step skipped

Solution:

- always initialize first

---

## 3. `Invalid request parameters`

Cause:

- malformed MCP payload
- wrong method schema

---

## Useful Commands

## Stop Containers

```bash
docker compose down
```

---

## Rebuild Containers

```bash
docker compose up --build
```

---

## View Logs

```bash
docker compose logs -f
```

---

# MCP USAGE

```
riyamehta@Riyas-MacBook-Air riya_pop % curl -i -N \
  -H "Accept: application/json, text/event-stream" \
  http://localhost:9043/mcp
HTTP/1.1 400 Bad Request
date: Wed, 13 May 2026 06:33:43 GMT
server: uvicorn
content-type: application/json
mcp-session-id: 9993ccf7e6644246ab32a4d836d81cda
content-length: 105

{"jsonrpc":"2.0","id":"server-error","error":{"code":-32600,"message":"Bad Request: Missing session ID"}}%
riyamehta@Riyas-MacBook-Air riya_pop % curl -N \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: 9993ccf7e6644246ab32a4d836d81cda" \
  -d '{
    "jsonrpc":"2.0",
    "id":0,
    "method":"initialize",
    "params":{
      "protocolVersion":"2024-11-05",
      "capabilities":{},
      "clientInfo":{
        "name":"curl",
        "version":"1.0"
      }
    }
  }' \
  http://localhost:9043/mcp
event: message
data: {"jsonrpc":"2.0","id":0,"result":{"protocolVersion":"2024-11-05","capabilities":{"experimental":{},"prompts":{"listChanged":false},"resources":{"subscribe":false,"listChanged":false},"tools":{"listChanged":false}},"serverInfo":{"name":"ajrasakha-pop-mcp","version":"1.27.1"}}}

riyamehta@Riyas-MacBook-Air riya_pop % curl -N \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: 9993ccf7e6644246ab32a4d836d81cda" \
  -d '{
    "jsonrpc":"2.0",
    "method":"notifications/initialized"
  }' \
  http://localhost:9043/mcp
riyamehta@Riyas-MacBook-Air riya_pop % curl -N \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: 9993ccf7e6644246ab32a4d836d81cda" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/list"
  }' \
  http://localhost:9043/mcp
event: message
data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"get_context_from_pop","description":"\n    Retrieve POP context chunks for the given agronomic query.\n\n    Cases run sequentially until 5 documents are collected:\n      Case 1 — document.state matches the detected state\n      Case 2 — document.state is \"central\"\n      Case 3 — everything else\n    All cases additionally filter by doc_usage (state + crop match).\n    ","inputSchema":{"properties":{"query":{"title":"Query","type":"string"}},"required":["query"],"title":"get_context_from_popArguments","type":"object"},"outputSchema":{"properties":{"result":{"items":{"additionalProperties":true,"type":"object"},"title":"Result","type":"array"}},"required":["result"],"title":"get_context_from_popOutput","type":"object"}}]}}

riyamehta@Riyas-MacBook-Air riya_pop % curl -N \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: 9993ccf7e6644246ab32a4d836d81cda" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"get_context_from_pop",
      "arguments":{
        "query":"How can farmers manage soil fertility in organic aromatic rice farming without using chemical fertilizers in Punjab"
      }
    }
  }' \
  http://localhost:9043/mcp
: ping - 2026-05-13 06:37:28.559612+00:00

event: message
data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\n  \"contexts\": [],\n  \"message\": \"No relevant data found.\",\n  \"response_guidance\": \"* If retrieved context is relevant and sufficient:\\n* Generate answer using available data.\\n* Append:\\n\\\"# Your query has also been shared with an expert for review. It will be processed within 2 hours. Please ask the same query after 2 hours.\\\"\\n* If insufficient:\\n\\\"# We do not have sufficient information to answer your query at the moment. Your query has been transferred to an expert and will be processed within 2 hours.\\\"\"\n}"}],"structuredContent":{"result":[{"contexts":[],"message":"No relevant data found.","response_guidance":"* If retrieved context is relevant and sufficient:\n* Generate answer using available data.\n* Append:\n\"# Your query has also been shared with an expert for review. It will be processed within 2 hours. Please ask the same query after 2 hours.\"\n* If insufficient:\n\"# We do not have sufficient information to answer your query at the moment. Your query has been transferred to an expert and will be processed within 2 hours.\""}]},"isError":false}}

riyamehta@Riyas-MacBook-Air riya_pop % curl -N \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: 9993ccf7e6644246ab32a4d836d81cda" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"get_context_from_pop",
      "arguments":{
        "query":"Paddy in punjab"
      }
    }
  }' \
  http://localhost:9043/mcp
event: message
data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\n  \"contexts\": [\n    {\n      \"doc_id\": \"cg2nnf8c1d761df2a4fc1897c674817b1a699\",\n      \"doc_name\": \"Progressive Farming 2024-A monthly magazine from PAU\",\n      \"doc_link\": \"https://workdrive.zoho.in/file/cg2nnf8c1d761df2a4fc1897c674817b1a699\",\n      \"doc_origin\": \"punjab\",\n      \"chunk_id\": \"cg2nnf8c1d761df2a4fc1897c674817b1a699_37\",\n      \"chunk_content\": \"44 variety has been consistently declining during the last decade. The area under Pusa 44 has been lowered from 45.6 per cent in 2013-14 to 14.7 per cent during 2023-24 (Table 1). Table 1: Increasing area under PAU recommended paddy varieties in Punjab Figures in the parentheses indicate per cent area under the variety However, the farmers in Malwa belt of the state especially in Barnala, Moga, Sangrur and Mansa are still cultivating long duration paddy varieties, especially Pusa 44 on about half of the total paddy area. As a result, the groundwater table in these areas is depleting at a very fast rate and the farmers have to incur heavy expenditure on the bore wells and T he area under paddy in Punjab has increased from 3.9 to 32.0 lakh hectares and its productivity has jumped from 27.7 to 67.4 quintals/ha during 1970-71 to 2023-24. Consequently, the production of paddy has risen by about 21 times from 10.32 to 215.8 lakh tonnes during the same period. The state produces about 11 per cent of rice of the country and contributed 21.4 per cent of rice towards central pool during 202223. This was, however, accompanied by some challenges, of which depletion of groundwater resources is the most serious one. To tackle this situation, short duration paddy varieties and water saving technologies (like laser land leveler, ridge/bed transplanting, direct seeding of rice, alternate wetting and drying, transplanting at optimum date, etc.) have been developed. The State Government enacted 'Punjab Preservation of Sub Soil Water Act 2009' to ensure the transplanting of paddy after a notified date so as to coincide the paddy transplanting date near the onset of monsoon. The Punjab Agricultural University (PAU) has played a significant role in the development and promotion of short duration high yielding varieties of paddy. The field surveys reveal that PAU recommended paddy varieties rule in the heart and fields of the farmers of Punjab and adjoining states. The adoption of recommended varieties by the farmers witnessed an increasing trend over the years. It was found that the share of area under recommended varieties in the total area under the parmal paddy has increased from about 37.6 per cent in 2013-14 to 57.3 per cent in 2023-24. PR 126 variety is a leading installing submersible pumps. Though, they do not pay for electricity, yet the state government shoulders the huge expenses on that. Above all, the underground water reservoir is being depleted, which cannot be easily replenished. The farmers of these districts are probably
```
