# Contributing — Adding Tests

Thanks for contributing! This guide covers how to add a new test in the
right style and at the right place.

---

## Decision tree

```
                   What are you testing?
                           │
       ┌───────────────────┼────────────────────┐
       ▼                   ▼                    ▼
  SPA shell /          A backend              A specific
  form widget          endpoint               user flow
       │                   │                    │
       ▼                   ▼                    ▼
  @public tag,        @contract tag,         Wait — login flow
  specs/00*.spec.ts   specs/03-09.spec.ts   needs creds (TODO)
```

---

## Style rules

1. **One assertion per test** when possible. Multiple `expect()`s are OK if
   they prove the SAME thing (e.g., element visible AND has correct text).
2. **Always include a `@tag`** — `@public`, `@routes`, `@contract`, `@network`,
   `@a11y`. Tags let reviewers run just their concern.
3. **Test names start with a tag** and an ID:
   ```ts
   test('@contract GET /users/me returns 401 when anonymous', ...)
   ```
4. **Don't catch exceptions silently.** If a test fails, let it fail —
   Playwright's reporter will surface it.
5. **No `await new Promise(r => setTimeout(r, 1000))` hacks.** Use
   `expect(locator).toBeVisible()` for proper waits.
6. **Skip rather than fail-when-environment-missing.** Use
   `isFrontendReachable()` / `isApiReachable()` in `beforeEach`.

---

## Adding a new contract test

```ts
// specs/03-contract-questions.spec.ts (or a new spec file)

import { test, expect } from '@playwright/test';
import { statusFor, matchesExpect, isApiReachable, skipWhenDown, type Endpoint } from '../helpers/http';

const ENDPOINTS: Endpoint[] = [
  // ... existing entries ...
  { path: '/questions/:id/new-thing', method: 'POST', body: {}, expect: 401, label: 'new feature' },
];

test.describe('Contract — /questions/* status codes', () => {
  test.beforeEach(async ({ request }) => {
    const ok = await isApiReachable(request);
    if (!ok && skipWhenDown) {
      test.skip(true, 'API base URL not reachable');
    }
  });

  for (const ep of ENDPOINTS) {
    test(`@contract ${ep.method} ${ep.path} — expect ${ep.expect} (${ep.label ?? ''})`, async ({ request }) => {
      const code = await statusFor(request, ep);
      expect(matchesExpect(code, ep.expect as number | number[]), `got ${code}`).toBeTruthy();
    });
  }
});
```

**Critical**: trace the endpoint from `frontend/src/hooks/services/` and
confirm it exists in `backend/src/modules/*/controllers/*Controller.ts`
before adding it.

---

## Adding a new browser smoke test

```ts
import { test, expect } from '@playwright/test';
import { isFrontendReachable, skipWhenDown } from '../helpers/http';

test.beforeEach(async ({ page }) => {
  const ok = await isFrontendReachable(page);
  if (!ok && skipWhenDown) {
    test.skip(true, 'Frontend base URL not reachable');
  }
});

test('@public T-PUB-99 — something renders correctly', async ({ page }) => {
  await page.goto('/whatever');
  await expect(page.locator('whatever')).toBeVisible();
});
```

---

## When the suite flags a real bug

1. Reproduce locally:
   ```bash
   E2E_LOG_LEVEL=debug pnpm test:e2e --grep T-PUB-99
   ```
2. Check the HTML / network in the Playwright trace.
3. File a bug in the parent repo with:
   * Test ID and description
   * Output of `pnpm test:e2e --grep <ID> --reporter=list`
   * Playwright trace path (under `test-results/`)
4. **Do not** silence the test with `.catch(() => false)` or
   `expect.soft()` — fix the underlying code.

---

## Adding to the inventory

Every new test gets a row in `docs/TEST_INVENTORY.md` so coverage is
tracked.

---

## Release process

* Bump version in `package.json` and `CHANGELOG.md`
* Update `docs/TEST_INVENTORY.md`
* Run `pnpm test:e2e` locally — all 154 (or however many) tests pass
* Tag the release in git
* Update parent repo's `.github/workflows/e2e-public-contract.yml` if the
  runner moved
