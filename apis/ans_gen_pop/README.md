# ans_gen_pop — PoP answer generation API

FastAPI service that retrieves Package of Practices (PoP) context from **pop_v2**, filters chunks with an LLM, then generates a farmer-facing answer from the relevant excerpts. Answers are PoP-only and do **not** include the AjraSakha agent expert-review / 2-hour footer.

## Prerequisites

- **pop_v2** REST API running (default `http://localhost:9003`; Docker often exposes `9025:9003`)
- **LLM** OpenAI-compatible endpoint (Gemma)

If `/generate` returns `503` with a pop_v2 connection error, check readiness:

```bash
curl http://localhost:9016/health/ready
```

Fix `POP_V2_API_URL` in `.env` (port **9118 is not** the pop_v2 API — use **9003** or host-mapped **9025**), then restart ans_gen_pop.

## Configuration

Copy `.env.example` to `.env` and set:

| Variable | Description |
|----------|-------------|
| `POP_V2_API_URL` | Base URL for pop_v2 (e.g. `http://localhost:9003`) |
| `LLM_API_URL` | Chat completions URL |
| `LLM_MODEL` | Model name (e.g. `google/gemma-4-26B-A4B-it`) |
| `ANS_GEN_POP_PORT` | Listen port (default `9016`) |

## Run locally

```bash
cd apis/ans_gen_pop
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 9016
```

## API

### `GET /health`

Health check.

### `POST /generate`

**Request:**

```json
{
  "query": "When should I apply urea for wheat?",
  "state": "Punjab",
  "crop": "Wheat"
}
```

**Response:**

```json
{
  "answer": "...",
  "contexts": [{ "text": "...", "meta_data": { "similarity_score": 0.87, ... } }],
  "sources": [{ "doc_id": "...", "source_url": "...", ... }],
  "similarity_scores": [0.87]
}
```

### Example

```bash
curl -s -X POST http://localhost:9016/generate \
  -H "Content-Type: application/json" \
  -d '{"query":"nitrogen management for wheat","state":"Punjab","crop":"Wheat"}' | jq
```

## Docker

```bash
docker compose up --build
```

Ensure `POP_V2_API_URL` points to a reachable pop_v2 instance (e.g. `http://host.docker.internal:9003` on Docker Desktop).

## Workflow

1. `POST /pop/context` on pop_v2 (vector search + cosine scoring)
2. LLM relevance filter on retrieved chunks
3. LLM answer generation from filtered PoP text only
