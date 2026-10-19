# Banned/Restricted Chemical Detector API

Checks author-submitted text for banned/restricted chemical names, including
known aliases, misspellings, formulation variants, and common obfuscations.
The service is designed for complete agricultural advisories, not only short
chemical-name requests.

Matching is performed in layers:

1. Unicode, case, whitespace, punctuation, and chemical-code normalization.
2. Exact canonical-name and alias matching.
3. Reordered multi-word matching and `ph`/`f` normalization.
4. Formulation suffix handling, such as `Aldrin10G` and `Aldrin-based`.
5. Damerau-Levenshtein typo matching with length-aware edit limits.
6. Fast candidate filtering and caching before expensive comparisons.
7. Biological, scientific-name, entomology, agricultural, regulatory, and
   place-name context scoring.
8. Ambiguity and nested-match suppression.

The context protections are important because agricultural advisories can
contain biological-control organisms, scientific genus/species names, crop and
pest names, fertilizers, and place names that may resemble chemical names.
For example, `Bracon`, `Trichogramma chilonis`, and `endring village` should
not become chemical detections merely because they are close to a database
term.

Fuzzy matching is intentionally conservative for short or ambiguous words.
Canonical chemical names receive stronger confidence than fuzzy aliases, and
weak matches against common English aliases are rejected unless the surrounding
text provides strong chemical-use context. The chemical database remains the
authoritative source; no chemical names are hardcoded in the matching logic.

The detector is designed to balance recall and precision, but no fuzzy
language matcher can guarantee perfect disambiguation for every ambiguous
phrase. Low-confidence behavior should therefore be monitored with real
advisories and regression tests.

Port `8002`.

The current service loads the chemical names and aliases from MongoDB once per
process and keeps indexed candidates in memory. The health endpoint reports the
number loaded.

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
DB unreachable -> `503`, text longer than 100,000 characters or 20,000 words
-> `413`.

### `GET /health`

```json
{ "status": "ok", "chemicals_loaded": 90 }
```

The `chemicals_loaded` value depends on the connected database. It is not a
hardcoded expected count.

## Quality and performance validation

The implementation has been checked with:

- 51 legacy endpoint cases: `51 passed, 0 failed`
- 12 expanded robustness cases: `12 passed, 0 failed`
- 9 expanded context cases: `9 passed, 0 failed`

The expanded checks cover biological-control organisms, scientific names,
entomology terms, common English aliases, place-like language, long advisories,
fertilizer recommendations, mixed chemical and biological advisories,
misspellings, formulation suffixes, chemical codes, letter-spaced text, and
leetspeak.

Candidate indexing and caching substantially reduce processing time for long
advisories compared with scanning every chemical candidate for every word
combination. The first request after startup can be slower because the chemical
data and indexes are loaded; repeated requests use the in-memory indexes.

## Configuration and production notes

- The service reads only chemical records where `type` is `"chemical"`.
- It reads `name`, `status`, and English/native alias representations.
- It does not write to the chemical database.
- No database migration is required for the matching logic.
- The public request and response shapes are stable.
- Use `/health` for readiness checks and `/docs` for interactive testing.

## Running it locally

```bash
docker compose up --build
curl -X POST http://127.0.0.1:8002/detect-chemicals \
  -H "Content-Type: application/json" \
  -d '{"text": "sprayed some lasso on the crop"}'
```

Or just open `http://127.0.0.1:8002/docs` in a browser for the interactive Swagger UI.
