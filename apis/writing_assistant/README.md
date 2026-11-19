# Writing Assistant API

Polishes an expert's draft answer (grammar, spelling, clarity only - never
technical content) and checks it against one fixed, built-in checklist of
expected steps, before the draft enters the existing peer-review workflow.
Called by the backend while the expert is still editing; nothing here ever
changes the stored draft - the author decides whether to accept a
suggestion.

Two checks run on every request, always as two separate objects in the
response - never merged into one verdict:

- **Structural validation** - scores the draft's coverage of one fixed,
  domain-neutral checklist of 10 expected steps (`structural_validator.
  FIXED_STEPS`: Introduction, major-or-minor, confirm identification,
  severity, a decision threshold, escalating response options, safety,
  conclusion), using LLM reasoning to judge whether each step's actual
  content is real and valid - not just whether a matching heading exists.
  A heading with blank or gibberish content, or content that actually
  belongs to a different step (e.g. a "Conclusion" heading whose text is
  really introductory background), is scored `missing` for that step.
  There is no per-question domain/topic matching against any reference
  database - the same checklist applies to every question, regardless of
  subject. Runs first.
- **Language polishing** - an LLM rewrite, verified by a technical-content
  guardrail (numbers/units, chemical names, crop names, certainty, negation,
  timing, conditions, treatment identity) before it's ever shown. A rewrite
  is only returned if the guardrail passes - and, per a team requirement,
  only attempted at all once structural validation finds every step
  `covered` (`structuralValidation.status: "complete"`). A draft missing or
  partially covering a step gets `languagePolishing.status: "skipped"`
  instead - the step report is the whole answer in that case, so the
  (slower) rewrite+guardrail call is skipped rather than computed and
  discarded.

Port `8004`.

## Features

- **Fail-closed, never a silent pass**: a check that couldn't run reports
  `not_run`/`unavailable`/`not_assessed`, never treated as "nothing wrong".
- **Rejected vs unavailable, kept distinct**: `rejected` means a check
  actually found a difference; `unavailable` means a check couldn't be
  completed (a dependency outage, an uncertain rewrite) - the two look very
  different to an author and are never conflated.
- **Section-aware technical-content guardrail**: aligns the original and
  the rewrite section-by-section, then sentence-by-sentence within each
  section; falls back to a whole-section, then a whole-document comparison
  rather than refusing to check a rewrite outright.
- **Standalone chemical-name check**: matches against the same banned/
  restricted-chemical staging database `apis/chemical_detector` uses, but
  in-process (no HTTP call to that sibling service, no shared failure mode).
- **Structural coverage scoring**: each of the 10 fixed steps is scored
  `covered`/`partial`/`missing` against the draft, with the checklist's own
  example/suggestion text surfaced only for a step that isn't fully covered
  - never shown on a step that's already covered, never invented.
- **Section-order checking**: flags a step whose content appears before an
  earlier step's, when both positions can be confidently located.
- **Deterministic on repeated identical requests**: the same `(question,
  draft)` always returns the same result within one running instance - a
  changed draft is a cache miss by construction, so this never serves stale
  data.
- **One stalled coverage check doesn't fail the whole request**: a step
  whose check fails even after a retry is reported as `not_assessed` for
  that step alone - every other step is still scored normally.
- **Hindi (Devanagari script) support**: a verified, bounded set of
  negation/crop terms and the transliterated "din" (day/days) unit are
  recognized - not full Hindi vocabulary coverage, see Limitations.

## Endpoints

### `POST /polish-draft`

Request:
```json
{
  "question": "How to control Sheath Blight in paddy?",
  "draft": "Sheath blight are a disease of paddy. Farmer should spray fungicide when needed."
}
```

Response:
```json
{
  "requestId": "e92083db-...",
  "languagePolishing": {
    "status": "skipped",
    "suggestedText": null,
    "reason": "Structural validation found missing or partial step(s): Introduction, so a polish suggestion was not generated.",
    "guardrail": null
  },
  "structuralValidation": {
    "status": "incomplete",
    "steps": [
      {
        "slNo": 1,
        "step": "Introduction",
        "coverage": "missing",
        "example": "States the specific problem or question being addressed and gives a brief overview of the approach the rest of the answer will take.",
        "suggestion1": "Name the specific issue or topic directly instead of opening with generic background.",
        "suggestion2": null
      }
    ],
    "orderWarnings": []
  },
  "warnings": [],
  "errors": []
}
```

