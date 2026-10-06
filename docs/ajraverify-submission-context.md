# AjraVerify — Project Context & Update (paste into ChatGPT)

Prepared 2026-10-02 for the Summership 2026 submission. This document is
self-contained: paste the whole thing into ChatGPT and it will know what was
built, how, what was proven, and what is still open. It contains **no API keys,
no credentials, no secrets**.

> Context so far: `docs/ajraverify-plan.md` (planning brief used at the start),
> `docs/ajraverify-buildlog.md` (dated build log), `docs/ajraverify-before-after.md`
> (evidence report + demo script), `docs/ajraverify-before-after.html` (visual
> BEFORE/AFTER), `docs/ajraverify-submission-brief.pdf` (mentor-facing brief).

---

## 0. How to use this document

Paste this file, then ask ChatGPT for the job you want. Examples:

- *"Critique this design as a senior engineer. What would you change before a PR review?"*
- *"Help me answer these mentor questions using only the evidence in this document."*
- *"Rewrite Section B under 150 words without losing the honesty of the limitations."*
- *"Draft the PR description for `backend/src/modules/verification/`."*
- *"Write 5 viva questions a mentor is likely to ask, with model answers grounded in this doc."*

## 1. The base project

- **Repo:** https://github.com/vicharanashala/ajrasakha (branch `main`; my work stays on `feature/agricultural-answer-verification`).
- **What it is:** Ajrasakha is a farmer-facing multilingual chat product for
  agricultural queries. A farmer asks a question in their language; the system
  answers using **verified expert knowledge first**, AI-generated answers second.
- **Stack:** `frontend/` = React + Vite + TanStack Router; `backend/` = Node 22 +
  Express + routing-controllers + inversify + class-validator + Mongoose,
  ESM (`nodenext`, explicit `.js` import extensions), pnpm 10.4.1;
  `testers-dashboard/` also exists. Tests: vitest.
- **Pipeline that matters:** question ingestion → AI initial answer
  (`AiService.evaluateAnswers` / AI server `/evaluate`) → allocation to PAE
  experts / moderators → expert answers → WhatsApp/AI shipping
  (`AnswerApprovalService.approveLLMAnswer`) → farmer.
- **Trust model already in the repo:** human review — moderator queue, PAE
  (public agricultural expert) validation, approval ladder, audit trails.
- **Catalogue data:** `crop_master` and `chemical_master` (Mongo, DB `agriai`)
  hold crop and chemical records with names, aliases and status
  (Approved / Restricted / Banned in the documents).

## 2. What I built — AjraVerify

**Goal:** AI-generated agricultural answers must not ship silently on their
factual claims. AjraVerify is a **deterministic verification gate** that runs
*after* AI generation and *before* delivery: it parses the answer into factual
claims, resolves them against the repo's own trusted catalogues, returns one of
four verdicts, and persists an audit receipt.

Deliberate design stance: **deterministic-first, LLM-later.** M1 makes **zero
LLM calls** — it is regex extraction plus catalogue lookups, so it is testable
offline, costs nothing per answer, and cannot hallucinate. M2 (planned) adds an
LLM *extractor* behind the same interface; the deterministic policy engine
stays the only decision-maker.

### 2.1 The four verdicts

| Verdict | Meaning | What happens |
|---|---|---|
| `VERIFIED` | every factual claim matched trusted data within tolerance | answer ships with a receipt |
| `CONDITIONAL` | all matched, some values in the ±10% caution band | ships **with the receipt attached** |
| `REVIEW_REQUIRED` | a claim (or an unattributable dose) matched nothing trusted | escalates into the existing expert review workflow |
| `BLOCKED` | a restricted/banned chemical is in the answer, or a value is beyond the 50% safety tolerance | must not ship without expert approval |

Precedence: `BLOCKED` > `REVIEW_REQUIRED` > `CONDITIONAL` > `VERIFIED`.

### 2.2 Module map (`backend/src/modules/verification/`)

