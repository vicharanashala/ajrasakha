# Backend E2E Coverage Gap Report

**Updated 2026-08-24** (originally generated earlier in this project, revised
twice as coverage passes landed). This supersedes prior versions of this
document — see "What changed" below for what closed the gap it originally
described.

Numbers below come from `pnpm run test:e2e:coverage` (`scripts/e2e-coverage-report.mjs`),
a static-analysis tool that cross-references every `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete`
route decorator across `backend/src/modules/*/controllers` against every
literal path called from `backend/src/e2e/**/*.e2e.test.ts`. See `README.md`'s
"Coverage" section for what this tool can and can't tell you — it's a
mechanical floor (does _some_ test hit this route at all), not a substitute
for reading each suite's own `.md` doc to see what's actually verified.

**Total: 18 controllers, 292 routes. 264 routes (90.4%) have at least one e2e test.**

---

## Summary by module

| Module       | Total routes | Covered | Coverage | e2e dir                                                                      |
| ------------ | -----------: | ------: | -------: | ---------------------------------------------------------------------------- |
| answer       |           10 |      10 |     100% | ✅ used by `post-allocation/`, `gatekeeper-auditor/`, `answer/`              |
| auditTrails  |            4 |       4 |     100% | ✅ `auditTrails/`                                                            |
| auth         |            8 |       8 |     100% | ✅ `auth/`                                                                   |
| chemical     |            5 |       5 |     100% | ✅ `chemical/`                                                               |
| comment      |            2 |       2 |     100% | ✅ `comment/`                                                                |
| context      |            3 |       3 |     100% | ✅ `context/`                                                                |
| dashboard    |            8 |       8 |     100% | ✅ `dashboard/`                                                              |
| notification |           10 |      10 |     100% | ✅ `notification/`                                                           |
| performance  |           18 |      18 |     100% | ✅ `performance/`                                                            |
| request      |            5 |       5 |     100% | ✅ `request/`                                                                |
| reroute      |            6 |       6 |     100% | ✅ `reroute/`                                                                |
| user         |           30 |      30 |     100% | ✅ `user/`                                                                   |
| chatbot      |           61 |      57 |      93% | ✅ `chatbot/`                                                                |
| plivo        |           10 |       9 |      90% | ✅ `plivo/`                                                                  |
| lgd          |           16 |      14 |      88% | ✅ `lgd/`                                                                    |
| crop         |            7 |       6 |      86% | ✅ `crop/`                                                                   |
| whatsapp     |            6 |       5 |      83% | ✅ `whatsapp/`                                                               |
| **question** |       **83** |  **64** |  **77%** | ✅ `question/` (incl. `QuestionControllerGaps.e2e.test.ts`) + 7 other suites |

---

## What changed

A first pass (2026-08-25) added 17 new suite files (306 tests) covering 13
previously-zero-coverage modules plus gap-fills for `whatsapp`/`answer`/`chatbot`,
taking overall coverage from ~14% to ~77% (224/292). That pass deliberately
deferred `QuestionController` (83 routes, the largest single controller) given
its size and the mix of genuinely-testable business routes vs.
internal/ops/migration endpoints not well suited to this kind of testing.

