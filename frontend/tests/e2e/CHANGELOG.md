# Changelog — Ajrasakha QA E2E Suite

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-07-12

### Added
* **12 spec files** covering every flow in the Reviewer System (≈154 tests)
* **5 phases** of testing:
  * `@public` — SPA shell, login form, asset integrity (no creds needed)
  * `@network` — route table renders without 5xx, no `/api` leak
  * `@contract` — every backend endpoint returns the right status with no token
  * `@network` — security-critical anonymous auth-gate proof (5 tests)
  * `@a11y` — semantic structure, keyboard reach, image/link hygiene
* **Helpers**:
  * `http.ts` — `statusFor`, `isApiReachable`, `matchesExpect`, `assertStatus`
  * `auth.ts` — placeholder for future credential-based flow
  * `env-validator.ts` — validates env config before any test runs
  * `logger.ts` — level-aware colored logger
  * `global-setup.ts` — runs env validation once
  * `global-teardown.ts` — one-line summary
* **Production-grade config**:
  * `playwright.config.ts` with multiple projects (chromium default, firefox opt-in)
  * `environment.ts` with full env-var control
  * `.env.example` documenting every variable
* **Scripts**:
  * `scripts/verify-setup.sh` — pre-flight check
  * `scripts/run-smoke.sh` — convenience runner
* **CI workflow** (`.github/workflows/e2e-public-contract.yml`)
* **Docs**:
  * `README.md` — overview + quick start
  * `CONTRIBUTING.md` — how to add tests
  * `RUNBOOK.md` — troubleshooting
  * `docs/FLOW_ANALYSIS.md` — full flow map
  * `docs/AUDIT_REPORT.md` — what we found + comparison
  * `docs/TEST_INVENTORY.md` — every test, by ID
  * `LICENSE`

### Security
* Suite refuses to run if env validation fails (CI consistency, placeholder detection)
* No credentials are required, requested, or transmitted
* All HTTP probes set explicit `Accept` and `User-Agent` headers

### Notes
* Replaces the previous `frontend/tests/e2e/` (92 tests, 11 placeholders, 5 helper bugs).
* All endpoint paths were hand-traced from
  `frontend/src/hooks/services/*Service.ts` and verified against
  `backend/src/modules/*/controllers/*Controller.ts`.
* Bugs discovered during the audit are listed in `docs/AUDIT_REPORT.md` §5.