| File | Role |
|---|---|
| `types/index.ts` | `ClaimKind`, `DosageUnit`, `MatchStatus`, `ValueVerdict`, `Verdict`, `IClaim`, `IClaimResolution`, `IVerdictCounts`, `IVerificationPolicy`, `IVerificationReceipt`, `IVerificationResult` |
| `extractors/RuleBasedClaimExtractor.ts` | regex claim extraction: dosages (ml/L, g/L, ml/acre, g/acre, kg/acre, L/acre, %, ppm), intervals normalised to days (weeks ×7, ranges → upper bound), spray counts (digits + words + ordinals), chemical-name candidates (4 passes incl. "name NN% SL" and product shapes like 2,4-D) |
| `services/ClaimResolver.ts` | resolves chemical names against `chemical_master` then `crop_master` (`type: 'chemical'`, incl. `aliases.english_representation`); Restricted/Banned comes from the document; guards against empty-subject lookups |
| `services/PolicyEngine.ts` | deterministic counters → verdict + human-readable reason; tolerances `nearMiss ±10%`, `blocked 50%`, restricted statuses `['restricted','banned']` |
| `services/VerificationService.ts` | orchestrator: extract → resolve → decide → persist; a receipt write failure never changes the decision |
| `repositories/VerificationReceiptRepository.ts` | `verification_receipts` collection; indexes on `questionId`, `answerId` (sparse), `createdAt`, `verdict+createdAt` |
| `controllers/VerificationController.ts` | `POST /api/verification/check`, `GET /api/verification/receipt/:questionId`, `GET /api/verification/receipts?limit&verdict` (all behind existing `FlexibleAuth`; DTO-validated) |
| `classes/validators/VerificationValidators.ts` | `VerifyAnswerBody`, `QuestionIdParam`, `RecentReceiptsQuery` (verdict `IsIn`) |
| `container.ts`, `index.ts` | folder-convention exports — auto-discovered by `bootstrap/loadModules.ts`, no manual registration |
| `tests/` | 4 spec files, 36 offline tests (see §4) |

Touched outside the module (small, surgical):
`backend/src/types.ts` (one DI symbol), `backend/src/config/app.ts`
(`ENABLE_AJRAVERIFY` flag), `backend/src/workers/questionProcessor.worker.ts`
(gate after the AI initial answer), `backend/src/modules/answer/services/AnswerApprovalService.ts`
(gate before an LLM answer is marked shipped),
`backend/src/shared/database/providers/mongo/MongoDatabase.ts` (TLS fix, see §7).

### 2.3 Where it hooks into the pipeline (M1.5)

Two seams, both behind `ENABLE_AJRAVERIFY=true` (off by default):

1. **Ingestion** — `questionProcessor.worker.ts`: after the AI initial answer is
   generated *or* supplied with a bulk upload, the gate runs and stores
   `aiAnswerVerification {verdict, reason, receiptId}` on the question document.
   The question `_id` is pre-allocated so the receipt is linked to the question.
2. **Shipping** — `AnswerApprovalService.approveLLMAnswer` (WhatsApp / AJRASAKHA
   AI-ship path): verifies the answer text before it is marked shipped and
   stores the verdict on the question.

Both are **best-effort by design**: a verification failure is logged and
swallowed so ingestion/approval never stalls. Enforcement (actually withholding
a `BLOCKED` answer) is deliberately *not* imposed unilaterally — that is a
maintainer policy decision, and the seam is in place for it.

### 2.4 Key design decisions (and why)

- **No agricultural facts in code.** The extractor only recognises *shapes*;
  whether a chemical exists and whether it is banned is read from the
  catalogue at runtime. Proof: the identical answer flips
  `REVIEW_REQUIRED → BLOCKED → VERIFIED` purely by changing one document's
  `status` (§3.2).
- **Precision traded for recall.** A name the extractor cannot confirm becomes
  `NOT_FOUND` → escalates. False positives cost expert time; false negatives
  let a bad dose reach a farmer. The dangerous direction is always the loud one.
