# Runbook — Troubleshooting

This runbook covers common issues with the E2E suite and how to fix them.

---

## "All 123 contract tests are skipped"

**Symptom:**
```
123 skipped
```
Plenty of contract tests skip.

**Cause:** API backend at `E2E_API_URL` is not reachable.

**Fix:**
```bash
# Quick reachability check
curl -v -m 5 $E2E_API_URL/users/me 2>&1 | tail -10
# If "Connection refused" → backend is down (start it)
# If "Couldn't resolve host" → wrong URL (fix E2E_API_URL)
# If 401/403 → backend is up, but the suite is in skip-when-down mode and
#    the probe got 401 from a public path. Set E2E_SKIP_IF_DOWN=false.
E2E_SKIP_IF_DOWN=false pnpm test:e2e
```

---

## "Firebase: Error (auth/invalid-api-key)"

**Symptom:**
```
-   [chromium] › tests/e2e/specs/00-public.spec.ts:64:3 › Public — login page › ...
```
Login form tests all show `-` (skipped).

**Cause:** `frontend/.env` has placeholder Firebase keys. The SPA throws
on init, blocking the form from rendering. This is **expected behaviour**
in the dev environment — the suite detects it and skips form tests with a
clear message.

**Fix options:**
1. Set real Firebase keys in `frontend/.env.local` (recommended)
2. Stub Firebase in `frontend/src/mocks/` so MSW intercepts init (long)
3. Accept the skip — the contract tests still prove auth gating works

---

## "Test timeout of 30000ms exceeded"

**Symptom:** a specific test times out before its assertions.

**Fix:**
```bash
# 1. Increase timeouts (good for slow CI runners)
E2E_TIMEOUT_MS=90000 E2E_LONG_TIMEOUT_MS=120000 pnpm test:e2e

# 2. Re-run just the failing test with debug
pnpm test:e2e --grep <ID> --debug

# 3. Inspect the Playwright trace
# test-results/<spec>/<test>/trace.zip → open with:
pnpm exec playwright show-trace test-results/<spec>/<test>/trace.zip
```

---

## "Error: browser not found"

**Symptom:**
```
browserType.launch: Executable doesn't exist at .../chromium-XXX
```

**Cause:** Playwright browsers not installed.

**Fix:**
```bash
pnpm exec playwright install --with-deps chromium
# For Firefox too:
pnpm exec playwright install firefox
```

---

## ".env validation failed"

**Symptom:** suite aborts before any test runs.

**Cause:** env-validator found a problem.

**Fix:** the log tells you exactly what's wrong:
```
ERROR • E2E_BASE_URL is not a valid URL: $E2E_BASE_URL
ERROR • E2E_API_URL is empty
```
Edit `.env` or your shell environment and try again.

---

## "leaked /api calls on <route>"

**Symptom:** a `@network` test fails because the SPA made an
unintended `/api/*` request.

**Cause:** an auth listener or query triggered an API call when the user
isn't authenticated.

**Fix:**
1. Check the network trace in the failure screenshot
2. Add the URL to the allow-list in `10-network-routes.spec.ts` if it's
   actually intentional (e.g., `useGetCurrentUser` enabled only when
   `!!user`)

---

## "expect(...).toBeVisible failed" — element not found

**Symptom:** a `@public` test can't find an element.

**Cause:** likely a frontend rename OR a Firebase env issue (see above).

**Fix:**
```bash
# 1. Reproduce with the dev server open
pnpm dev
# Open http://localhost:5173/auth
# Look at the form to see what selectors actually exist

# 2. Inspect the rendered HTML
pnpm test:e2e --grep T-PUB-10
# Open the error context under test-results/

# 3. Update the selector in specs/00-public.spec.ts
```

---

## "TimeoutError: page.goto: net::ERR_CONNECTION_REFUSED"

**Symptom:** a `@public` or `@network` test can't reach the FE.

**Cause:** `E2E_BASE_URL` is wrong, or the SPA isn't running.

**Fix:**
```bash
# 1. Verify the URL
curl -v -m 5 $E2E_BASE_URL/ 2>&1 | head -5
# 2. If "Connection refused" — start the SPA: pnpm dev
# 3. If "Couldn't resolve host" — fix E2E_BASE_URL
```

---

## CI: "Cannot find module '@playwright/test'"

**Cause:** `pnpm install` didn't run successfully.

**Fix:** inspect `pnpm-lock.yaml` is committed and `pnpm install --frozen-lockfile`
is used in CI.

---

## CI: everything passes locally but fails in CI

Common culprits:
* **Different Node version** — pin to Node 22 in the workflow
* **Cache stale** — clear `~/.cache/ms-playwright/`
* **`process.env.CI === 'true'`** is set, changing timeout behaviour — expected, keep it
* **Network** — staging might be flaky, retry once (already configured)

---

## Contact

For bugs in the suite itself, file an issue in the parent repo with label
`area:qa-e2e`.
