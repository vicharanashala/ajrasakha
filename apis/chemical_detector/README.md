# Banned/Restricted Chemical Detector API

Checks author-submitted text for banned/restricted chemical names (including
known aliases). Splits the text into 1/2/3-word chunks and fuzzy-matches each
one against the chemical list pulled from Mongo (`type: "chemical"` docs in
the `crop_master` collection), so it still catches close misspellings.

Port `8002`.

## Setup

Copy `.env.example` to `.env` and fill in:

| Var | Default | Description |
|---|---|---|
| `CHEMICAL_DB_URL` | — | Mongo connection string for the chemical staging DB (read-only) |
| `CHEMICAL_DB_NAME` | `agriai` | Database name |
| `CHEMICAL_COLLECTION_NAME` | `crop_master` | Collection holding chemical records (`type: "chemical"`) |

`CHEMICAL_DB_URL` can also be set in the repo root's `.env` as a fallback if
it's not in this folder's `.env` (local-only: this one wins if both set it).
Doesn't apply on Render - each service's vars are set in the dashboard there.

## Endpoints

### `POST /detect-chemicals`

Request:
```json
{ "text": "The farmer sprayed lasso and quinalphos on the field." }
```

Response if something's found:
```json
{
  "matches": [
    { "name": "Alachlor", "status": "Banned" },
    { "name": "Quinalphos", "status": "Restricted" }
  ]
}
```

Response if nothing's found:
```json
{ "message": "No banned or restricted chemical detected" }
```

Errors: empty/whitespace `text` -> `400`, missing or wrong-type `text` -> `422`,
DB unreachable -> `503`.

### `GET /health`

```json
{ "status": "ok", "chemicals_loaded": 90 }
```

## Running it locally

```bash
docker compose up --build
curl -X POST http://127.0.0.1:8002/detect-chemicals \
  -H "Content-Type: application/json" \
  -d '{"text": "sprayed some lasso on the crop"}'
```

Or just open `http://127.0.0.1:8002/docs` in a browser for the interactive Swagger UI.
