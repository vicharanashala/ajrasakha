# FFV Generator API

A small FastAPI service that turns an expert agricultural question/answer pair
into **farmer-friendly versions (FFVs)**: short, plain-language question/answer
pairs, one per relevant *angle* (e.g. "Irrigation Scheduling").

It reuses the logic in `ai/ajrasakha/ffv/scripts/generate_ffvs.py` (domain
taxonomy, prompts, Claude calls) and exposes it over HTTP for a single Q&A pair.

---

## Technical details

### How a request is processed

```
POST /generate-ffv
   |
   |-- 1. validate input (question / answer not blank)
   |-- 2. build Anthropic client (needs ANTHROPIC_API_KEY)
   |-- 3. domain
   |        |- supplied in body  -> validated against the 13 known domains (no model call)
   |        '- omitted / blank   -> classified by Claude
   |-- 4. select 2-6 angles for that domain (Claude)
   |-- 5. for each angle: generate one farmer-friendly Q&A (Claude)
   '-- 6. return { domain, versions[] }
```

Roughly `2 + (number of angles)` Claude calls per request (1 fewer if you pass
`domain`), made sequentially, so a request typically takes several seconds to
tens of seconds.

### Domains

`domain` must exactly match one of these (case-sensitive):

1. Soil Health and Nutrient Management
2. Irrigation and Water Management
3. Pest and Disease Management
4. Crop Production and Management
5. Weather and Climate
6. Harvesting and Post-Harvest
7. Marketing and Economics
8. Government Schemes and Subsidies
9. Organic Farming
10. Technology and Innovation
11. Livestock and Animal Husbandry
12. Training and Advisory
13. Rural Infrastructure

Each domain has its own list of angles (defined in `generate_ffvs.py`,
`agricultural_domains`).

### Project layout

| Path | Purpose |
|---|---|
| `main.py` | FastAPI app, request/response models, error handling |
| `requirements.txt` / `requirements-dev.txt` | Runtime / test dependencies |
| `Dockerfile`, `Dockerfile.dockerignore`, `docker-compose.yml` | Container build and run |
| `.env.example` | Template for configuration |
| `tests/` | Unit tests (no network) and live tests (real MongoDB + Anthropic) |
| `../../ai/ajrasakha/ffv/scripts/generate_ffvs.py` | Shared generation logic (not modified by this service) |

`main.py` finds `generate_ffvs.py` in either `<repo>/ai/ajrasakha/ffv/scripts/`
(local checkout) or `./ffv_scripts/` next to itself (Docker image).

### Notes on behaviour

- **`temperature` is stripped.** `generate_ffvs.py` passes `temperature=` to
  `client.messages.create`, which the installed SDK/model rejects. `main.py`
  wraps the client and removes that argument, so the API's sampling default
  applies.
- **Provider errors are surfaced, not hidden.** Errors from Anthropic are mapped
  to HTTP errors (see below) instead of silently falling back to a default
  domain.
- **Partial results are allowed.** If some angles fail to generate but at least
  one succeeds, you get `200` with only the successful angles.

### Errors

