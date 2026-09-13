# Phase A — E2E Auth Guard & Role-Based Tab Tests

## Objective

Establish a stable, fully mocked Playwright E2E test suite for the frontend authentication guard system and role-based tab rendering, without modifying any application source code (`src/**`), Vite config, or TanStack Router config.

## What Was Implemented

1. **Auth Guard Tests** (`02-auth-guard.spec.ts`) — Verify that:
   - Unauthenticated users are redirected to `/auth`
   - `pae_expert` users are redirected to `/pae-expert`
   - `coordinator` users are redirected to `/user/:id`
   - Logout clears auth state and redirects to `/auth`

2. **Role-Based Tab Tests** (`03-role-based-tabs.spec.ts`) — Verify that each role that stays on `/home` sees the correct set of tabs:
   - **admin**: Dashboard, All Questions, User Management, Agents Interface, Manage Agents, ChatBot Analytics, Data Processing
   - **moderator**: Dashboard, All Questions, Expert Management, Agents Interface, ChatBot Analytics
   - **expert**: Dashboard, My Queue, All Questions, Agents Interface
   - **call_agent**: Call Interface, Call History

3. **Auth Fixture** (`fixtures/auth.ts`) — Centralized `setupAuth()` that:
   - Seeds Zustand persisted auth store via `addInitScript`
   - Disables `initAuthListener` via route interception (glob pattern `**/src/routes/index.tsx*`)
   - Mocks Firebase SDK endpoints
   - Mocks `/api/users/me`
   - Mocks `/api/analytics/user-profile` (prevents coordinator infinite loop)

## Files Added

| File | Purpose |
|------|---------|
| `frontend/e2e/specs/03-role-based-tabs.spec.ts` | Role-based tab visibility tests |
| `PHASE_A_SUMMARY.md` | This document |

## Files Modified

| File | Change |
|------|--------|
| `frontend/e2e/fixtures/auth.ts` | Added `/api/analytics/user-profile` mock; changed `initAuthListener` glob to `**/src/routes/index.tsx*` |
| `frontend/e2e/specs/02-auth-guard.spec.ts` | Added `beforeAll` warm-up; changed `initAuthListener` glob to `**/src/routes/index.tsx*` |

## Test Summary

```
9 tests — 8 pass, 1 pre-existing failure
```

| Spec | Tests | Result |
|------|-------|--------|
| `01-voice-recorder-ui.spec.ts` | 2 | 1 pass, 1 failure (cold-start timeout) |
| `02-auth-guard.spec.ts` | 4 | All pass |
| `03-role-based-tabs.spec.ts` | 4 | All pass |

## Known Issue

**Voice Recorder cold-start timeout** — The first test in `01-voice-recorder-ui.spec.ts` times out waiting for the Voice Recorder heading to appear. Root cause: Vite must transpile all ~402 TanStack Router route modules on first navigation (~42 s), exceeding the 30 s test timeout. This is a pre-existing issue, not introduced by this Phase A work. A `beforeAll` warm-up pattern (used in auth guard tests) could resolve it but was not applied to avoid scope creep.

## Key Technical Details

- **`initAuthListener` interception**: TanStack Router code-splits route components into a separate URL with `?tsr-split=component` query parameter. The glob `**/src/routes/index.tsx` matches only the route definition; the trailing `*` is required to also match the split-component URL.
- **Coordinator infinite loop**: The `/user/$userId` route guard (`$userId.tsx:182–205`) redirects coordinators back to `/home` when `userProfile.email` doesn't match `currentUser.email`. The `/api/analytics/user-profile` mock returns matching `{ userId, email }`, preventing the loop.
- **No source code touched**: Zero modifications to `src/`, `vite.config.ts`, or TanStack Router config.

## Business Value

- Prevents auth guard regressions with deterministic, CI-friendly tests
- Documents the role-to-tab mapping explicitly, making it visible to all team members
- Provides a reusable `setupAuth` fixture for future E2E tests
- Eliminates flakiness from Firebase SDK calls and real API dependencies via mocking
