# AjraSakha Answer Shortener API

Standalone FastAPI service that uses MiniMax-M3 through Samagama to rank
immutable segments from an existing AjraSakha answer. Python selects and copies
the highest-ranked source segments that fit the requested character range. If no
whole-segment selection fits, the same ranking is supplied to MiniMax-M3 for a
source-grounded compression fallback. A successful answer body is always within
50 characters above or below the target.

When an input answer contains either the exact marker `👤 Answered by:` or a
standalone divider line of at least three underscores (such as `___________`),
Python keeps the first recognized boundary and everything after it as an
untouched footer. Only the text before that boundary is sent to MiniMax-M3,
measured, and shortened. The footer is appended verbatim to both returned
answer fields and does not count toward the requested character range.

## Request

`POST /v1/answers/shorten`

```json
{
  "original_query": "How much urea should I apply to wheat?",
  "answer": "The existing AjraSakha answer body...\n\n👤 Answered by: Expert name\n📚 Sources: KVK advisory\n⚠️ Warning text",
  "expected_character_count": 500
}
```

The inclusive accepted range is applied only to the answer body:

```text
max(1, expected_character_count - 50) ... expected_character_count + 50
```

"Character" means one Unicode code point as counted by Python `len()`, after
outer whitespace is trimmed and CRLF/CR newlines are normalized to LF. This is
not JavaScript's UTF-16 `string.length` and is not a user-perceived grapheme
count for combined emoji or combining marks.

The response provides:

- `short_answer`: selected body segments plus the preserved footer;
- `full_answer`: the complete normalized input answer;
- `original_character_count` and `actual_character_count`: body-only counts;
- `footer_character_count`: the separately preserved footer count.

The server returns an already-compliant answer without calling MiniMax-M3. If an
answer is too short to reach the requested range without adding content, the
request is rejected because this API only shortens text.

## How source-only shortening is controlled

1. Python splits the normalized source answer into exact, offset-backed sentence
   and line segments.
2. MiniMax-M3 receives the query and those immutable segments, but may return only a
   JSON ranking of segment IDs. It never writes the response body.
3. Python chooses the highest-priority whole-segment combination that fits the
   inclusive target range and restores selected segments to source order.
4. Python constructs the final response by copying exact source slices. It
   retains one line break only where the original source separated the selected
   segment with a line break; otherwise it joins selected sentences with one
   space.

When exact extraction succeeds, every answer-body content block is a verbatim
substring of the normalized request body; case, punctuation, numbers, units,
URLs, and internal whitespace are unchanged. The reviewer footer is copied
directly from the normalized request and is never supplied to MiniMax-M3.
Mandatory detected safety segments in the body are always included for exact
extraction. Query relevance is MiniMax-M3's ranking judgment, while source
provenance and character length are enforced deterministically by Python.

If no combination of whole source segments can fit the ±50 range, the API
reuses the one relevance ranking for a constrained MiniMax-M3 compression
attempt. The fallback is range-checked and rejects newly introduced URLs,
measurements, or writing scripts. Invalid model ranking JSON and invalid
compression candidates are retried up to three times.

## Local setup (PowerShell)

Install Python 3.10 or newer first. Python 3.12 matches the Docker image. During
Windows installation, enable the option that adds Python and the `py` launcher
to `PATH`.

From `C:\ajrasakha\ai`, create the project-level environment if it does not
already exist:

```powershell
py -3.11 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r .\ajrasakha\tools\answer_shortener\requirements-dev.txt
```

For a non-Docker run, an existing `C:\ajrasakha\ai\.env` can be used instead;
the service discovers it automatically. Define each variable in only one of
these files. A service-local `.env` takes precedence if both exist. Docker
Compose intentionally expects the service-local `.env` or environment variables
injected by the deployment platform.

Open the chosen `.env` file in a text editor and replace only the
`SAMAGAMA_API_KEY` placeholder with the provided Samagama key. Do not paste that
key into source code, a request body, Swagger, or the `X-API-Key` header.

Start the API and leave this PowerShell window open:

```powershell
Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue; & 'C:\ajrasakha\ai\.venv\Scripts\python.exe' -m uvicorn ajrasakha.tools.answer_shortener.api:app --app-dir 'C:\ajrasakha\ai' --host 127.0.0.1 --port 8007
```

Open `http://127.0.0.1:8007/docs` for Swagger UI.

In a second PowerShell window, verify both health endpoints:

```powershell
Invoke-RestMethod http://127.0.0.1:8007/health
Invoke-RestMethod http://127.0.0.1:8007/health/ready
```

`/health/ready` returns HTTP 503 until a non-placeholder Samagama key is
loaded. Restart the server after changing `.env`.

Example that is long enough to exercise MiniMax-M3 rather than the passthrough or
expansion-rejection branches:

```powershell
$answer = @'
For wheat, determine urea application from a soil test and the local agricultural recommendation. If a field-specific recommendation is not available, the existing AjraSakha answer recommends 50 kg/acre in two split doses. Apply the first half at sowing and the remaining half after the first irrigation, when the crop is actively growing. Spread it uniformly on moist soil and irrigate according to local field conditions. Do not apply urea immediately before heavy rain. Keep fertilizer away from direct contact with germinating seed. Excess nitrogen can cause soft growth and lodging, so do not add another dose only because nearby fields look greener. Recheck the crop condition before the second application and follow any stricter local advisory.
'@

$body = @{
  original_query = "How much urea should I apply to wheat, and when?"
  answer = $answer
  expected_character_count = 350
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8007/v1/answers/shorten `
  -ContentType application/json `
  -Body $body
```

If `ANSWER_SHORTENER_API_KEY` is configured, also pass:

```powershell
-Headers @{ "X-API-Key" = "the-service-api-key" }
```

`ANSWER_SHORTENER_API_KEY` protects this FastAPI endpoint and is different from
`SAMAGAMA_API_KEY`, which only the server uses to call MiniMax-M3 through
Samagama.

## Docker (local only)

From the service directory:

```powershell
Set-Location C:\ajrasakha\ai\ajrasakha\tools\answer_shortener
docker compose up --build
```

Compose publishes container port 8007 as `127.0.0.1:8112`, so other machines
cannot reach it through the published port. The container listens on `0.0.0.0`
internally only because Docker requires that for port forwarding.

## Access and deployment

- Running Uvicorn with `--host 127.0.0.1` is accessible only from this laptop.
- No CORS middleware is enabled. CORS is not authentication; non-browser clients
  could still call any network-reachable deployment.
- `ANSWER_SHORTENER_API_KEY` is optional for local development. It should be set
  in deployment so callers must provide `X-API-Key`.
- `SAMAGAMA_API_KEY` and `ANSWER_SHORTENER_API_KEY` must be runtime secrets and
  must never be committed or placed in a Docker image.
- Deployment is not performed by this project setup. A deployer must choose the
  host, private network/reverse proxy, TLS, secret injection, and firewall rules.

## Tests

From `C:\ajrasakha\ai`:

```powershell
Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue; & 'C:\ajrasakha\ai\.venv\Scripts\python.exe' -m pytest ajrasakha/tools/answer_shortener/tests -q
```

These tests use fake MiniMax-M3 responses and make no network request, so they
do not need a real Samagama key.
