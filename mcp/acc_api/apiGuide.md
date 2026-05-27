# AgriAI Q&A Semantic Search API

Semantic search over agricultural Q&A entries stored in MongoDB Atlas.  
Given a natural-language query, returns the top-N most relevant questions ranked by vector similarity (MongoDB Atlas Vector Search).

**Model:** `BAAI/bge-large-en` (1024-dimensional dense vectors)  
**Server:** FastAPI + Uvicorn on port `8001`  
**Access:** Anyone connected to the same Tailscale network (`vicharanashala@`)

---

## Endpoints

### 1. `POST /extract` (Human-in-the-Loop)

Designed for Human-in-the-Loop (HITL) architectures. Accepts a raw conversation transcript, uses the local **Gemma LLM** to extract the core question, state, and crop, and then immediately runs them through the sanitization pipeline.

The frontend should present these extracted, sanitized values to a human agent for verification or modification before submitting them to `/search`.

**Request body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | yes | — | Raw conversation transcript or question |

**Example request**
```bash
curl -X POST http://127.0.0.1:8001/extract \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Farmer: My wheat crop in Punjab has yellow leaves. What should I do?"
  }'
```

**Example response**
```json
{
  "extracted_question": "What should I do for yellow leaves in wheat crop?",
  "extracted_state": "Punjab",
  "extracted_crop": "Wheat"
}
```

---

### 2. `POST /search` (Unified Database Search)

Direct semantic search featuring **Native MongoDB Pre-filtering** for maximum performance. This unified endpoint allows you to search across Reviewer Q&A, Golden Q&A, and PoP databases using a single request.

**Request body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | yes | — | Natural-language question or topic |
| `mode` | string | no | `""` | **Search mode.**<br>• `""` (Default): Searches **Reviewer + Golden Q&A** databases.<br>• `"all"`: Searches **Reviewer + Golden Q&A + PoP** databases. |
| `top_k` | integer | no | `10` | Maximum results to return per collection |
| `threshold` | float | no | `0.70` | Minimum cosine similarity score (0-1) |
| `state` | string | no | `null` | Pre-filter by state (e.g., "Punjab") |
| `district` | string | no | `null` | Pre-filter by district |
| `crop` | string | no | `null` | Pre-filter by crop (e.g., "Wheat") |
| `domain` | string | no | `null` | Pre-filter by domain |
| `season` | string | no | `null` | Pre-filter by season |
| `sanitized`| boolean| no | `false` | **Sanitization Flag.**<br>When `true`, applies a 3-tier mapping pipeline to `state` and `crop` inputs to ensure they match valid database records:<br>1. **Normalization**: Title casing and whitespace stripping.<br>2. **Fuzzy Match**: String distance algorithms to fix typos.<br>3. **LLM Fallback**: Uses Gemma LLM to semantically resolve complex inputs (e.g. "Southernmost state" -> "Tamil Nadu"). |

**Unified Response Format**
The response body has been modified to return results categorized by their source database:
- `reviewer`: List of matching Q&A items from the Reviewer Database. Includes newly added fields like `agri_expert` (full name) and `sources` (list of reference links).
- `golden`: List of matching Q&A items from the Golden Database. Includes rich extracted `metadata` (Category, Year, Month, Crop, District, etc.).
- `pop`: List of matching items from the Package of Practices (PoP) database (only included if `mode="all"`).

**Example request**
```bash
curl -X POST http://127.0.0.1:8001/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "leaf curling problem in chilli",
    "mode": "all",
    "top_k": 10,
    "state": "West Bengal",
    "crop": "Chilli"
  }'
```

**Example response**
```json
{
  "reviewer": [
    {
      "id": "69258d...",
      "question": "...",
      "text": "...",
      "answer": "...",
      "details": {
         "state": "West Bengal",
         "crop": "Chilli"
      },
      "status": "closed",
      "source": "AJRASAKHA",
      "score": 0.931,
      "agri_expert": "Satarupa Saha",
      "sources": [
        {
          "source": "https://agritech.tnau.ac.in/...",
          "page": null,
          "source_name": "Crop Protection TNAU"
        }
      ]
    }
  ],
  "golden": [
    {
      "text": "...",
      "question": "...",
      "answer": "...",
      "metadata": {
         "category": "Crop Protection",
         "year": "2025",
         "month": "11",
         "day": "10",
         "crop": "Chilli",
         "district": "Kolkata",
         "block_name": "all",
         "sector": "Agriculture",
         "sector_a": null,
         "season": "Kharif",
         "query_type": "Pest Management",
         "agri_specialist": "John Doe",
         "date": "11-10-2025",
         "source": "https://...",
         "state": "West Bengal"
      },
      "score": 0.852
    }
  ],
  "pop": [
    {
      "text": "...",
      "metadata": {
         "state": "West Bengal"
      },
      "score": 0.741
    }
  ]
}
```

---

### 3. `GET /filters` (Metadata)

Fetches the exact, unique `state` and `crop` values available in the primary Reviewer Q&A database. Use this to populate dropdown menus or validate filters before searching.

**Example request**
```bash
curl -X GET http://127.0.0.1:8001/filters
```

**Example response**
```json
{
  "states": [
    "Andhra Pradesh",
    "Assam",
    "Bihar"
  ],
  "crops": [
    "Apple",
    "Banana",
    "Chilli"
  ]
}
```

---

## Docker Containerization

This API is fully containerized and deployable via Docker.
- The `Dockerfile` handles installing all dependencies and running `uvicorn` on port `8001`.
- A GitHub Action (`.github/workflows/api-deployment.yml`) automatically builds and pushes the image to DockerHub on dispatch.
- **Note:** Ensure you pass your `.env` variables (e.g., `MONGO_URI`, `ANTHROPIC_API_KEY`) at runtime when running the container, as they are intentionally excluded from the image build via `.dockerignore`.
