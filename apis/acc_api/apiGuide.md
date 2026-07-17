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

### 4. `GET /gdb/gap-report` (GDB Coverage Gap Detector)

Returns the most recent pre-computed **weekly gap report**: farmer questions the GDB could not answer (the AI agent's 2-hour-disclaimer path), clustered by crop/state/domain and ranked by farmer demand, plus a crop x state x domain coverage heatmap and outreach recommendations. Read-only — never touches `questions`.

The report itself is generated out-of-band by `gap_pipeline.py` (see below), not by this endpoint, so results reflect whenever the pipeline last ran.

**Example request**
```bash
curl -X GET http://127.0.0.1:8001/gdb/gap-report
```

**Example response (trimmed)**
```json
{
  "report_type": "weekly",
  "period_days": 7,
  "generated_at": "2026-07-14T10:00:00Z",
  "total_disclaimers": 214,
  "clusters_found": 18,
  "top_gaps": [
    {
      "cluster_name": "Whitefly attack on cotton during flowering",
      "size": 37,
      "keywords": ["dosage", "flowering", "spray"],
      "crop": "Cotton",
      "states": ["Gujarat"],
      "domains": ["Pest"],
      "growth_rate": 0.6,
      "priority_score": 59.2,
      "priority_level": "CRITICAL",
      "recommended_action": "Draft a GDB answer for Cotton / Pest in Gujarat."
    }
  ],
  "coverage_stats": {
    "heatmap": [
      {"crop": "Cotton", "state": "Gujarat", "domain": "Pest", "gdb_count": 2, "disclaimer_count": 37, "coverage_score": 0.05, "status": "gap"}
    ],
    "covered": 120, "partial": 30, "gaps": 18
  },
  "outreach_recommendations": [
    {"target_state": "Gujarat", "focus_domain": "Pest", "gap_questions": 37, "priority": "HIGH"}
  ]
}
```

Returns `404` until the pipeline has produced at least one report.

**Running the pipeline manually**
```bash
python gap_pipeline.py
```
This connects using the same env vars as `main.py`, builds one report, and inserts it into `GAP_REPORTS_COLLECTION` (default `gdb_gap_reports`, same database as `questions`). Wire this into your existing cron/ops tooling for a weekly cadence — no scheduler is bundled here.

**Running the tests**
```bash
pip install -r requirements-dev.txt
pytest
```

---

## Docker Containerization

This API is fully containerized and deployable via Docker.
- The `Dockerfile` handles installing all dependencies and running `uvicorn` on port `8001`.
- A GitHub Action (`.github/workflows/api-deployment.yml`) automatically builds and pushes the image to DockerHub on dispatch.
- **Note:** Ensure you pass your `.env` variables (e.g., `MONGO_URI`, `ANTHROPIC_API_KEY`) at runtime when running the container, as they are intentionally excluded from the image build via `.dockerignore`.