| Status | When |
|---|---|
| `400` | `question` or `answer` is blank, or `domain` is not one of the 13 valid names (the response lists them) |
| `422` | Body is malformed or `question` / `answer` is missing (FastAPI validation) |
| `429` | Anthropic rate-limited the request - retry shortly |
| `500` | Server has no `ANTHROPIC_API_KEY` configured |
| `502` | Anthropic returned an error (including rejecting the server's key), or no versions could be generated |
| `504` | Anthropic timed out |

Error bodies look like `{"detail": "..."}`.

---

## Requirements

- Python **3.10+** (Docker image uses 3.10; developed on 3.12)
- An **Anthropic API key**
- Python packages (`requirements.txt`): `fastapi`, `uvicorn[standard]`,
  `pydantic`, `python-dotenv`, `anthropic`, `pymongo`
  (`pymongo` is required because `generate_ffvs.py` imports it)
- For tests only (`requirements-dev.txt`): `pytest`, `httpx`
- For the live tests only: a reachable MongoDB with a `questions` collection
- Optional: Docker + Docker Compose

> Dependencies are currently unpinned. Pin the versions you have tested
> (`pip freeze`) before deploying so builds are reproducible.

### Configuration

Copy `.env.example` to `.env` and fill it in. A `.env` in the repo root is also
read as a fallback; this directory's `.env` takes priority.

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Anthropic API key |
| `CLAUDE_MODEL` | no | Model name (default `claude-sonnet-4-5`) |
| `MONGO_URI` | tests only | Used by the live tests to read sample questions |
| `MONGO_DB` | tests only | Database name (default `agriai`) |

Use `KEY=value` (an `=`, not `-`) on every line.

---

## Running

### Locally (without Docker)

1. Create a virtual environment and install dependencies:

   ```bash
   cd apis/ffv_api
   python -m venv .venv

   # Windows
   .venv/Scripts/python.exe -m pip install -r requirements.txt

   # Mac / Linux
   source .venv/bin/activate && pip install -r requirements.txt
   ```

2. Create `apis/ffv_api/.env` (copy `.env.example` as a starting point) and set
   your key:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   `CLAUDE_MODEL` is optional - it defaults to `claude-sonnet-4-5` (read from
   `ai/ajrasakha/ffv/scripts/generate_ffvs.py`).

3. Start the server:

   ```bash
   # Windows
   .venv/Scripts/python.exe -m uvicorn main:app --port 8003

   # Mac / Linux (venv activated)
   uvicorn main:app --port 8003
   ```

4. Check it is up:

   ```bash
   curl http://127.0.0.1:8003/health      # -> {"status":"ok"}
   ```

   Then open the Swagger UI at http://127.0.0.1:8003/docs.

The service listens on **port 8003**. It must be run from a full repo checkout,
because it imports `generate_ffvs.py` from `ai/ajrasakha/ffv/scripts/`.

### Docker

The build context is the **repo root** (the image needs `generate_ffvs.py` from
`ai/`), so use the compose file:

```bash
cd apis/ffv_api
docker compose up --build
```

`docker-compose.yml` reads `../../.env` and `./.env`; both files must exist (or
mark them `required: false`).

### Tests

```bash
pip install -r requirements-dev.txt
pytest tests -m "not live"     # unit tests - free, no network
pytest tests -m live           # live tests - real MongoDB + Anthropic calls (costs API usage)
```

---

## Input and output

### `POST /generate-ffv`

**Request body** (`application/json`)

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | yes | The original question. Must not be blank. |
| `answer` | string | yes | The detailed expert answer. Must not be blank. |
| `domain` | string | no | One of the 13 domain names above. If omitted or blank, it is classified automatically. |

```json
{
  "question": "How often should I irrigate wheat?",
  "answer": "Wheat needs about 4-6 irrigations, at crown root initiation, tillering, jointing, flowering and grain filling stages.",
  "domain": "Irrigation and Water Management"
}
```

**Response `200`**

| Field | Type | Description |
|---|---|---|
| `domain` | string | The domain used - the one you supplied, or the auto-detected one |
| `versions` | array | One entry per selected angle (2-6). Angles that failed to generate are omitted. |
| `versions[].angle` | string | The angle covered |
| `versions[].question` | string | Farmer-friendly question for that angle |
| `versions[].answer` | string | Short farmer-friendly answer for that angle |

```json
{
  "domain": "Irrigation and Water Management",
  "versions": [
    {
      "angle": "Irrigation Scheduling",
      "question": "<farmer-friendly question>",
      "answer": "<short farmer-friendly answer>"
    }
  ]
}
```

(The values above are placeholders - real output depends on the model.)

**Example**

```bash
curl -X POST http://localhost:8003/generate-ffv \
  -H "Content-Type: application/json" \
  -d '{"question": "How often should I irrigate wheat?", "answer": "Wheat needs about 4-6 irrigations ...", "domain": "Irrigation and Water Management"}'
```

### `GET /health`

Returns `{"status": "ok"}`. Use it for liveness checks.

---

## Swagger UI

FastAPI generates interactive docs automatically. With the service running:

| URL | What |
|---|---|
| http://localhost:8003/docs | **Swagger UI** - try requests in the browser |
| http://localhost:8003/redoc | ReDoc - read-only reference |
| http://localhost:8003/openapi.json | Raw OpenAPI schema |

To try the endpoint: open `/docs` -> **POST /generate-ffv** -> **Try it out** ->
edit the example body -> **Execute**. The page documents every field, the
example request, and the 400 / 429 / 500 / 502 / 504 responses.