- **Facts in receipts, not dashboards.** Every decision is a persisted document
  (claims, per-claim resolutions, reason, counters, policy thresholds,
  extractor id, timestamp) — auditable without trusting logs.
- **The decision engine reads structured fields, never prose.** Resolutions
  carry `status`, `valueVerdict`, `restrictedChemical`; reason strings are for
  humans. (I removed an earlier version that regex-matched the reason text.)
- **Unattributable doses must not pass.** "Apply 500 ml per acre" with no
  product name is checked against nothing, so it resolves `NOT_FOUND` and goes
  to review rather than passing as `VERIFIED`.
- **Positional, sentence-scoped attribution.** A dose is attributed to the
  nearest chemical mention (inside → before → after), never across a sentence
  boundary, so a mention in sentence 1 cannot silently justify a dose in
  sentence 3.

### 2.5 Representative code (for review)

Extraction is format-only — no facts:

```ts
{re: /\b(\d+(?:\.\d+)?)\s*(?:ml|millilit(?:re|er)s?)\s*(?:\/|per\s+)\s*l(?:itre|iter)?s?\b/gi, unit: DosageUnit.ML_PER_L},
```

The decision (deterministic counters, no LLM):

```ts
if (counts.restrictedChemicals > 0 || counts.outOfRange > 0) { /* BLOCKED */ }
else if (counts.notFound > 0) { /* REVIEW_REQUIRED */ }
else if (counts.nearMiss > 0) { /* CONDITIONAL */ }
else { /* VERIFIED */ }
```

The safety guard that keeps an empty subject from matching an arbitrary
catalogue document (an empty regex `\b\b` matches everything):

```ts
const trimmed = (subject ?? '').trim();
if (trimmed.length < 3) return null;
```

## 3. What is proven (live, against the local stack)

