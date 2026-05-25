# AgriAI Q&A Semantic Search API

Semantic search over 6,600+ agricultural Q&A entries stored in MongoDB Atlas.  
Given a natural-language query, returns the top-N most relevant questions ranked by vector similarity (MongoDB Atlas Vector Search).

**Model:** `BAAI/bge-large-en` (1024-dimensional dense vectors)  
**Server:** FastAPI + Uvicorn on port `8001`  
**Access:** Anyone connected to the same Tailscale network (`vicharanashala@`)

---

## Endpoints

### 1. `POST /agent_search` (Recommended)

Accepts a raw conversation transcript (e.g., between a farmer and an expert), uses an LLM to extract the core question, state, and crop, and then performs a highly targeted pre-filtered vector search.

**Request body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | yes | — | Raw conversation transcript or question |
| `top_k` | integer | no | `10` | Maximum number of results to return |
| `threshold` | float | no | `0.70` | Minimum cosine similarity score (0-1) |

**Example request**
```bash
curl -X POST http://127.0.0.1:8001/agent_search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Farmer: My wheat crop in Punjab has yellow leaves. What should I do?",
    "top_k": 5,
    "threshold": 0.75
  }'
```

**Example response**
```json
{
  "extracted_question": "What should I do for yellow leaves in wheat crop?",
  "extracted_state": "Punjab",
  "extracted_crop": "Wheat",
  "results": [
    {
      "id": "69258d6e69c176608bf91def",
      "question": "What is the treatment for yellow rust in wheat?",
      "text": "Question: What is the treatment...\n\nanswer: Apply...",
      "answer": "Apply...",
      "details": {
        "state": "Punjab",
        "district": "Ludhiana",
        "crop": "Wheat",
        "season": "Rabi",
        "domain": "Crop Protection"
      },
      "status": "closed",
      "source": "AGRI_EXPERT",
      "score": 0.931
    }
  ]
}
```

---

### 2. `POST /search_all`

Direct semantic search across all collections (Reviewer, Golden Q&A, and PoP) without the LLM extraction step. You can pass explicit filters for precise results.

**Request body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | yes | — | Natural-language question or topic |
| `top_k` | integer | no | `10` | Maximum results to return |
| `threshold` | float | no | `0.70` | Minimum cosine similarity score (0-1) |
| `state` | string | no | `null` | Pre-filter by state (e.g., "Punjab") |
| `district` | string | no | `null` | Pre-filter by district |
| `crop` | string | no | `null` | Pre-filter by crop (e.g., "Wheat") |
| `domain` | string | no | `null` | Pre-filter by domain |
| `season` | string | no | `null` | Pre-filter by season |

**Example request**
```bash
curl -X POST http://127.0.0.1:8001/search_all \
  -H "Content-Type: application/json" \
  -d '{"query": "leaf curling problem in chilli", "top_k": 10, "state": "West Bengal", "crop": "Chilli"}'
```

---

## Response Schema (Result Items)

The objects returned in the `results` array of `/agent_search` and the arrays inside `/search_all` follow this structure:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique MongoDB document ID |
| `question` | string | The original question — use as heading |
| `text` | string | Raw full Q&A (`Question: ...\n\nanswer: ...`) |
| `answer` | string | Clean parsed answer only — use this for the response body |
| `details.state` | string | State (e.g. `"Punjab"`, `"West Bengal"`) |
| `details.district` | string | District name |
| `details.crop` | string | Crop name (e.g. `"Wheat"`, `"Chilli"`) |
| `details.season` | string | Season (`"Rabi"`, `"Kharif"`, `"All year"`) |
| `details.domain` | string | Category (`"Crop Protection"`, `"Disease"`, etc.) |
| `status` | string | Status of the question (API natively pre-filters to only return `"closed"`) |
| `source` | string | Who answered — `"AGRI_EXPERT"` or `"AJRASAKHA"` |
| `score` | float | Cosine similarity (0–1). Higher = more relevant |

---

## Docker Containerization

This API is fully containerized and deployable via Docker.
- The `Dockerfile` handles installing all dependencies and running `uvicorn` on port `8001`.
- A GitHub Action (`.github/workflows/api-deployment.yml`) automatically builds and pushes the image to DockerHub on dispatch.
- **Note:** Ensure you pass your `.env` variables (e.g., `MONGO_URI`, `ANTHROPIC_API_KEY`) at runtime when running the container, as they are intentionally excluded from the image build via `.dockerignore`.