#### `languagePolishing.status`

| Value | Meaning |
|---|---|
| `suggested` | A rewrite passed every guardrail check - safe to show the author. |
| `rejected` | A check **found** a difference that could change the meaning. `reason` and `guardrail.details` say what. |
| `unavailable` | A check **could not be completed** (LLM outage, a dependency down, an uncertain rewrite) - nothing was found wrong, it just couldn't be verified. |
| `skipped` | **Not attempted** - `structuralValidation.status` was not `complete` (a step was `missing`/`partial`/`not_assessed`), so no rewrite was requested. `reason` names the gap steps. Distinct from `unavailable`: this check never ran at all, rather than running and failing. |

`languagePolishing.changes` lists the specific before/after pairs where
`suggestedText` actually differs from the original draft - the same
alignment the guardrail checks against (sentence-level within a section,
falling back to a whole section or whole document on a count mismatch),
so a caller doesn't have to diff the whole document itself to see what
changed. Populated only when `status` is `suggested` - `null` otherwise
(same as `suggestedText` itself never appearing for a rejected/
unavailable/skipped result). An empty list (`[]`) is a real, meaningful
value here: the rewrite was generated and shown, but needed no actual
fix (byte-identical to the original). Example:
```json
"changes": [
  { "before": "Sheath blight are a disease of paddy.", "after": "Sheath blight is a disease of paddy." }
]
```

