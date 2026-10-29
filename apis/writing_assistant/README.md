# Writing Assistant API

Polishes an expert's draft answer (grammar, spelling, clarity only - never
technical content) and checks its structure against the Golden Database's
domain answer structures, before the draft enters the existing peer-review
workflow. Called by the backend while the expert is still editing; nothing
here ever changes the stored draft - the author decides whether to accept a
suggestion.

Two independent checks run on every request:

- **Language polishing** - an LLM rewrite, verified by a technical-content
  guardrail (numbers/units, chemical names, crop names, certainty, negation,
  timing, conditions, treatment identity) before it's ever shown. A rewrite
  is only returned if the guardrail passes.
- **Structural validation** - matches the question to a Golden Database
  reference structure (one of 19 domains x Broad/Narrow, a handful of named
  topics, or a crop-specific variant) and scores the draft's coverage of
  each expected step.

The two results are always separate objects in the response - never merged.

Port `8004`.

## Features

- **Fail-closed, never a silent pass**: a check that couldn't run reports
  `not_run`/`unavailable`, never treated as "nothing wrong".
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
- **Structural coverage scoring**: each expected step is scored
  `covered`/`partial`/`missing` against the draft, with the reference's own
  example/suggestion text surfaced only for a step that isn't fully covered
  - never shown on a step that's already covered, never invented.
- **Section-order checking**: flags a step whose content appears before an
  earlier step's, when both positions can be confidently located.
- **Deterministic on repeated identical requests**: the same `(question,
  draft)` always returns the same result within one running instance
  (`functools.lru_cache` on the two entry points) - a changed draft is a
  cache miss by construction, so this never serves stale data.
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
    "status": "suggested",
    "suggestedText": "Sheath blight is a disease of paddy. Farmers should spray fungicide when needed.",
    "reason": null,
    "guardrail": {
      "status": "passed",
      "checkedTokens": {
        "numbersAndUnits": "n/a",
        "chemicalNames": "n/a",
        "certaintyLanguage": "n/a",
        "negation": "n/a",
        "cropNames": "n/a",
        "treatmentIdentity": "n/a",
        "timing": "n/a",
        "conditions": "n/a",
        "sentenceAlignment": "unchanged"
      },
      "confirmedChange": false,
      "details": [],
      "disclaimer": "These checks reduce the risk of an unintended technical change; they do not prove complete semantic equivalence."
    }
  },
  "structuralValidation": {
    "status": "incomplete",
    "matchedReference": {
      "sourceType": "direct_topic",
      "domain": "Disease Management",
      "code": "PDM",
      "questionType": null,
      "crop": null
    },
    "steps": [
      {
        "slNo": 1,
        "step": "Introduction",
        "coverage": "missing",
        "example": "Sheath Blight (Rhizoctonia solani) is a major paddy disease...",
        "suggestion1": "Name the disease and causal organism directly per the direct-answer rule.",
        "suggestion2": null
      }
    ],
    "clarificationReason": null,
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

`guardrail.checkedTokens.*` is one of `unchanged` / `changed` / `n/a`
(nothing of that kind was present to compare) / `not_run` (that layer
couldn't execute). `guardrail.confirmedChange` is `true` only when a check
actually found a difference - that's what separates `rejected` from
`unavailable` above.

#### `structuralValidation.status`

| Value | Meaning |
|---|---|
| `complete` | Every expected step is `covered`. |
| `partial` | No step is `missing`, but at least one is `partial`. |
| `incomplete` | At least one expected step is `missing`. |
| `needs_clarification` | No confident reference match for the question (out of scope, or genuinely ambiguous between two references) - see `clarificationReason`. |
| `reference_data_unavailable` | The Golden Database itself failed to load - a deploy/config problem, not a question about the draft. |

Each step's `coverage` is `covered` / `partial` / `missing`. `suggestion1`/
`suggestion2` are only ever populated on a non-`covered` step.
`orderWarnings` lists a step whose position in the draft comes before an
earlier step's, only when both positions were confidently located.

### `GET /health`

Always `200`, even when degraded - a monitoring script can always parse the
body instead of branching on HTTP status.

```json
{ "status": "ok", "referenceDataLoaded": true, "releaseId": null, "groupsLoaded": 55 }
```

`referenceDataLoaded: false` means `/polish-draft` will always return
`structuralValidation.status: "reference_data_unavailable"` until the next
deploy/restart - language polishing is unaffected either way.

## Known behavior and limitations

- **Latency**: one `/polish-draft` call makes several sequential LLM calls
  (domain classification, one coverage check per expected step, the rewrite
  itself, a meaning-preservation second opinion) - 10-90+ seconds on a long
  draft is normal, not a hang.
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
- **Structural coverage is semantic, not just lexical** - it uses LLM
  judgment to recognize equivalent wording, with a deterministic safety net
  that downgrades a step to `missing` if no section of the draft has real,
  non-borrowed textual evidence for it. This is a risk-reducing heuristic,
  not a proof of either coverage or absence.
- **Never claims semantic equivalence** - every guardrail result carries a
  disclaimer: these checks reduce the risk of an unintended technical
  change, they do not prove the rewrite means exactly the same thing.

## Setup

Copy `.env.example` to `.env` and fill in:

| Var | Default | Description |
|---|---|---|
| `REFERENCE_DATA_SOURCE` | — | `local` (dev) or `gcs` (prod, not implemented yet). No default - must be set explicitly. |
| `REFERENCE_DATA_DIR` | — | Only for `local`. Local path to the four Golden Database CSVs. Never commit the real files or this path. |
| `MINIMAX_BASE_URL` / `MINIMAX_CHAT_PATH` / `MINIMAX_API_KEY` / `MINIMAX_MODEL` | — | Same names used elsewhere in this repo. See `.env.example` for the production (tailnet) vs. public-API-fallback values. |
| `MINIMAX_SEED` | `0` | Fixed seed on every call - reduces, doesn't eliminate, run-to-run model variance. |
| `CHEMICAL_DB_URL` / `CHEMICAL_DB_NAME` / `CHEMICAL_COLLECTION_NAME` | — / `agriai` / `crop_master` | Same read-only staging Mongo cluster `apis/chemical_detector` uses - same connection string as that service's `.env`. |

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
