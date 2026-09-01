# Answer Controller — Coverage Gap-Fill E2E Test Documentation

**File:** `src/e2e/answer/AnswerControllerGaps.e2e.test.ts`

---

## What this covers

The `AnswerController` routes NOT already exercised by `post-allocation/` or
`gatekeeper-auditor/` (which cover `POST /review`, `PUT /`, `POST
/moderator/approve`, `POST /:questionId/confirm-duplicate`, `DELETE
/:questionId/:answerId`):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/answers` | Direct answer creation, outside the `/review` flow |
| `POST` | `/api/answers/fetch-ai-answer` | Proxies to a real external AI service |
| `GET` | `/api/answers/submissions` | Current user's submissions |
| `GET` | `/api/answers/finalizedAnswers` | Current user's finalized answers |
| `GET` | `/api/answers/faqs/mod` | Golden FAQs |

**Correction to the original coverage gap report:** `PUT /:answerId` was listed
as uncovered, but it's dead, commented-out code in `AnswerController.ts` (lines
213–226) — not a live route. It doesn't need a test; the gap report's
route-decorator grep couldn't distinguish it from a live one.

---

## Test cases (8 total)

| # | Test | Expected |
|---|------|----------|
| 1 | `POST /answers` — no auth | 401 |
| 2 | Same — expert creates an answer directly | 201 |
| 3 | `POST /fetch-ai-answer` — no auth | 401 |
| 4 | Same — real external AI service call | 200 or a clean 5xx |
| 5 | `GET /submissions` — no auth | 401 |
| 6 | Same — authenticated | 200 |
| 7 | `GET /finalizedAnswers` — authenticated | 200 |
| 8 | `GET /faqs/mod` — authenticated | 200 |

---

## Cleanup

`afterAll` deletes the fixture question and every answer id tracked in
`createdAnswerIds`.

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/answer/AnswerControllerGaps.e2e.test.ts
```

---

## Last Run

**Date:** 24-08-2026 | **Result:** ✅ all 8 passed | **Duration:** ~21s
