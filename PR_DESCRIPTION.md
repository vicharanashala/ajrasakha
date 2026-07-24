# Pull Request Description

## Overview
This PR adds support for a fully working local **Mock Mode** (`VITE_ENABLE_MOCKS=true`) in the frontend, enabling developers to run and test the application dashboard and play-ground interface without requiring live Firebase instances, MongoDB databases, or upstream Plivo APIs.

---

## Changes and Bug Fixes

### 1. Fixed Mock Session Reset in Auth Store
* **Affected File**: `frontend/src/stores/auth-store.ts`
* **Problem**: In mock mode, the custom email login bypasses Google Firebase. However, the Firebase SDK's active listener `onAuthStateChanged` still executes on startup and immediately triggers with `null` (since no actual session exists in the Firebase backend). This cleared the Zustand store's mock user object, redirecting the user back to the `/auth` login screen.
* **Fix**: Updated `initAuthListener` to check `env.enableMocks()`. If active, it skips the Firebase `onAuthStateChanged` subscription and honors the persisted Zustand store state instead.

### 2. Fixed Firebase Token Method Crash in apiFetch
* **Affected File**: `frontend/src/hooks/api/api-fetch.ts`
* **Problem**: The `apiFetch` helper called `getCurrentUser()` on each API call, which checks Firebase state and attempts to run `getIdToken()` on the mock user. Since the mock user is a plain object and lacks Firebase SDK prototype methods, this caused the app to throw runtime crashes.
* **Fix**: Added a check for `env.enableMocks()` inside `apiFetch`. When active, it skips the Firebase user retrieval and returns a static mock string `"mock-id-token"`.

### 3. Added Missing MSW User Handlers
* **Affected File**: `frontend/src/mocks/handlers.js`
* **Problem**: The `/api/users/me` and `/api/users/details/:email` endpoints were missing from MSW mock routes. Queries for loading user profile data failed with HTTP 404/network errors.
* **Fix**: Added mock GET handlers for `/api/users/me` and `/api/users/details/:email` that return a valid `IUser` payload matching the Admin role.

### 4. Added Firebase Auth Mock Bypass
* **Affected File**: `frontend/src/lib/firebase.ts`
* **Problem**: Standard login attempts failed when Firebase configuration credentials were dummy/placeholders.
* **Fix**: Imported `env` from `@/config/env` and intercepted `loginWithEmail` so that when `env.enableMocks()` is true, it immediately returns a mock authentication credential containing the mock user and admin roles.

### 5. Added Missing MSW handler for `/api/users/review-level`
* **Affected File**: `frontend/src/mocks/handlers.js`
* **Problem**: The dashboard components (`ExpertDashboard.tsx` and `ReviewLevelComponent.tsx`) make a GET request to `/api/users/review-level` and call `.map()` on the response. Because the endpoint was not mocked in MSW, the offline proxy returned a parsed non-array value, leading to the crash: `reviewLevel?.map is not a function`.
* **Fix**: Added a mock handler for `/api/users/review-level` returning a structured array of `ReviewLevelCount` objects.

### 6. Fixed Optional Chaining Loading Crash on `usersData`
* **Affected Files**:
  * `SelectedPannel.tsx`
  * `BulkUploadAllocationModal.tsx`
  * `AllocationQueueHeader.tsx`
  * `AnswerItem.tsx`
* **Problem**: When pages first mount, `usersData` is `undefined` because the query `useGetAllUsers()` is loading. The components attempted to evaluate `usersData?.users.filter(...)`, which threw `Cannot read properties of undefined (reading 'filter')` because `usersData?.users` resolves to `undefined` and optional chaining was not placed before the `.filter` call.
* **Fix**: Changed all occurrences of `usersData?.users.filter(...)` to `(usersData?.users ?? []).filter(...)` or `usersData?.users?.filter(...)` to guarantee safe evaluation during loading states.

### 7. Added Mock Handler for `/api/users/all`
* **Affected File**: `frontend/src/mocks/handlers.js`
* **Problem**: The user list dropdowns failed to populate because there was no mock API route for `/api/users/all`.
* **Fix**: Added a GET handler for `/api/users/all` returning a mock `IUsersNameResponse` containing placeholder experts, admin, and moderator users.
