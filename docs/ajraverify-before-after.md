# AjraVerify — Before / After Report

Written 2026-10-02. Every claim below is backed by an artifact from the running
local system: receipts, question documents, test output and HTTP responses.
Machine-readable companion: `docs/ajraverify-before-after.html`.

**One line:** AI-generated agricultural answers went from *shipped with zero
checking* to *checked by a deterministic gate before delivery, with four
verdicts, a persisted audit receipt on every decision, and escalation into the
existing expert review workflow* — with no LLM calls anywhere on the decision
path.

---

## 1. Before — the gap (still observable in the local DB)

An AI answer was generated (or uploaded) and delivered/reviewed with **no
verification of any kind**. Nothing parsed the dosage, checked the chemical, or
left an audit record. The only filter was a human reading it later.

Live artifact kept for the demo:

| Artifact | Value |
|---|---|
| Question id | `6abe12e0997a10320b06553d` ("What dosage of monocrotophos 36% SL should I spray on my cotton crop, and how often?") |
| AI answer stored | "Spray monocrotophos 36% SL at 25 ml per litre of water, about 500 ml per acre. Repeat the spray every 5 days for 3 sprays. …" |
| `aiAnswerVerification` field | `null` — no verdict |
| Receipts for this question | none (the `verification_receipts` collection still has no document with this questionId) |

This answer recommends a banned/restricted insecticide at 25 ml/L every 5 days
for 3 sprays, and before AjraVerify nothing in the pipeline noticed.

## 2. After — what the pipeline does now

```
AI answer text
   ↓  RuleBasedClaimExtractor      (regex, format-only — no agriculture facts in code)
   ↓  ClaimResolver                (chemical name/status vs chemical_master + crop_master)
   ↓  PolicyEngine                 (deterministic counters → 4 verdicts)
   ↓  VerificationReceiptRepository(verification_receipts, indexed audit record)
   ↓  question.aiAnswerVerification{verdict, reason, receiptId}  ← rides with the question
      into the existing expert review queue
```

- **Verdicts:** `VERIFIED` → all matched within tolerance · `CONDITIONAL` →
  minor deviation, deliver with receipt · `REVIEW_REQUIRED` → a claim (or an
  unattributable dose) matched nothing trusted · `BLOCKED` → restricted/banned
  chemical in the catalogue, or a value beyond the 50% safety tolerance.
- **No facts in code:** the extractor only recognises *shapes*. Whether
  "monocrotophos" exists, and whether it is `Approved`, `Restricted` or
  `Banned`, is read from the catalogue documents at runtime (proof in §3.2).
- **Evidence-first:** every decision persists a receipt (claims, per-claim
  resolutions, reason, counters, policy thresholds, extractor id, timestamp).
  A receipt write failure can never block or change the decision.
- **Wired into ingestion (M1.5):** the question-processor worker runs the gate
  on the AI initial answer and stores the verdict + linked receipt on the
  question; the WhatsApp/AI-ship approval path does the same before an LLM
  answer is marked shipped. Both are best-effort — verification never stalls
  the pipeline.
- **Off by default:** `ENABLE_AJRAVERIFY=true` in `backend/.env` turns it on.

## 3. Evidence from the running system (2026-10-02)

### 3.1 Ingestion, end-to-end

Admin bulk upload (same unsafe answer text as §1), `allocationMode=pae_expert`:

| Artifact | Value |
|---|---|
| Question id | `6abf84086c4139d68ea7f5bc` |
| `aiAnswerVerification` on the document | `{"verdict":"REVIEW_REQUIRED","reason":"1 claim could not be matched against trusted data — expert review required before delivery.","receiptId":"6abf84086c4139d68ea7f5bd"}` |
| `GET /api/verification/receipt/6abf84086c4139d68ea7f5bc` | HTTP 200, receipt linked to the question (`questionId: "6abf84086c4139d68ea7f5bc"`), dosage claims attributed to subject `"monocrotophos"` |

Same answer text, same pipeline, two different outcomes: §1 (before) has no
verdict and no receipt; §3.1 (after) has both, attached to the question.

### 3.2 Data-driven, not code-driven

Identical answer text each run; only a `chemical_master` document was changed
(none → Restricted → Approved), no code or config touched:

| Catalogue state for `Monocrotophos` | Verdict | Receipt id |
|---|---|---|
| no entry | `REVIEW_REQUIRED` — "1 claim could not be matched…" | `6abf81be66c31ab082675ac8` |
| entry, status `Restricted` | **`BLOCKED`** — "Blocked: 1 restricted/banned chemical in the trusted catalogue." | `6abf81cf66c31ab082675aca` |
| entry, status `Approved` | `VERIFIED` — "All factual claims matched trusted data within tolerance." | `6abf81cf66c31ab082675acb` |

Seeds were removed afterwards; the catalogue is left exactly as found. All
receipts listed here remain in `verification_receipts` as the audit trail.

