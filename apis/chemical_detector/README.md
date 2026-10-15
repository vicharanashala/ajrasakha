# Banned/Restricted Chemical Detector API

Checks author-submitted text for banned/restricted chemical names (including
known aliases). Splits the text into word-chunks (sized up to however many
words the longest real chemical name has) and fuzzy-matches each one against
the chemical list pulled from Mongo (`type: "chemical"` docs in the
`crop_master` collection), so it still catches close misspellings, reordered
words, "ph"/"f" spelling, formulation-code suffixes, leetspeak, and
letter-spaced obfuscation.

Fuzzy matching uses a word-frequency check (`wordfreq`) to tell "a real
chemical name typo" apart from "a real English word that just looks
similar" - e.g. "methyl" and "ammonium sulphate" require a near-exact match
since they're genuine words, while "akdrin" (meaningless on its own) gets a
more lenient one. See the comments above `_fuzzy_lookup` in `main.py` for
the exact rule and its one known gap (a word that coincidentally resembles a
chemical name but isn't in frequency data either, e.g. a place name).

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
