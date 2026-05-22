# POP MCP Retrieval Service

A FastMCP-based semantic retrieval service for POP (Package of Practices) documents using MongoDB and HuggingFace embeddings.

This service retrieves the most relevant document chunks based on:

- User query
- State
- Crop

It uses:

- Semantic similarity search
- Metadata filtering
- Priority-based retrieval flow
- Chunk-level ranking

---

# Features

- FastMCP tool server
- Semantic search using HuggingFace embeddings
- MongoDB-backed chunk storage
- State and crop validation
- Priority-based retrieval strategy
- Cosine similarity ranking
- One best chunk per document
- Duplicate document prevention
- Async retrieval execution

---

# Retrieval Flow

The retrieval follows a sequential priority strategy.

## Case 1 — State Documents

Highest priority.

```text
document.state == user_state
```

Example:

```text
Punjab query → Punjab documents
```

---

## Case 2 — Central Documents

Fallback retrieval.

```text
document.state == central
```

These are generic national POP documents.

---

## Case 3 — Other State Documents

Final fallback.

```text
document.state != user_state
AND
document.state != central
```

---

# Additional Mandatory Filters

Regardless of retrieval case, all documents must also satisfy:

```text
doc_usage.state == user_state
AND
doc_usage.crop == user_crop
```

This ensures documents are relevant for the requested state and crop.

---

# Project Structure

```text
.
├── pop.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .env
```

---

# Requirements

- Python 3.12+
- MongoDB
- HuggingFace embedding model
- Docker (optional)

---

# Environment Variables

Create a `.env` file:

```env
POP_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

POP_MONGODB_URI=mongodb://localhost:27017

POP_MONGODB_DATABASE=your_database

POP_MONGODB_COLLECTION=your_collection
```

---

# MongoDB Document Structure

Expected collection structure:

```json
{
  "document": {
    "doc_id": "123",
    "doc_name": "Punjab Wheat POP",
    "state": "Punjab",

    "doc_usage": [
      {
        "state": "Punjab",
        "crop": "Wheat",
        "verified_by": "Officer A"
      }
    ],

    "unique_links": "https://example.com/doc.pdf"
  },

  "chunks": [
    {
      "chunk_id": "chunk_1",
      "chunk_content": "Apply nitrogen fertilizer...",
      "page_no": 2,
      "embedding_vector": [0.123, 0.456]
    }
  ]
}
```

---

# Installation

## Local Setup

Install dependencies:

```bash
pip install -r requirements.txt
```

Run server:

```bash
python pop.py
```

---

# Docker Setup

## Dockerfile

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

## docker-compose.yml

```yaml
version: "3.9"

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

# Start Service

```bash
docker compose up --build
```

Service will run at:

```text
http://localhost:9043
```

---

# MCP Tool

## Tool Name

```text
get_context_from_pop
```

---

# Input Parameters

| Parameter | Type   | Description   |
| --------- | ------ | ------------- |
| query     | string | User question |
| state     | string | User state    |
| crop      | string | User crop     |

---

# Example Request

```json
{
  "query": "How to control wheat rust?",
  "state": "Punjab",
  "crop": "Wheat"
}
```

---

# Retrieval Pipeline

## 1. State Validation

Checks whether requested state exists.

Supports:

- Exact matching
- Partial matching
- Case-insensitive matching

Example:

```text
andhra → Andhra Pradesh
```

---

## 2. Crop Validation

Fetches available crops for the validated state.

Supports:

- Exact matching
- Partial matching
- Case-insensitive matching

---

## 3. Query Embedding Generation

The user query is converted into a vector embedding using:

```python
HuggingFaceEmbeddings
```

---

## 4. Sequential Retrieval

Search happens in priority order:

1. State documents
2. Central documents
3. Other state documents

Retrieval stops once 5 results are collected.

---

## 5. Semantic Ranking

Each chunk embedding is compared against the query embedding using cosine similarity.

```python
cosine_similarity()
```

---

## 6. Best Chunk Selection

Only the highest-scoring chunk per document is retained.

This prevents duplicate-heavy retrieval from the same document.

---

## 7. Final Sorting

Results are sorted by:

```text
Highest similarity score first
```

---

# Response Structure

## Success Response

```json
[
  {
    "contexts": [
      {
        "doc_id": "123",
        "doc_name": "Punjab Wheat POP",
        "chunk_content": "Apply fungicide...",
        "similarity_score": 0.91,
        "verified_by": "Officer A"
      }
    ],

    "response_guidance": "..."
  }
]
```

---

## Invalid State Response

```json
[
  {
    "contexts": [],
    "message": "We do not currently have POP data for state 'XYZ'.",
    "available_states": ["Punjab", "Haryana"]
  }
]
```

---

## Invalid Crop Response

```json
[
  {
    "contexts": [],
    "message": "We do not currently have POP data for crop 'ABC' in state 'Punjab'.",
    "available_crops_for_state": ["Wheat", "Rice"]
  }
]
```

---

# Key Design Decisions

## Sequential Priority Retrieval

Ensures retrieval order:

```text
State > Central > Other States
```

instead of mixing all results together.

---

## Hybrid Retrieval

Combines:

```text
Semantic similarity
+
Metadata filtering
```

for better relevance.

---

## One Best Chunk Per Document

Prevents a single document from dominating retrieval results.

---

## Duplicate Prevention

Already-selected documents are excluded from later retrieval stages.

---

# Current Limitations

## In-Memory Similarity Computation

All matching documents are loaded into memory before similarity scoring.

This may become slow for very large datasets.

---

## No Similarity Threshold

Low-scoring chunks can still be returned.

Potential improvement:

```python
if score >= 0.5
```

---

## CPU Embedding Inference

Embeddings currently run on CPU:

```python
device = "cpu"
```

Can be switched to GPU for faster inference.

---

# Future Improvements

- MongoDB Atlas Vector Search
- FAISS / Qdrant integration
- Similarity thresholds
- Hybrid BM25 + vector retrieval
- Re-ranking models
- Async Mongo queries
- Chunk metadata boosting

---

# Server Configuration

The MCP server runs using:

```python
mcp.run(
    transport="streamable-http",
    host="0.0.0.0",
    port=9003,
)
```

---

# Technologies Used

- Python
- FastMCP
- MongoDB
- HuggingFace Embeddings
- NumPy
- Scikit-learn
- Pydantic
- Docker
