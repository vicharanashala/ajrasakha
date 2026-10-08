# AjraVerify — Planning Brief

Copy-paste this whole document into ChatGPT. It contains everything needed to plan AjraVerify: verified repo facts, integration seams, the recommended architecture, testing strategy, and project conventions. Do not paste any API keys or service-account files anywhere.

---

## 0. Goal

AjraVerify = a **runtime verification / safety gate** for AI-generated agricultural answers in the Ajrasakha codebase. Before an AI answer reaches a farmer, AjraVerify parses its factual claims, checks them against trusted in-repo data sources, and returns a verdict. Unsafe or unverifiable dosage/duration claims must not ship silently — they escalate into the existing human reviewer workflow.

Hard constraints:

- TypeScript only. **No Python.**
- Lives inside the existing backend as a new module. **No new microservice.**
- **No hardcoded agriculture facts in code** — all factual checks resolve against existing data (chemical module, PoP DB, Golden Dataset).
- Reuse existing DI (inversify), validation (class-validator), logging, and test (vitest) infrastructure.

## 1. Verified repo facts

Repo: `T:\Projects\Ajrasakha\ajrasakha` (Git Bash: `/t/Projects/Ajrasakha/ajrasakha`).

- Layout: `frontend/` (React + Vite + TanStack Router), `backend/` (Node + Express + routing-controllers + inversify + class-validator + Mongoose), `testers-dashboard/`. pnpm **10.4.1** pinned by repo/CI. Node 22.
- Backend modules (`backend/src/modules/`): acc-agent, ai, answer, auditTrails, auth, chatbot, chemical, comment, context, core, crop, dashboard, lgd, newSource, notification, organization, performance, plivo, pop, question, request, reroute, user, whatsapp.
- **DI:** inversify, one `ContainerModule` per feature, registered in `backend/src/bootstrap/loadModules.ts` (`loadAppModules`). A new AjraVerify module follows the same pattern — mirror the `crop` module, it is the cleanest example.
- **Controllers:** routing-controllers decorators + class-validator DTOs.
- **Transactions:** `BaseService._withTransaction` (backend/src/shared/classes/BaseService.ts) — MongoDB replica set required. Local dev mongod must run with `--replSet rs0`.
- **Tests:** vitest. Canonical keyless pattern: `backend/src/modules/crop/tests/CropService.test.ts` — mock repositories with `vi.fn()`, no DB, no Firebase. Baseline run: 47 passed / 17 failed / 6 skipped — the 17 failures are **pre-existing** (they need the maintainers' external DB URIs); don't chase them.
- Note: plain `tsc` reports ~583 pre-existing errors, but CI and dev both use `vite build` / `tsx watch` which pass. Don't be alarmed by tsc output.
- Ports: backend **3141** (`APP_PORT`), frontend Vite **5173**. (Vite proxy mentions 4000 but the client uses `VITE_API_BASE_URL=http://localhost:3141/api`.)

## 2. Integration seams (where AjraVerify hooks in)

- **AI answer generation:** `AiService.evaluateAnswers` (`backend/src/modules/ai/services/AiService.ts` ~line 105) calls an external AI server's `/evaluate` endpoint. AjraVerify runs **after** generation, **before** delivery — a post-generation, pre-delivery gate on the answer pipeline.
- **Trusted data sources to check claims against:**
  - `chemical` module — pesticide/fertilizer products, dosages, application details.
  - `pop` module / `PopDatabase` (PoP = Package of Practices) — crop-wise recommended practices.
  - Golden Dataset via `ChatbotRepository` — curated Q&A pairs.
- **Escalation path:** the repo already has a human review workflow — moderator queues, PAE (public agricultural expert) validation, multi-step approval ladder. AjraVerify must **route into this**, not build a parallel system.
- **Post-hoc feedback:** `FeedbackService` (`backend/src/modules/question/services/`) handles thumbs up/down after answers ship — complementary, not a replacement.

## 3. Recommended architecture — deterministic-first

Milestone 1 uses **zero LLM calls**. Everything is deterministic, offline-testable, and keyless.

### 3.1 Module layout

```
backend/src/modules/verification/
  controllers/    VerificationController (routing-controllers)
  services/       VerificationService (orchestrator)
  extractors/     ClaimExtractor interface, RuleBasedClaimExtractor
  policies/       PolicyEngine + verdict rules
  types/          Claim, Verdict, VerificationReceipt types
  tests/          vitest specs (mock repos only)
```

Register a `ContainerModule` in `bootstrap/loadModules.ts` like every other module.

### 3.2 Pipeline

1. **Extract claims** — `ClaimExtractor` interface; M1 impl `RuleBasedClaimExtractor` using regexes:
   - dosage: e.g. `2 ml/L`, `500 g/acre`, `1.5 ml per litre`
   - interval: `every 7 days`, `after 15 days`, `3 sprays`
   - chemical/product names (matched against the chemical module catalogue)
   - crop names (matched against crop module data)
2. **Resolve claims** — `VerificationService` checks each extracted claim against chemical module + PoP + Golden Dataset (exact/near matches via existing repositories).
3. **Decide** — `PolicyEngine` returns a verdict per answer:
   - `VERIFIED` — all claims matched trusted data within tolerance.
   - `CONDITIONAL` — minor deviations (e.g. dosage within ±10%) — deliver with a caveat/receipt.
   - `REVIEW_REQUIRED` — claims present but no trusted match → **push into the existing moderator queue**.
   - `BLOCKED` — contradicts trusted data (e.g. overdose beyond safety limits) → withhold/flag for expert review.
4. **Persist a receipt** — a `VerificationReceipt` document (answer id, claims, per-claim match results, verdict, reasons, timestamps) in a new Mongo collection (e.g. `verification_receipts`), so admins can audit every gate decision. Emit through existing logging/auditTrails patterns.

### 3.3 Milestone 2 — LLM-assisted extraction, deterministic decision

Add `LlmClaimExtractor` behind the **same `ClaimExtractor` interface**, bound via inversify (config/env switch). The LLM only *extracts* candidate claims (handles paraphrase, implicit units, mixed-language input). The `PolicyEngine` stays the **sole decision-maker** — an LLM can never alone produce `BLOCKED`.

### 3.4 API surface (proposed)

- `POST /api/verification/check` — verify an arbitrary answer text (admin/testing).
- `GET /api/verification/receipt/:answerId` — fetch the receipt for a delivered answer.
- Admin dashboard tab (reuse the existing Admin Dashboard tab pattern) listing recent verdicts + escalations.

## 4. Two small PRs to land FIRST (credibility + goodwill)

1. **MongoDatabase TLS fix** (already coded locally in `backend/src/shared/database/providers/mongo/MongoDatabase.ts`): the driver was hard-coding `ssl: true, tls: true` on every `MongoClient`, breaking any non-Atlas `mongodb://` server (`SSLHandshakeFailed`). Fix: enable TLS only for `mongodb+srv://` URIs or URIs with `[?&](ssl|tls)=true`. Verified working against local mongod.
2. **Env typo fix:** `frontend/src/shared/app.ts` line 1 reads the misspelled key `VITE_IS_DEVELPOMENT` (`import.meta.env.VITE_IS_DEVELPOMENT == "true"`). Rename to `VITE_IS_DEVELOPMENT` in code and update env example/docs.

Branch naming, commits, and issue-first flow below apply to these too (`fix(database): ...`, `chore(frontend): ...`).

## 5. Testing strategy

- Copy the `CropService.test.ts` pattern: vitest + `vi.fn()` mock repositories. **No DB, no Firebase, no API keys** — AjraVerify tests must pass fully offline.
- Cover: extractor against tricky strings (units, mixed formats, typos), policy engine against synthetic claim/match combinations (all four verdicts + edge tolerances), receipt shape, controller via service-level fakes.
- Run: `pnpm exec vitest run` (backend/). Watch mode + browser UI: `pnpm exec vitest --ui`.

## 6. Conventions & process

- Branch: `feature/agricultural-answer-verification` off `main`.
- Conventional commits: `feat(verification): ...`, `test(verification): ...`, `fix(database): ...`, `chore(frontend): ...`.
- **Open a GitHub proposal issue first** describing AjraVerify (problem, design, milestones) and get maintainer buy-in before submitting the big PR; link the issue from both fix PRs and the feature PR.
- Never leave AI-assistant tags / "generated by" comments in commits or files; keep diffs clean and attributable.
- Facts live in data (chemical/PoP/Golden Dataset collections), never as code constants.

## 7. Local environment facts (so commands in the plan are real)

- Windows + Git Bash; repo at `/t/Projects/Ajrasakha/ajrasakha`. Node v22, pnpm 10.4.1.
- Local MongoDB 8.2 (portable, in user AppData) **must** run as single-node replica set: `mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017` (rs0 initiated) — `_withTransaction` fails on standalone. Databases used by backend config: `agriai`, `agriai_analytics`, `annam_analytics`, `agriai_pop`.
- Backend on **3141**, frontend on 5173. Repo root has helper launchers: `start-mongodb.cmd`, `start-backend.cmd`, `start-frontend.cmd`, plus `.vscode/launch.json` configs ("Full stack (frontend + backend)" compound).
- Own Firebase project wired via `backend/.env` (service account) and `frontend/.env` (web config). Login flow: GET `/api/users/details/:email` → Firebase signIn → POST `/api/auth/sync` (401 "pending admin verification" for unverified users — by design).
- Working test accounts: `dev@ajrasakha.local` (role pae_expert) and `admin@ajrasakha.local` (role admin), both verified/active in `agriai.users`.

## 8. Open questions the plan must answer

1. Exact schema for `Claim`, `Verdict`, `VerificationReceipt` (and TTL/indexing for receipts).
2. Dosage tolerance policy: what ±% counts as `CONDITIONAL` vs `BLOCKED` per unit type (ml/L vs g/acre vs kg/ha)?
3. Where exactly in the chatbot/answer pipeline the gate is invoked (service level vs controller level), and what the farmer sees when verdict is `BLOCKED`.
4. Multi-language answers (the product targets Indian farmers) — does M1 extraction need Hindi/regional-script variants, or is M2's LLM extractor the answer?
5. Metrics: what to log/count (verdict rates, escalation volume) and where (existing dashboard/analytics tabs).

## 9. Final project submission (Summership 2026) — build to these prompts

Project line: "Ajrasakha — A farmer-friendly multilingual chat interface that answers agricultural queries, prioritising verified expert knowledge over AI-generated responses." Repo: https://github.com/vicharanashala/ajrasakha. Submission is individual; editable until mentor review; word limits enforced.

The feature must be built so every section of the form has a concrete, honest answer. Wherever the pipeline makes a decision, leave an artifact (receipt, log, test, metric) that a form field can later cite.

### Section A — Artefacts (fill at submission time)
- College / Institution: intern's own detail.
- GitHub commits: collect the final commit URLs for the feature branch work.
- Branch Name / PR Link(s): `feature/agricultural-answer-verification` plus the two pre-work PRs (Mongo TLS fix, env typo fix).

### Section B — What You Built (≤150 words)
- Describe the owned sub-part specifically: a deterministic post-generation, pre-delivery verification gate on the AI-answer pipeline — claim extraction (dosage, interval, crop/chemical names), resolution against the chemical module + PoP + Golden Dataset, a four-verdict policy engine (VERIFIED / CONDITIONAL / REVIEW_REQUIRED / BLOCKED), persisted receipts, and escalation into the existing expert review workflow. Say what changed: unsafe or unverifiable dosage/duration claims no longer ship silently; they escalate into the moderator queue. No LLM calls in M1; LLM-assisted extraction arrives in M2 behind the same interface.
- Feature Request mapping: fill from the FRD/problem statement the program issued (no open GitHub issues exist in the repo to cite; placeholder for the intern to complete from the program's FRD).

### Section C — Process & Iteration (≤100 + ≤60 words)
- Track during the build: the first attempt vs final submission delta (e.g. first attempt likely over-scoped: LLM-based checking or a parallel review system; final design is deterministic-first, reuses the existing moderator queue, and data lives in collections, not code constants). Record the date of the first working cut so the before/after story is accurate, not invented.
- Record any real feedback received (CliqueMe, mentor, or peer) that changed the approach. If none arrives, this field must reflect reality — do not fabricate.

### Section D — Reflection on Phase 2 (≤100 words each)
- Hardest technical/conceptual thing: candidates to log as they happen — designing verdict tolerances (±% per unit type) without hardcoding agricultural facts, and wiring a gate into an existing pipeline (service level vs controller level) without breaking transactions. Note which one actually was hardest.
- Understood only after building: expected candidate — why "deterministic-first, LLM-later" wins (testability, no keys, offline CI) and how claim extraction handles messy real answer text (mixed units, paraphrase).
- What you'd do differently: fill honestly at the end from the build log.

### Section E — Zooming Out (≤100 words each)
- Phase 1 coursework → Phase 2 building: record which Phase 1 concepts actually showed up (regex/NLP basics for extraction, DI and testing patterns, database schema design) vs which were missing (working in a large existing codebase, reading someone else's architecture).
- One specific change going forward: e.g. "read the existing integration seams and tests before designing anything new" — must be backed by a real moment from this build.

### Section F — Declaration
- Both checkboxes: confirm links are the intern's own work and info is accurate. The build must keep all contributions attributable to the intern (no assistant tags, clean conventional commits authored by them).

### M1 status (2026-10-01) — BUILT & VERIFIED

Module shipped at `backend/src/modules/verification/` (see `docs/ajraverify-buildlog.md` for the full dated log):

- `RuleBasedClaimExtractor` — regex, format-only claim extraction (dosages, intervals→days, spray counts, chemical candidates); no agricultural facts in code.
- `ClaimResolver` — chemical claims resolved against `chemical_master` + `crop_master` (type=chemical, aliases included); Restricted/Banned statuses come from document data.
- `PolicyEngine` — deterministic 4-verdict decision (VERIFIED / CONDITIONAL / REVIEW_REQUIRED / BLOCKED) from resolution counters.
- `VerificationReceiptRepository` — receipts persisted to `verification_receipts` (indexed by questionId/answerId/verdict+createdAt).
- `VerificationController` — `POST /api/verification/check`, `GET /api/verification/receipt/:questionId`, `GET /api/verification/receipts` (FlexibleAuth).
- Wired via folder-convention exports only — auto-discovered, no `loadModules.ts` edit (earlier plan text said manual registration: wrong for this repo).
- Tests: 22 offline vitest specs, all passing; backend `tsc` clean with the module included (25 by M1.5, **36** after the 2026-10-02 bug round).
- Live-proven: identical unsafe answer produced REVIEW_REQUIRED → VERIFIED → BLOCKED purely by changing catalogue data (receipts in the local `verification_receipts` collection).

### M1.5 status (2026-10-02) — WIRED & LIVE-TESTED

- Gate wired into the two real delivery seams behind `ENABLE_AJRAVERIFY` (off by default): question-processor worker (after AI initial answer) and `AnswerApprovalService.approveLLMAnswer` (before an LLM answer is marked shipped). Non-blocking by design; verdict + reason + receipt id ride on the question document.
- Receipts are linked to the question they judged (`questionId`), so `GET /api/verification/receipt/:questionId` works for ingested questions.
- Four defects found by testing against the live DB and fixed with regression tests — chemistry attribution before formulation codes (missed BLOCKED), unattributable doses passing as VERIFIED, unlinked receipts, filtered totals. Full narrative + receipt ids: `docs/ajraverify-buildlog.md` (2026-10-02) and `docs/ajraverify-before-after.md`.
- Live: 18 receipts (VERIFIED 5 / CONDITIONAL 0 / REVIEW_REQUIRED 10 / BLOCKED 3); demo question `6abf84086c4139d68ea7f5bc` carries a linked receipt `6abf84086c4139d68ea7f5bd`.

Still open for M2/M3: `LlmClaimExtractor` behind the same `ClaimExtractor` interface; per-chemical dose limits in the catalogue so dosage claims get real value comparison; interval/spray-schedule resolution; enforced withholding of BLOCKED answers (policy decision for maintainers); receipts dashboard tab.

### Before/after deliverables
- `docs/ajraverify-before-after.html` — one-page visual BEFORE/AFTER of the answer pipeline (created 2026-10-01). The "before" is already demonstrated live: demo question `6abe12e0997a10320b06553d` sits in the PAE Expert queue with an unverified AI answer and zero verification artifacts.
- `docs/ajraverify-before-after.md` — written BEFORE/AFTER report (**written 2026-10-02**): what changed, evidence from the running system (receipt ids, verdict-per-data-state table, ingestion linkage), the four defects caught by live testing, honest M1 limitations, a five-minute demo script, and which form section cites what.
- `docs/ajraverify-submission-context.md` — self-contained project context/update for pasting into ChatGPT (or a reviewer): architecture, decisions, evidence, timeline, plus **drafted Section A–F answers with verified word counts** and six anticipated mentor questions with grounded answers.
- `docs/ajraverify-submission-brief.pdf` (+ `.html` source) — 8-page printable mentor brief: problem, architecture, before/after evidence, data-driven verdict flips, the four defects, quality, limitations, demo commands, artefact index.

### Build-log duty (so the form writes itself)
While implementing, keep dated notes in this file or `docs/ajraverify-buildlog.md`: first working cut date, design changes + why, feedback received, blockers hit and resolutions, test/verdict stats. Every Section C/D/E answer should cite a dated log entry — nothing reconstructed from memory at submission time.
