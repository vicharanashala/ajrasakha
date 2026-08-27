# WhatsApp Controller — E2E Test Documentation

**File:** `src/e2e/whatsapp/WhatsAppController.e2e.test.ts`

---

## What this covers

`WhatsAppController`'s own 6 routes — **not** the ingestion pipeline
(`POST /api/questions` with source=WHATSAPP), which
`whatsapp/WhatsAppQuestion.e2e.test.ts` already covers in depth. None of these
routes were previously exercised by any suite — the existing "whatsapp" e2e
folder name was misleading in that respect (see `COVERAGE_GAP_REPORT.md`).

| Method | Endpoint |
|--------|----------|
| `GET` | `/api/whatsapp/threads` |
| `GET` | `/api/whatsapp/threads/:threadId/:date` |
| `POST` | `/api/whatsapp/send-message` |
| `GET` | `/api/whatsapp/inactive-users` |
| `GET` | `/api/whatsapp/unique-users` |
| `GET` | `/api/whatsapp/users` |

Every read here calls out to a real external WhatsApp/LangGraph backend service
(`WA_SEND_MESSAGE_WEBHOOK_API_URL` etc. in `.env`) — not running in this test
environment.

---

## Scope of this pass

- `GET /threads` and `GET /threads/:threadId/:date` call the external backend
  with **no request timeout** — the call hangs well past any reasonable test
  timeout in this environment (unlike the other 3 reads below, which fail fast).
  Only their auth gate is covered — same "untestable in this environment"
  category as `bulk-pae-allocate` and `kvks/sync`.
- `GET /inactive-users` and `GET /unique-users` fail fast (no try/catch in the
  controller) — this suite accepts either real data or a clean 5xx.
- `GET /users` has a real try/catch with an empty-list fallback — always 200.
- `POST /send-message` would send a **real WhatsApp message to a real phone
  number** if exercised for real — only its auth gate is covered, never the
  live send.

---

## Test cases (6 total)

| # | Test | Expected |
|---|------|----------|
| 1 | `GET /threads` — no auth | 401 |
| 2 | `GET /threads/:threadId/:date` — no auth | 401 |
| 3 | `POST /send-message` — no auth (never reaches the real send) | 401 |
| 4 | `GET /inactive-users` — authenticated | 200 or a clean 5xx |
| 5 | `GET /unique-users` — authenticated | 200 or a clean 5xx |
| 6 | `GET /users` — authenticated, always 200 via fallback | 200, `users: []` on backend failure |

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/whatsapp/WhatsAppController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 6 passed | **Duration:** ~19s