### 3.3 Receipt store state at time of writing

`GET /api/verification/receipts` — total **18** receipts:
`VERIFIED 5 · CONDITIONAL 0 · REVIEW_REQUIRED 10 · BLOCKED 3`.
The verdict filter returns the count that matches the filter (the list and its
total always agree).

### 3.4 API hardening verified live

| Call | Result |
|---|---|
| `POST /check` with blank `answerText` | 400 (DTO validation) |
| `GET /receipts?verdict=NOT_A_VERDICT` | 400 (`IsIn` filter) |
| `GET /receipt/:id` with malformed id | 400 |
| `GET /receipt/<unknown question>` | 404 with a clear message |
| Auth via `x-internal-api-key` **and** Firebase JWT | both accepted (`FlexibleAuth`) |

## 4. Tests

- **36 offline vitest specs** in 4 files (`extractors`, `services`,
  `repositories` mocked): extractor shapes (units, ranges, word counts,
  formulation codes, filler rejection, sentence boundaries), all four verdicts
  and tolerance edge cases, receipt-persistence failure never changing the
  verdict, resolver catalogue guards. **No DB, no Firebase, no API keys, no
  network** — the suite runs anywhere CI runs.
- `pnpm exec tsc --noEmit` clean with the module in the production build.
- The 21 pre-existing failures in untouched modules (crop/question/auth test
  drift, verified pre-existing by stashing this work and re-running) are
  unchanged and unrelated.

## 5. What the live test round caught (see build log for detail)

Four real defects were found by running the gate against the DB and fixed with
tests added for each: (1) the natural phrasing "monocrotophos 36% SL at 25 ml
per litre" lost the chemical name — doses were attributed to the formulation
code, which would have *missed a restricted-chemical block*; (2) a dose with no
chemical name passed as `VERIFIED` without any comparison; (3) receipts from
ingestion were stored without `questionId`, so the audit trail could not be
looked up per question; (4) per-verdict totals ignored the filter. Details,
evidence receipt ids and the four fixes: `docs/ajraverify-buildlog.md`,
2026-10-02 entry.

## 6. Honest limitations (M1 scope, stated for the record)

- Catalogues currently carry **no per-chemical dose limits**, so dosage *values*
  are recorded for expert evidence rather than compared; name and
  restricted/banned status are compared today. A verdict can only be as strict
  as the data behind it.
- Interval / spray-count claims are recorded as unresolved (no trusted
  schedule source wired yet).
- Extraction is English/Latin-script regex only; paraphrase and regional
  languages are M2 (an LLM extractor behind the same interface — the
  deterministic policy engine remains the sole decision-maker, an LLM can
  never alone produce `BLOCKED`).
- M1.5 is **evidence-only enforcement**: the verdict and receipt ride with the
  question into the review workflow; the gate does not withhold a BLOCKED
  answer by itself. Making that an enforced drop is a maintainer policy call,
  and the seam is already in place.
- No dashboard tab yet; the receipts API is dashboard-ready (filter by verdict).

## 7. Five-minute demo script

```bash
# 1. The gate on the same answer text, with a verdict per data state
curl -s -X POST localhost:3141/api/verification/check -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"answerText":"Spray monocrotophos 36% SL at 25 ml per litre of water, about 500 ml per acre. Repeat the spray every 5 days for 3 sprays."}'
# 2. The audit trail
curl -s "localhost:3141/api/verification/receipts?limit=5" -H "Authorization: Bearer $TOKEN"
curl -s "localhost:3141/api/verification/receipt/6abf84086c4139d68ea7f5bc" -H "Authorization: Bearer $TOKEN"
# 3. Verdict distribution
curl -s "localhost:3141/api/verification/receipts?verdict=BLOCKED" -H "Authorization: Bearer $TOKEN"
# 4. Before/after question documents
#    6abe12e0997a10320b06553d  → aiAnswerVerification: null
#    6abf84086c4139d68ea7f5bc  → verdict + reason + linked receipt
```

Then show `docs/ajraverify-before-after.html` for the visual, and the 36-test
green run (`pnpm exec vitest run src/modules/verification` in `backend/`).

## 8. Which form field this feeds

- **Section B (what you built):** §2 + §3.1, with the four-verdict table.
- **Section C (process & iteration):** §5 — four defects caught by real testing
  and fixed, with receipts proving each.
- **Section D (reflection):** §3.2 (why facts live in data, not code), §5 (what
  running it for real taught that unit tests did not).
- **Section E (zooming out):** §6 (honest limits; what remains for M2/M3).
- **Artefacts:** receipt ids, question ids, test counts and commands above are
  the citable URLs/values for the submission. The printable mentor brief is
  `docs/ajraverify-submission-brief.pdf` (source: `.html`); the
  ChatGPT-pasteable project context with these drafts is
  `docs/ajraverify-submission-context.md`.