Local stack used for evidence: `mongod --replSet rs0` on 27017 (single-node
replica set, required by the repo's transactions), backend on 3141, admin
Firebase JWT, real collections `agriai.chemical_master` /
`agriai.crop_master` / `agriai.questions` / `agriai.verification_receipts`.

### 3.1 Before vs after, same answer text

The demo answer (recommends a restricted insecticide at 25 ml/L, every 5 days,
3 sprays):

> "Spray monocrotophos 36% SL at 25 ml per litre of water, about 500 ml per acre.
> Repeat the spray every 5 days for 3 sprays. Spray during early morning for best
> results."

| | Before (question `6abe12e0997a10320b06553d`) | After (question `6abf84086c4139d68ea7f5bc`) |
|---|---|---|
| pipeline | none | gate after AI answer, before delivery |
| `aiAnswerVerification` | `null` | `{verdict: "REVIEW_REQUIRED", reason: "1 claim could not be matched against trusted data — expert review required before delivery.", receiptId: "6abf84086c4139d68ea7f5bd"}` |
| receipt for the question | none | `GET /api/verification/receipt/6abf84086c4139d68ea7f5bc` → 200, linked, dosage claims attributed to `monocrotophos` |

### 3.2 Data-driven verdict flips (identical text, only data changed)

| Catalogue state for `Monocrotophos` | Verdict | Receipt |
|---|---|---|
| no entry | `REVIEW_REQUIRED` | `6abf81be66c31ab082675ac8` |
| entry, `status: "Restricted"` | **`BLOCKED`** — "Blocked: 1 restricted/banned chemical in the trusted catalogue." | `6abf81cf66c31ab082675aca` |
| entry, `status: "Approved"` | `VERIFIED` | `6abf81cf66c31ab082675acb` |

Seeds were removed afterwards; catalogues left as found. All receipts remain as
the audit trail.

### 3.3 Receipt store state at time of writing

`GET /api/verification/receipts` → **18** receipts total:
`VERIFIED 5 · CONDITIONAL 0 · REVIEW_REQUIRED 10 · BLOCKED 3`.
Filtered queries return a matching `total`. Verified live: blank body → 400,
`verdict=NOT_A_VERDICT` → 400, malformed receipt id → 400, unknown question →
404, both auth modes (internal API key and Firebase JWT) accepted.

## 4. Quality

- **36 offline vitest specs, 4 files**, all passing: extractor 16 (units,
  ranges, word counts, formulation codes, filler rejection, sentence
  boundaries), policy 8 (all four verdicts + tolerance edges), resolver 4
  (catalogue guards, restriction flag), service 8 (verdict routing,
  persistence-failure isolation, integration of real extractor + resolver).
  **No DB, no Firebase, no keys, no network** — runs in any CI.
- `pnpm exec tsc --noEmit` clean with the module included in the production build.
- Full backend suite: the AjraVerify files are green; the repo has **21
  pre-existing failures** in auth/crop/question tests (test drift, verified
  pre-existing by stashing only my tracked changes and re-running). Untouched
  by this work.

## 5. Timeline (dated, in `docs/ajraverify-buildlog.md`)

- **2026-10-01 — M1 built and live-proven.** Module, 25 tests, three verdicts
  reproduced by data change only. Bugs found and fixed *in the same session*:
  interval ranges extracted nothing; an interleaved "25 ml monocrotophos per
  litre" was missed because of a stray regex quantifier; an inversify DI crash
  (`toSelf()` with an optional constructor arg → parameterless `configure()`).
- **2026-10-02 — M1.5 wired, then live-tested against the database.** Four
  defects found by running it for real (§6), each fixed with a regression test;
  tests 25 → 36; docs/report written; cleanup done.

## 6. What running it for real caught (honest process story)

1. **The chemical name was lost behind a formulation code.** "monocrotophos 36%
   SL at 25 ml per litre" attributed the doses to `"sl at"` and `"about"` —
   visible in the preserved pre-fix receipt `6abe5f31ebd4291b0034e2c6`. With a
   restricted chemical in the catalogue that would resolve `NOT_FOUND` →
   `REVIEW_REQUIRED` instead of **`BLOCKED`**: a false go-ahead in the
   dangerous direction. Fixed with filler/formulation-token rejection, a
   `"<name> NN% <formulation>"` extraction pass, and sentence-scoped positional
   attribution.
2. **A dose with no product passed as `VERIFIED`** — nothing had been compared.
   Now `NOT_FOUND` → `REVIEW_REQUIRED`.
3. **Ingestion receipts were unlinked** (`questionId: null` on 12 of 17
   receipts) so the per-question audit lookup 404'd. Fixed by pre-allocating
   the question id.
4. **Filtered totals ignored the filter** (every verdict query reported the
   collection size). Fixed; list and total now agree.

Lesson worth stating in the form: unit tests pass on the shapes you imagine;
only real text against real data shows you which claims you silently dropped.

## 7. Two small, separate bug fixes (goodwill PRs)

- **Mongo TLS** — `MongoDatabase` hard-coded `ssl: true, tls: true` on every
  `MongoClient`, breaking any non-Atlas `mongodb://` server with
  `SSLHandshakeFailed`. Now TLS is enabled only for `mongodb+srv://` or URIs
  with `[?&](ssl|tls)=true`. Verified against local mongod.
- **Env typo** — `frontend/src/shared/app.ts` read the misspelled
  `VITE_IS_DEVELPOMENT`; `.env.example` already had the correct
  `VITE_IS_DEVELOPMENT`. Fixed to the correct key.

Both are deliberately tiny, isolated and in the conventional-commit format the
repo uses (`fix(database): ...`, `chore(frontend): ...`), so they can land
before or independently of the feature PR.

## 8. Honest limitations (M1 scope)

- Catalogues carry **no per-chemical dose limits** today, so dosage *values*
  are recorded as expert evidence rather than compared; name and
  restricted/banned status are compared. A gate is only as strict as its data.
- Interval / spray-count claims are recorded as `unresolved` — no trusted
  schedule source is wired yet.
- Extraction is English/Latin-script regex; paraphrase, mixed-language and
  regional-script answers are M2 (LLM extractor behind the same interface).
- Enforcement is evidence-only by design (§2.3); no dashboard tab yet (the
  receipts API is dashboard-ready); no frontend surface beyond the API.
- No open GitHub issues exist in the repo to cite, and the programme's FRD text
  was not provided to me, so the Feature-Request mapping must be worded from
  the problem statement I was given (honest framing: "maps to the FRD item on
  answer reliability/safety" — leave the exact FRD id to whoever has the form).

## 9. Suggested next milestones (in order)

1. **Per-chemical dose limits in the catalogue** — unlocks the ±10%/±50% bands
   (currently only name/status is compared).
2. **Interval resolution** against PoP (Package of Practices) documents.
3. **Enforce `BLOCKED`** — withhold the answer instead of only flagging it.
4. **M2 `LlmClaimExtractor`** behind the same interface + config switch.
5. **Admin receipts dashboard tab** (verdict filters already in the API).

## 10. Repo conventions I followed (so the PR review is clean)

Conventional commits; module auto-discovery by folder convention (no manual
DI registration); `nodenext` imports with explicit `.js`; test files typecheck
under `tsc` (tsconfig only excludes `*.spec.ts`); no assistant attribution in
code, commits or files; neutral filenames under `docs/`; local scratch under
`.tmp/` (git-excluded).

---

## 11. Drafted form answers (word-limited, evidence-backed)

Replace anything bracketed with your own details. Counts are in brackets.

### Section A — Artefacts

- Repository: https://github.com/vicharanashala/ajrasakha
- Feature branch: `feature/agricultural-answer-verification`
- Feature module: `backend/src/modules/verification/` (new module, 14 files)
- Companion PRs (small fixes): Mongo TLS fix; frontend env-typo fix
- Supporting docs in-repo: `docs/ajraverify-before-after.md`,
  `docs/ajraverify-buildlog.md`, `docs/ajraverify-submission-brief.pdf`
- Evidence artefacts: receipts `6abf81cf66c31ab082675aca` (BLOCKED),
  `6abf81cf66c31ab082675acb` (VERIFIED), `6abf81be66c31ab082675ac8`
  (REVIEW_REQUIRED), `6abf81be66c31ab082675ac9` (unattributable dose),
  `6abf84086c4139d68ea7f5bd` (linked to question `6abf84086c4139d68ea7f5bc`);
  before-artifact question `6abe12e0997a10320b06553d` (no verdict, no receipt).

### Section B — What You Built (115 / 150 words)

> I built AjraVerify, a deterministic safety gate inside the existing backend
> (`backend/src/modules/verification/`) that runs on AI-generated agricultural
> answers after generation and before delivery. It extracts factual claims
> (dosages, application intervals, spray counts, chemical names) with regex,
> resolves them against the repo's existing chemical and crop catalogues, and
> returns one of four verdicts — VERIFIED, CONDITIONAL, REVIEW_REQUIRED,
> BLOCKED — with a persisted audit receipt containing every claim and its
> resolution. Unsafe or unverifiable claims no longer ship silently: they
> escalate into the existing PAE-expert review workflow. Milestone 1 makes zero
> LLM calls, so the whole gate is offline-testable; an LLM-assisted extractor
> is planned behind the same interface, with the deterministic policy engine
> remaining the only decision-maker.

### Section C1 — Process & iteration (94 / 100 words)

> My first working cut was a standalone verifier, but running it against the
> real database on 2 October exposed four defects unit tests could not: a
> formulation code swallowed the chemical name, so a restricted chemical would
> have been flagged for review instead of blocked; a dose with no product name
> passed as verified without any comparison; ingestion receipts were stored
> without their question id; and filtered counts ignored the filter. All four
> are fixed with regression tests (25 to 36). The lesson: real text against
> real data finds claims your tests never imagined.

### Section C2 — Feedback (58 / 60 words)

> No mentor review has happened yet. Two things changed my approach: an earlier
> version decided BLOCKED by regex-matching its own human-readable reason text,
> which I replaced with a structured flag; and my first extraction policy
> favoured precision, which I reversed to favour recall, since here a false
> positive costs expert time while a false negative reaches a farmer.

### Section D1 — Hardest thing (70 / 100 words)

> Designing verdict tolerances without hardcoding agricultural facts. A
> percentage tolerance is meaningless until the catalogue carries the trusted
> value, so the hard part was defining the contract: the extractor only
> recognises shapes, the resolver only reads documents, and the policy engine
> only reads structured counts. Wiring the gate into an existing pipeline was
> second — placing it after generation and before delivery, non-blocking, so
> verification could never stall question ingestion.

### Section D2 — Understood only after building (80 / 100 words)

> That "deterministic-first, LLM-later" wins, but not for the reason I
> expected. I expected it for testability. What actually convinced me was the
> safety direction: the deterministic engine can prove why it blocked an
> answer (claim, document, tolerance) and can never hallucinate a restriction.
> I also learned that extraction quality is about *what you silently drop*: a
> perfectly green extractor still lost the chemical name in
> "monocrotophos 36% SL at 25 ml per litre", and only a live run revealed it.

### Section D3 — What I would do differently (59 / 100 words)

> I would have built the live-data harness first. The four defects came from
> running real text through real collections, not from more unit tests — one
> afternoon of end-to-end runs before writing the extractor would have saved a
> full fix-and-verify round. I would also have opened the proposal issue before
> coding, so the design discussion happened before the implementation.

### Section E1 — Phase 1 concepts that actually showed up (74 / 100 words)

> Regular expressions and string parsing were the extractor's core;
> dependency injection and unit testing were the module's backbone; schema
> thinking shaped the receipt document and its indexes. What Phase 1 did not
> prepare me for was working inside someone else's large codebase: reading the
> answer pipeline to find the correct seam, respecting existing DI, auth,
> validation and transaction patterns, and writing code that survives review
> in a repo whose conventions I do not own.

### Section E2 — One specific change going forward (47 / 100 words)

> Read the existing integration seams and their tests before designing
> anything. In this repo, modules are auto-discovered by folder convention and
> transactions require a replica set — facts that would have changed my design
> had I read them on day one instead of discovering them at boot.

### Section F — Declaration

- [x] The work linked in Section A is my own.
- [x] The information given is accurate and complete to the best of my knowledge.

## 12. Anticipated mentor questions (with grounded answers)

1. *"Why not just ask the LLM to check its own answer?"* — An LLM cannot
   reliably say what the catalogue says, and it cannot prove a restriction. The
   gate resolves against documents and stores the evidence; the LLM's job in M2
   is only to *find* candidate claims, never to decide.
2. *"Is regex extraction reliable?"* — Not on its own, which is why I favoured
   recall: an unrecognised chemical escalates to a human instead of passing.
   Precision comes from the catalogue lookup, and the receipts show exactly what
   was matched.
3. *"What if the catalogue is wrong or empty?"* — Then the gate escalates
   (`REVIEW_REQUIRED`), it does not wave answers through: an empty catalogue
   produced `REVIEW_REQUIRED` for the demo answer. The data quality becomes a
   visible verdict, not a silent gap.
4. *"Can this block a good answer?"* — It is evidence-only in M1.5 by design;
   enforcement is a maintainer policy decision. A wrong catalogue entry would
   cause false escalation, not silent harm.
5. *"How do you know it works?"* — 36 offline tests plus live evidence: the same
   answer text produced `REVIEW_REQUIRED`, `BLOCKED` and `VERIFIED` purely by
   changing one catalogue document, with receipts preserved.
6. *"What is the biggest limitation?"* — No per-chemical dose limits in the
   catalogue yet, so dosage values are recorded for expert review rather than
   compared. Adding that data unlocks the tolerance bands.