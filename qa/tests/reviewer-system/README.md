# Reviewer System — E2E test suite

Playwright + TypeScript coverage for the Reviewer System (the
moderator / expert / reviewer / coordinator workspace that gates farmer
questions into the Golden Database).

## Why a dedicated folder per role?

The Reviewer pipeline is a relay:

```
farmer → moderator (queue + allocate)
       → expert   (draft + submit)
       → reviewer (peer-approve)
       → GDB      (golden database)
```

Each relay step has its own folder so a failing trace.zip tells the
on-call **which step** broke without them having to read the test name.

## Folder map

```
reviewer-system/
├── auth/                   # cross-role login matrix (PR #2)
├── moderator/              # PR #1 — queue + allocation + session
├── expert/                 # PR #2 — expert draft / submit / re-allocate
├── analytics/              # PR #5 — charts + reputation + GDB counters
├── error-boundary-ui/      # PR (existing) — production UI resilience
├── fixtures/               # per-system Playwright fixtures
└── page-objects/           # Page Object Model classes
```

## Running locally

```bash
cd qa
cp .env.example .env && $EDITOR .env   # fill in REVIEWER_STAGING_URL + creds
npm ci
npx playwright install --with-deps chromium

npm run test:reviewer                  # headless, desktop chrome
npm run test:reviewer:headed           # watch the run
npm run test:reviewer:mobile           # Pixel 5 viewport
npm run test:reviewer:report           # open last HTML report
```

## Conventions

* **One behaviour per `test()`** — never multi-assert; reviewers read these
  as documentation.
* **`test.step()` for multi-action tests** — readable CI output.
* **`test.skip()` for missing credentials / empty staging data** — never
  hard-fail the suite on shared-test-data variance.
* **Centralised selectors** in `page-objects/selector-map.ts` — swap a
  `data-testid` once, all tests pick it up.
* **No invented selectors** — every page-object locator resolves through
  `SELECTOR_MAP`, marked `// TODO(selector)` until staging confirms the
  real DOM attribute.

## PR map (planned 40+ tests across 6 PRs)

| PR | Scope | Tests added (cumulative) |
|----|-------|--------------------------|
| #1 | Scaffolding + moderator queue/allocation | 15 |
| #2 | Auth matrix + expert flow | 25 |
| #3 | Reviewer (peer) approval + reject/return | 33 |
| #4 | Coordinator overrides + escalation | 40 |
| #5 | Analytics + reputation + GDB counters | 46 |
| #6 | Mobile viewport pass + a11y baseline | 50+ |