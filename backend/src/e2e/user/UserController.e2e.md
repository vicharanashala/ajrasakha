# User Controller — E2E Test Documentation

**File:** `src/e2e/user/UserController.e2e.test.ts`

---

## What this covers

All 29 routes on `UserController` — the largest previously-uncovered controller
by route count after `chatbot`. Full route list:

`GET /me`, `/review-level`, `/admin/all`, `/all`, `/moderators`,
`/pae-val-experts`, `/stf-moderators`, `/list`, `/details/:email`,
`/call-agents`, `/user-history`, `/working-hours`, `/working-hours-trend`,
`/reviewer-lifecycle`, `/by-role`; `PUT /`; `PATCH /`, `/point`, `/expert`,
`/stf`, `/status`, `/:id/role`, `/training-users`, `/:id/verify`,
`/call-agents/:id/toggle-active`; `POST /:id/remove-allocations`,
`/set-call-agents`, `/call-agents/toggle-status`, `/call-agents/heartbeat`,
`/call-agents/available`, `/verification-request`.

**Fixtures:** a throwaway target user is inserted directly into the `users`
collection (role `expert`) — going through real signup just to get a mutation
target for block/unblock/verify/STF/training-user/role-toggle would be a lot of
unrelated Firebase machinery for a suite that isn't testing signup.

---

## Findings

- **BUG-024**: `GET /users/details/:email` has **no `@Authorized()` decorator
  at all**. Reachable with just the shared `x-internal-api-key`, no logged-in
  user required. Returns the full raw Mongo user document by email — including
  the bcrypt `password` hash (same shape as BUG-019).
- **BUG-025**: `UserRepository.getUsersByRole` builds `{ role: { $in: roles }
  }` without normalizing a single value into an array. `GET /by-role?role=expert`
  (the natural single-role call) 500s with a raw MongoDB error ("$in needs an
  array") — only a repeated-key array (`?role=expert&role=moderator`) works.
- **BUG-017 confirmed on 5 routes**: `GET /admin/all`, `GET /stf-moderators`,
  `GET /call-agents`, `PATCH /stf`, `PATCH /training-users` all declare
  `@Authorized(['admin', ...])` but have no service-layer check either — any
  authenticated user reaches them regardless of role.
- **Investigated and NOT bugs** — routes that looked unprotected at the
  controller level but turned out to have real checks in the *service* layer:
  `PATCH /:id/role` (`"Only admin can switch user roles"`),
  `POST /:id/remove-allocations` (`"Only admins can remove expert
  allocations"`), and the call-agent management routes (`POST
  /set-call-agents`, `PATCH /call-agents/:id/toggle-active`), which additionally
  require a `Call_centre_manager` flag on the caller beyond plain `role ===
  'admin'` — this suite's `adminUser` fixture doesn't have that flag, so those
  two 403 here by design.

---

## Test cases (45 total)

Organized into: own-profile routes (`/me`, `PUT /`, `/review-level`), listing/
lookup routes (`/admin/all`, `/all`, `/moderators`, `/pae-val-experts`,
`/list`, `/by-role`, `/stf-moderators`, `/details/:email`), target-user
mutation routes exercised against the throwaway fixture (`/point`, `/expert`,
`/stf`, `/status`, `/:id/role`, `/training-users`, `/:id/verify`), notification
preference (`PATCH /`), call-agent admin + self-service routes, and misc public/
own-user routes (`/verification-request`, `/user-history`, `/working-hours`,
`/working-hours-trend`, `/reviewer-lifecycle`, `/:id/remove-allocations`).

---

## Cleanup

`afterAll` deletes the fixture target user.

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/user/UserController.e2e.test.ts
```

---

## Last Run

**Date:** 24-08-2026 | **Result:** ✅ all 45 passed | **Duration:** ~30s
