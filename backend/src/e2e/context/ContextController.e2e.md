# Context Controller — E2E Test Documentation

**File:** `src/e2e/context/ContextController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/context` | Create a context from transcript text |
| `POST` | `/api/context/translate` | Real Sarvam translation API call |
| `POST` | `/api/context/speech-to-text` | Proxies an uploaded file to Sarvam STT |

`speech-to-text`'s happy path needs a real audio file and a real Sarvam STT call —
out of scope for this pass. Only its auth gate and no-file error path are covered,
matching the "untestable in this environment" pattern used elsewhere
(`bulk-pae-allocate`, `signup/google`).

---

## Findings

- **BUG-020**: `ContextService.addContext` throws `BadRequestError('Context text
  required')` for an empty transcript, but that throw happens inside the same
  try block whose catch rewraps everything as `InternalServerError` — the same
  shape as BUG-001. Empty transcript 500s instead of 400ing.
- **Environment issue** (not a code bug): `SARVAM_API_KEY` in `.env` is rejected
  by Sarvam ("Invalid or missing authentication credentials") in this environment.
  The request/response wiring up to that point is correct.

---

## Test cases (9 total)

### POST /context (3 tests)

| # | Test | Expected |
|---|------|----------|
| 1 | No authenticated user | 401 |
| 2 | Creates a context from transcript text | 201 |
| 3 | **BUG-020**: empty transcript | 500 (not 400) |

### POST /context/translate (4 tests)

| # | Test | Expected |
|---|------|----------|
| 4 | No authenticated user | 401 |
| 5 | Missing `text` | 400 |
| 6 | Missing `targetLang` | 400 |
| 7 | **ENV ISSUE**: real Sarvam call, real key rejected | 500 |

### POST /context/speech-to-text (2 tests)

| # | Test | Expected |
|---|------|----------|
| 8 | No authenticated user | 401 |
| 9 | No file attached (happy path needs a real audio file + live STT call) | ≥400 |

---

## Cleanup

`afterAll` deletes every context doc id tracked in `createdContextIds`.

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/context/ContextController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 9 passed | **Duration:** ~6s
