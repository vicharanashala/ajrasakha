# Banned/Restricted Chemical Detector API

Standalone FastAPI endpoint that scans author-provided text for banned or
restricted chemical names (and their known aliases), using 1/2/3-word
tokenization plus fuzzy matching (similarity cutoff `0.85`) against the
chemical records in MongoDB (`type: "chemical"` documents in the
`crop_master` collection).

**Server:** FastAPI + Uvicorn on port `8002`

## Config

Copy `.env.example` to `.env` and fill in:

| Var | Default | Description |
|---|---|---|
| `CHEMICAL_DB_URL` | — | Mongo connection string for the chemical staging DB (read-only) |
| `CHEMICAL_DB_NAME` | `agriai` | Database name |
| `CHEMICAL_COLLECTION_NAME` | `crop_master` | Collection holding chemical records (`type: "chemical"`) |

This is intentionally separate from the main app's `DB_URL` — it points at a
different, external, read-only MongoDB cluster.

## Endpoints

### `POST /detect-chemicals`

**Request**
```json
{ "text": "The farmer sprayed lasso and quinalphos on the field." }
```

**Response (match found)**
```json
{
  "matches": [
    { "name": "Alachlor", "status": "Banned" },
    { "name": "Quinalphos", "status": "Restricted" }
  ]
}
```

**Response (no match)**
```json
{ "message": "No banned or restricted chemical detected" }
```

`text` missing/empty returns `400`.

### `GET /health`

```json
{ "status": "ok", "chemicals_loaded": 90 }
```

## Run locally

```bash
docker compose up --build
curl -X POST http://127.0.0.1:8002/detect-chemicals \
  -H "Content-Type: application/json" \
  -d '{"text": "sprayed some lasso on the crop"}'
```
