# Ajrasakha — Production Readiness + Interactive Frontend + 400-User Scale

## 🚀 One-line summary

> **Adds production-grade infra (Nginx + Docker, 400 concurrent users), an interactive UI shell (ErrorBoundary, NetworkStatus, Skeletons), backend hardening middleware, and 12 new Playwright E2E tests across Reviewer System + Web App — making ajrasakha deployment-ready.**

---

## 📌 PR title

```
feat: production hardening + 400-user scale + interactive UI + 12 new E2E tests
```

---

## 🎯 Why this PR

- The Reviewer System & Web App have **no automated test coverage in CI**.
- The current deployment is **single-instance** — it cannot handle real farmer load.
- Render-time errors and offline states **blank the farmer's screen**.
- The 2-hour disclaimer, voice input, and queue flow **must not regress** on every deploy.

This PR delivers a **deployment that scales**, a **UI that never blanks**, **hardened APIs**, and **automated coverage** that gates every merge.

---

## ✨ Features implemented (one-liners)

### A. Production infrastructure (for 400 concurrent users)

| # | Feature | One-line description |
|---|---|---|
| 1 | Production Docker Compose | Spins up 3 backend + 2 frontend replicas with MongoDB + Redis behind Nginx, ready to scale. |
| 2 | Nginx reverse-proxy | Tuned nginx (epoll, 4096 connections/worker, gzip, keepalive-32, file-cache) — proxies /api and WebSockets. |
| 3 | Nginx rate-limiting | Three rate-limit zones (login 5 r/m, webapp 30 r/s, API 60 r/s, advisory 10 r/s) to block abuse. |
| 4 | Nginx security headers | HSTS, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy sent on every response. |
| 5 | TLS drop-in folder | `infra/ssl/` ready for production certs; HTTPS server block ready to enable. |
| 6 | Health probes | `GET /healthz` (Nginx) + `GET /api/health` (backend) used by Docker healthchecks. |

### B. Backend hardening

| # | Feature | One-line description |
|---|---|---|
| 7 | `productionHardening` middleware | Hard & soft body-size limits, JSON/URL depth caps, parameter-limit (1000), Bearer-token shield on `/external-api/*`. |
| 8 | RFC 7807 error responses | All 4xx/5xx return `application/problem+json` with `requestId` for log tracing. |
| 9 | Auth-aware request-id middleware | Every request gets `X-Request-Id` echoed back for end-to-end traceability. |
| 10 | Trust-proxy config | `req.ip` reflects the real client IP behind Nginx. |

### C. Interactive frontend

| # | Feature | One-line description |
|---|---|---|
| 11 | `ErrorBoundary` | Catches render-time crashes, shows a calm retry-able UI, reports to Sentry — never blanks the page. |
| 12 | `NetworkStatus` banner | Auto-detects `offline` events, mounts a top-pinned "You're offline" banner with retry button. |
| 13 | `LoadingSkeletons` | Accessible shimmer skeletons (`role="status"` / `aria-live="polite"`) for list/card/table layouts. |
| 14 | App-shell wiring | Mounted in `routes/__root.tsx` so every route is covered — no extra code in each page. |

### D. QA / E2E coverage (both projects)

| # | Feature | One-line description |
|---|---|---|
| 15 | New reviewer tests | 5 tests for `ErrorBoundary` + UI resilience (`RB-UI-01..05`). |
| 16 | New web-app tests | 7 tests for `NetworkStatus` + offline banner + skeletons (`WEB-OFF-01..03`, `WEB-UI-01..04`). |
| 17 | CI workflow | `.github/workflows/e2e.yml` runs `@reviewer` and `@webapp` separately on every push and on staging deploys. |
| 18 | PR / Issue templates | `bug-report.md` + `new-test-request.md` + `PULL_REQUEST_TEMPLATE.md` for the QA team. |
| 19 | Bug report | `qa/reports/bug-report.md` documenting the 6 bugs found during test writing. |

---

## 📊 Capacity targets

| Metric | Value |
|---|---|
| Concurrent users (steady state) | **400–500** |
| Backend replicas | 3 (least-conn) |
| Frontend replicas | 2× reviewer, 2× webapp |
| Rate-limit zones | 4 (auth / webapp / api / advisory) |
| Static-asset caching | 1 yr immutable |
| TLS | ready (drop certs into `infra/ssl/`) |

---

## 🧪 How to verify locally

```bash
# 1. Stack up
cp .env.production.example .env.production
$EDITOR .env.production
docker compose -f docker-compose.production.yml up -d --build

# 2. Health checks
curl -s http://localhost/healthz
curl -s http://localhost/api/health

# 3. E2E suite
cd qa && npm ci && npm test
```

---

## 📁 Files added

```
docker-compose.production.yml
infra/nginx/nginx.conf
infra/nginx/conf.d/ajrasakha.conf
infra/ssl/.gitkeep
PRODUCTION.md
PR_DESCRIPTION.md
.env.production.example
backend/src/shared/middleware/productionHardening.ts
frontend/src/shared/components/ErrorBoundary.tsx
frontend/src/shared/components/NetworkStatus.tsx
frontend/src/shared/components/LoadingSkeletons.tsx
frontend/src/shared/components/index.ts
.github/workflows/e2e.yml
qa/tests/reviewer-system/error-boundary-ui/error-boundary.spec.ts
qa/tests/web-app/network-status/network-status.spec.ts
```

## 📝 Files modified

```
backend/src/index.ts                       # mount productionHardening middleware
frontend/src/routes/__root.tsx             # wire ErrorBoundary + NetworkStatus
```

---

## ✅ Acceptance criteria

- [x] `docker compose -f docker-compose.production.yml up` boots a healthy stack
- [x] `/healthz` and `/api/health` return 200
- [x] Nginx rate-limit zones return 429 on burst
- [x] ErrorBoundary catches a thrown render error (verified by `RB-UI-04`)
- [x] NetworkStatus banner appears when `context.setOffline(true)` (verified by `WEB-OFF-01..03`)
- [x] Skeletons render on slow networks (verified by `RB-UI-05`, `WEB-UI-04`)
- [x] 12 new E2E tests pass against staging
- [x] Existing 138+ tests still pass (no regression)

---

## 🐞 Bugs found during test writing

See `qa/reports/bug-report.md`. Top 3:

1. **BUG-001** — Mobile submit button overlaps the disclaimer on viewports < 360 px.
2. **BUG-002** — Hindi disclaimer does not fire on Firefox Android (works on Chrome).
3. **BUG-003** — Voice input captures but does not auto-submit on Safari iOS.

---

/cc @platform-team @qa-team @frontend-team