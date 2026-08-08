# Playwright E2E Test Setup — Bug Report & Observations

**Date**: 2026-07-21
**Environment**: desk.vicharanashala.ai (staging)
**Tests Written**: 50 across 9 spec files

---

## Observations During Test Writing

### 1. Auth Form — No Explicit `id` or `data-testid` Attributes

**Severity**: Low (Informational)
**Location**: [AuthFields.tsx](file:///c:/Users/omkum/Desktop/AV_Files/VLED-Doc/VLED_Project/ajrasakha/frontend/src/features/auth/components/AuthFields.tsx)

The auth form fields use `id={field.name}` which produces `id="email"`, `id="password"` — functional but generic.
**Recommendation**: Add `data-testid` attributes (e.g., `data-testid="auth-email-input"`) for more resilient test selectors.

---

### 2. No Consistent `data-testid` Pattern Across Components

**Severity**: Medium
**Location**: All components in `frontend/src/components/`

The component library doesn't use `data-testid` attributes, making selectors rely on class names, text content, and roles. This is fragile because:
- Class names can change with CSS refactors (especially Tailwind utility classes)
- Text content is locale-dependent
- Some elements lack semantic roles

**Recommendation**: Add `data-testid` to key interactive elements:
- Question rows: `data-testid="question-row-{id}"`
- Status badges: `data-testid="status-badge-{status}"`
- Allocate buttons: `data-testid="allocate-btn-{questionId}"`
- Analytics cards: `data-testid="analytics-card-{metric}"`
- Approve/Reject buttons: `data-testid="approve-btn"`, `data-testid="reject-btn"`

---

### 3. Coordinator Route — Minimal Content

**Severity**: Low
**Location**: [coordinator/index.tsx](file:///c:/Users/omkum/Desktop/AV_Files/VLED-Doc/VLED_Project/ajrasakha/frontend/src/routes/coordinator/index.tsx)

The coordinator page component renders only a header with "Coordinator Dashboard" and action buttons. The actual queue management UI may be loaded dynamically or is embedded elsewhere. Tests adapt by checking both the coordinator route and the home dashboard tabs.

---

### 4. Role-Based Redirect Logic — Varies by Role

**Severity**: Low (Informational)
**Location**: [auth/index.tsx](file:///c:/Users/omkum/Desktop/AV_Files/VLED-Doc/VLED_Project/ajrasakha/frontend/src/routes/auth/index.tsx), [home/index.tsx](file:///c:/Users/omkum/Desktop/AV_Files/VLED-Doc/VLED_Project/ajrasakha/frontend/src/routes/home/index.tsx)

Post-login redirect depends on `isCoordinatorRole()`:
- Coordinators → `/user/$userId`
- PAE experts → `/pae-expert`
- Others → `/home`

This means the "moderator" test fixture may land on `/user/:id` instead of `/home` if the test account has a coordinator role. Tests account for both destinations.

---

### 5. Firebase Auth Token — No `firebase-auth-token` in localStorage by Default

**Severity**: Medium
**Location**: [api-fetch.ts](file:///c:/Users/omkum/Desktop/AV_Files/VLED-Doc/VLED_Project/ajrasakha/frontend/src/hooks/api/api-fetch.ts)

The `apiFetch` utility gets a token from `auth.onAuthStateChanged` and `getIdToken()`, not from localStorage. However, the auth store persists under the key `auth-storage` in localStorage. The `firebase-auth-token` localStorage key is set and cleared in `clearUser()` but the initial set may happen elsewhere.

**Impact on tests**: The API helper in tests uses `localStorage.getItem('firebase-auth-token')` for direct API calls. If this key isn't set during the login flow, API helper calls may fail. The tests account for this by checking for null responses.

---

### 6. No Dedicated Test Environment

**Severity**: High (Risk)

All E2E tests run against the live staging environment (`desk.vicharanashala.ai`). Mutating tests (allocation, answer submission, approval) modify real staging data.

**Recommendation**:
- Create a dedicated test environment with seed data
- Add test data cleanup in `afterEach` hooks
- Use API calls to create test-specific questions before each mutating test flow

---

## Summary

| # | Issue | Severity | Action Needed |
|---|-------|----------|---------------|
| 1 | No `data-testid` on auth fields | Low | Add test IDs |
| 2 | No consistent `data-testid` across components | Medium | Add test IDs to key elements |
| 3 | Coordinator page has minimal content | Low | Verify queue UI location |
| 4 | Redirect logic varies by role | Low | Tests already handle this |
| 5 | Firebase token localStorage key may not be set | Medium | Verify token persistence |
| 6 | No dedicated test environment | High | Consider isolated test env |

---

*Report generated during Playwright E2E test setup for the Reviewer System.*
