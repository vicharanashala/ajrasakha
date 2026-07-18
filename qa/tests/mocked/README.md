# qa/tests/mocked — fork-PR-safe CI suite

This directory holds Playwright specs that run **without** any staging
URL or test credentials. They exist so that:

- Fork PRs (which GitHub intentionally strips of repo secrets) still get
  real signal in CI instead of failing red on every outside contribution.
- The reviewer-system / web-app selector contract stays honest on every
  PR — renames in `selector-map.ts` (or accidental deletions of
  documented `data-testid`s) fail CI before reaching staging.

## What this is NOT

This suite does **not** replace the real E2E run. The full
`test:reviewer` / `test:webapp` jobs still validate staging behavior when
their secrets are configured. The mocked suite only verifies the QA
*contract* (selectors, routes, page-object wiring, fixture loads).

## How it runs

- Project name: `mocked` in `qa/playwright.config.ts`
- Test file pattern: `*.mocked.spec.ts` anywhere under `qa/tests/`
- Base URL: `http://mocked.localhost/` (intentionally inert — specs use
  `page.setContent()` rather than `page.goto()`)
- Runner: `npm run test:mocked`
- Wired into CI: `.github/workflows/{e2e,reviewer-system-e2e}.yml`
  `static-checks` job, step `Run mocked Playwright suite`.

## Writing a new mocked spec

1. Filename MUST end in `.mocked.spec.ts`.
2. Put it under `qa/tests/<area>/<...>.mocked.spec.ts`. Anything in the
   `tests/` tree is fair game.
3. Avoid `page.goto()` to external URLs — use `page.setContent()` or
   `page.route("**/*", …)` to keep the test fully self-contained.
4. Importing from `tests/reviewer-system/page-objects/selector-map.ts` is
   encouraged — it's the canonical contract we want to verify.
5. Tag the describe block with `@mocked` so the report is easy to scan.

## Patterns demonstrated

- **`selectors-and-routes.mocked.spec.ts`** — walks `SELECTOR_MAP` and
  verifies every documented `data-testid` is present in a stub DOM.
  This is the highest-leverage test for catching selector drift.
- **`page-route-stubs.mocked.spec.ts`** — three small examples of
  `page.route()` in action: HTML stub, request abort, JSON API shape.
  Use these as templates when adding new mocked specs that need to fake
  a network response.

## When to write a real test vs a mocked one

| Scenario                                       | Use         |
| ---------------------------------------------- | ----------- |
| "The frontend renders a skeleton on boot"      | mocked      |
| "Selector map drift broke a `data-testid`"     | mocked      |
| "Backend returns 500 — UI should show banner"  | mocked      |
| "Login flow works against the real auth"       | real E2E    |
| "Allocation flow mutates staging data"        | real E2E    |

Mocked = fast, hermetic, no secrets. Real = slow, depends on staging.
