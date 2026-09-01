# Notification Controller — E2E Test Documentation

**File:** `src/e2e/notification/NotificationController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/notifications` | Create |
| `GET` | `/api/notifications` | Own, paginated |
| `GET` | `/api/notifications/user/:userId` | Admin only (`@Authorized(['admin'])`, no in-handler check) |
| `POST` | `/api/notifications/user/:userId/send` | Admin+coordinator only (same pattern) |
| `POST` | `/api/notifications/users/send` | Bulk send (same pattern) |
| `DELETE` | `/api/notifications/:notificationId` | Delete |
| `PATCH` | `/api/notifications/:notificationId` | Mark as read |
| `PATCH` | `/api/notifications` | Mark all as read |
| `POST` | `/api/notifications/subscriptions` | Save push subscription |
| `POST` | `/api/notifications/send-notification` | Send push (real `web-push` call) |

---

## Findings

Unlike `PublicDashboardController` (which added its own `assertAdmin()` to work
around BUG-017), `NotificationController`'s admin/coordinator-only routes have
**no in-handler role check at all** — they rely purely on `@Authorized([roles])`,
which BUG-017 (README) shows enforces nothing beyond "some authenticated user
exists". This suite proves a non-admin/non-coordinator reaches business logic on
`GET /user/:userId` and `POST /user/:userId/send` (the 404 they get back is a
*different*, legitimate error — "Target user not found", because these routes
target a separate dashboard-user domain, not the app's `users` collection — not an
auth block; a real block would be 401/403).

`POST /subscriptions` is declared `@HttpCode(201)` but is an upsert keyed by
`userId` — a repeat run against an already-subscribed user updates 0 fields and
routing-controllers ships 204 for the falsy result instead. Both are clean success
signals; the suite accepts either.

---

## Test cases (13 total)

| # | Test | Expected |
|---|------|----------|
| 1 | `POST /` — no auth | 401 |
| 2 | Same — missing fields | 400 |
| 3 | Same — creates | 201 |
| 4 | `GET /` — no auth | 401 |
| 5 | Same — paginated list includes new notification | 200 |
| 6 | `GET /user/:userId` — **BUG-017**: expert not blocked | reaches business logic (not 401/403) |
| 7 | `POST /user/:userId/send` — **BUG-017**: expert not blocked | reaches business logic (not 401/403) |
| 8 | `POST /users/send` — admin bulk send | 201 |
| 9 | `PATCH /:notificationId` — mark as read | 200 |
| 10 | `PATCH /` — mark all as read | 200 |
| 11 | `POST /subscriptions` — save | 200/201/204 |
| 12 | `POST /send-notification` — real push to a fake endpoint | ≥400 |
| 13 | `DELETE /:notificationId` | 200 |

---

## Cleanup

`afterAll` deletes every notification id tracked in `createdNotificationIds`.

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/notification/NotificationController.e2e.test.ts
```

---

## Last Run

**Date:** 24-08-2026 | **Result:** ✅ all 13 passed | **Duration:** ~9s