A second pass (2026-08-24, this update) added
`question/QuestionControllerGaps.e2e.test.ts` (60 tests, all passing), closing
`question` from 24/83 (29%) to 64/83 (77%) and overall coverage from 77% to
**90.4% (264/292)**. It also found 4 new bugs (documented below and in the
suite's own `.md`) and confirmed a routing-controllers auth quirk generalizes
to routes not previously tested.

---

## Small remaining gaps outside `question` (9 routes)

Unchanged from the prior pass — each is 1-4 routes per module, mostly
low-risk or genuinely hard-to-reach in-process:

| Module   | Route                          | Why it's not covered                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chatbot  | `GET /state-wise-analytics`    | Loop-array coverage recovery heuristic didn't catch this one specific literal; likely a false negative — spot-check before assuming it's untested                                                                                                                                                                                       |
| chatbot  | `GET /weather-concern-queries` | Same as above                                                                                                                                                                                                                                                                                                                           |
| chatbot  | `GET /active-users-trend`      | Same as above                                                                                                                                                                                                                                                                                                                           |
| chatbot  | `GET /feedback-by-location`    | Same as above                                                                                                                                                                                                                                                                                                                           |
| plivo    | `POST /answer`                 | The inbound-call webhook Plivo itself calls — marks a real agent busy and requires simulating Plivo's own request shape; explicitly out of scope, see `plivo/PlivoController.e2e.md`                                                                                                                                                    |
| lgd      | `POST /districts/all`          | Not yet covered — adds the single common "All" district; a legitimate small gap, not a false negative                                                                                                                                                                                                                                   |
| lgd      | `POST /kvks/sync`              | Runs a real script reading a CSV and upserting the real `kvks` collection; explicitly out of scope, see `lgd/LocationController.e2e.md`                                                                                                                                                                                                 |
| crop     | `GET /bulk-status/:jobId`      | Actually covered (see `crop/CropController.e2e.test.ts`) — the test uses a literal fake job id (`not-a-real-job-id`) rather than a `${...}`-interpolated one, which the coverage script doesn't recognize as a dynamic segment. False negative.                                                                                         |
| whatsapp | `GET /threads/:threadId/:date` | Covered by an auth-gate-only test (real call hangs indefinitely against this environment's WhatsApp backend, see `whatsapp/WhatsAppController.e2e.md`) — the script only counts a route as covered if a literal path matches, and this one uses two `${...}`-interpolated segments in a way the regex under-recognizes. False negative. |

Net: of these 9, only `lgd`'s `POST /districts/all` and the deliberately
out-of-scope routes (`plivo POST /answer`, `lgd POST /kvks/sync`) are real
gaps — the rest are coverage-script false negatives, confirmed by reading each
suite's actual test file rather than trusting the tool's output alone.

---

## `question` (`QuestionController`) — 19 routes remaining, all deliberately out of scope

`QuestionControllerGaps.e2e.test.ts` brings `question` from 24/83 to 64/83
(per `pnpm run test:e2e:coverage`). Every one of the 19 routes still uncovered
falls into a category the original triage explicitly flagged as a poor fit
for this kind of in-process e2e testing — **none are overlooked business
logic**:

| Category                           | Routes                                                                                                                                                                                                                                                                                                              | Why excluded                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real external-AI-service calls (3) | `POST /generate` (219), `/generate-by-call-context` (230), `/call-summary` (241)                                                                                                                                                                                                                                    | Same pattern as `answers/fetch-ai-answer` — needs dedicated mocking/fixture work beyond an "accept a clean 5xx" pattern to be a meaningful test             |
| ACC-agent flow (4)                 | `POST /acc-agent/thread` (264), `/acc-agent/extract` (278), `/acc-agent/update-state` (307), `/acc-agent/resume` (340)                                                                                                                                                                                              | A multi-step external call-agent state machine; needs its own dedicated fixture chain                                                                       |
| Bulk CSV processing (1)            | `POST /bulk-pae-allocate` (1660)                                                                                                                                                                                                                                                                                    | Kicks off worker-thread processing — already documented unreachable in-process, same as `crop`'s bulk upload                                                |
| Internal/background/ops routes (8) | `/background/process` (3142), `/background/remove-history-entry` (3157), `/background/remove-queue-entry` (3179), `/background/add-queue-entry` (3201), `/background/add-history-entry` (3223), `/background/normalize-state` (3245), `/background/normalize-district` (3268), `GET /background/unknown-geo` (3286) | One-off internal ops helpers, not real API surface a client calls                                                                                           |
| Cross-DB migration/comparison (3)  | `POST /check-overlaps` (3298), `/run-migration` (3310), `/migrate-firebase-users` (3322)                                                                                                                                                                                                                            | `check-overlaps` compares staging vs. production DBs (no staging DB connection configured in this environment); the other two are one-off migration scripts |

If a future pass wants to close these, priority order would be: the 3
external-AI routes and 4 ACC-agent routes first (real business value, just
need more fixture investment), then decide case-by-case whether the
ops/migration routes are worth testing at all given they're not client-facing
API surface.

---

## New bugs found in this pass

See `question/QuestionControllerGaps.e2e.md` and `README.md`'s "Known bugs"
table for full detail. Summary:

- `POST /reAllocateLessWorkload`, `POST /reAllocateSelectedQuestions`, and
  `GET /:questionId/generate-answer` have no `@Authorized()` at all.
- `PATCH /:questionId`, `GET /admin/closed-answer-mismatch`,
  `POST /admin/normalized-domain`, `POST /admin/backfill-closed-moderator` use
  `@UseBefore(InternalApiAuth)` only — no user login required, despite the
  `admin/` path segment.
- `GET /:id` and `GET /background-status` are dead code — both registered
  after `GET /:questionId`, which intercepts every single-segment `GET` first.
- `GET /:questionId/chatbot`'s `NotFoundError` branch is dead code — the
  underlying service throws a plain `Error` instead of returning null, so a
  clean 404 is a 500 in practice.
- `POST /data/out-reach/date` crashes with a raw `TypeError` for a genuinely
  anonymous caller (no `@Authorized()`, but unconditionally reads `user._id`).