`guardrail.checkedTokens.*` is one of `unchanged` / `changed` / `n/a`
(nothing of that kind was present to compare) / `not_run` (that layer
couldn't execute). `guardrail.confirmedChange` is `true` only when a check
actually found a difference - that's what separates `rejected` from
`unavailable` above.

#### `structuralValidation.status`

| Value | Meaning |
|---|---|
| `complete` | Every one of the 10 fixed steps is `covered`. |
| `partial` | No step is `missing`, but at least one is `partial` or `not_assessed` (see below). |
| `incomplete` | At least one of the 10 fixed steps is `missing`. |

Each step's `coverage` is `covered` / `partial` / `missing` / `not_assessed`.
`not_assessed` means every majority-vote call for that one step failed (a
model timeout) - distinct from `missing` on purpose: it is
never reported as "confirmed absent", only as "could not be checked". A
single step's `not_assessed` no longer aborts the whole response; every
other step is scored normally. `suggestion1`/`suggestion2` are populated
on any non-`covered` step, `not_assessed` included.
`orderWarnings` lists a step whose position in the draft comes before an
earlier step's, only when both positions were confidently located.

### `GET /health`

Always `200` - this service has no external data dependency to load at
startup; the Gemini and chemical-DB dependencies it calls per-request
already fail closed on their own, per request.

```json
{ "status": "ok" }
```

## Known behavior and limitations

- **Latency**: one `/polish-draft` call makes only ~4-5 LLM calls in the
  common case - one call now scores the *whole* 10-step checklist at
  once (majority-voted up to 3x at the call level, so ~2-3 calls total,
  not 30), the rewrite is one whole-document call (not one per section),
  and the meaning-preservation second opinion checks every changed
  section in one batched call (not one per section). Falls back to the
  slower per-section polish path only if the whole-document rewrite call
  fails outright or returns a mismatched section count. Structured
  output (`responseSchema`) is used for every JSON-returning call, which
  live-confirmed eliminates the markdown-fence-wrapping failure mode
  entirely for those calls. The timeout budgets and concurrency cap below
  were originally carried over unchanged from the self-hosted MiniMax
  model this service used before; `_HEDGE_DELAY_SECONDS` has since been
  re-tuned (to 18s) for the new, heavier-per-call shape, but the timeout/
  concurrency-cap *values* themselves are still MiniMax-derived starting
  points, not yet re-validated against sustained real Gemini traffic. A
  rare single call taking the full configured timeout before failing
  (hedged after `_HEDGE_DELAY_SECONDS`) is treated as expected,
  occasional model variance, not a hang to debug.
- **Determinism is per-process, not global**: the result cache lives in
  memory on the running instance. It resets on a redeploy/restart, and (if
  ever scaled beyond one instance) is not shared across instances.
- **The underlying model isn't perfectly consistent on *different* inputs**:
  caching fixes "the exact same request twice gives different answers" by
  construction. It does not and cannot make the model agree with itself on
  two *different*-but-similar drafts - that's an inherent property of the
  model, not a bug.
- **Hindi/Hinglish support is bounded**: Devanagari digits, the
  transliterated unit "din", and a small set of verified negation/crop
  terms are recognized. Most Hindi vocabulary (chemical/treatment terms,
  timing words) is not - a Hindi draft can still be polished, but the
  guardrail's fact-preservation checks will mostly read `n/a` for it.
- **Structural coverage is entirely LLM judgment** - majority-voted
  (up to 3x, at the whole-checklist call level) for stability, but not
  backed by any deterministic keyword/vocabulary check. An earlier version downgraded a step to
  `missing` when the draft shared no vocabulary with that step's own
  example text; removed once the checklist became domain-neutral, since
  a real draft's topic-specific content naturally shares no vocabulary
  with an abstract, generic step description - live-confirmed that
  heuristic was wrongly downgrading genuinely-covered steps to `missing`
  once the checklist stopped being per-topic curated text.
- **Never claims semantic equivalence** - every guardrail result carries a
  disclaimer: these checks reduce the risk of an unintended technical
  change, they do not prove the rewrite means exactly the same thing.
- **No per-topic reference content**: the 10-step checklist is fixed and
  domain-neutral by explicit team decision - it does not check for a
  specific pest/disease/scheme's own technical details, only whether the
  draft has real, substantive content addressing each generic step.

## Setup

Copy `.env.example` to `.env` and fill in:

| Var | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | Required. Team-provided key for the public Gemini API. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | The model this endpoint calls. |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Gemini's public REST endpoint - no tailnet/proxy needed, unlike the self-hosted MiniMax model this replaced. |
| `GEMINI_SEED` | `0` | Fixed seed on every call - reduces, doesn't eliminate, run-to-run model variance. Not yet verified live that Gemini's own seed support has the same effect the old MiniMax client showed. |
| `GEMINI_TIMEOUT_SECONDS` | `20` | Per-call budget - carried over unchanged from the self-hosted-MiniMax tuning at the team's request. Re-validate against real Gemini traffic. |
| `GEMINI_COVERAGE_TIMEOUT_SECONDS` | `30` | Budget for `classify_all_steps_coverage` (one call scores the whole 10-step checklist, run up to 3x as a call-level majority vote - ~2-3 calls per request, not 30). Starting value carried over from the MiniMax tuning. |
| `GEMINI_POLISH_TIMEOUT_SECONDS` | `30` | Budget for `generate_polish` (whole-document, with a per-section fallback) and `check_meaning_preserved_batch` (one call per request in the common case). Starting value carried over from the MiniMax tuning. |
| `GEMINI_MAX_CONCURRENT_CALLS` | `5` | Process-wide cap on real concurrent calls (primary + hedge). Carried over from the MiniMax tuning (derived from that model's own vLLM `/metrics` under load) - has no equivalent evidence behind it for Gemini's own rate limits yet. |
| `CHEMICAL_DB_URL` / `CHEMICAL_DB_NAME` / `CHEMICAL_COLLECTION_NAME` | — / `agriai` / `crop_master` | Same read-only staging Mongo cluster `apis/chemical_detector` uses - same connection string as that service's `.env`. Unaffected by the Gemini switch. |

## Deployment

The container respects `$PORT` (defaults to `8004` if unset) - required for
Cloud Run, which injects its own `$PORT` and expects the container to listen
on it.

No Tailscale/tailnet setup is needed - Gemini's public API is directly
reachable over HTTPS, so `scripts/start.sh` just starts Uvicorn directly.
(The previous self-hosted MiniMax model needed a tailnet to reach its
100.x address; that setup has been removed along with the client.)

No reference data needs to be mounted or provisioned - structural
validation uses one fixed, built-in checklist (`structural_validator.
FIXED_STEPS`), not an external Golden Database.

## Running it locally

```bash
docker compose up --build
curl -X POST http://127.0.0.1:8004/polish-draft \
  -H "Content-Type: application/json" \
  -d '{"question": "How to control Sheath Blight in paddy?", "draft": "Sheath blight is a disease of paddy."}'
```

Or open `http://127.0.0.1:8004/docs` for the interactive Swagger UI.

Run the test suite:
```bash
pytest
```
