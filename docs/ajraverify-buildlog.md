# AjraVerify — Build Log

Dated notes for the Summership submission (Sections C/D/E cite these entries).

## 2026-10-01 — M1 prototype working (deterministic gate, zero LLM calls)

**What exists now** — `backend/src/modules/verification/`:

| Piece | File | Notes |
|---|---|---|
| Claim extractor | `extractors/RuleBasedClaimExtractor.ts` | Regex, format-only: dosages (ml/L, g/L, ml/acre, g/acre, kg/acre, L/acre, %, ppm), intervals (normalised to days), spray counts + ordinals, chemical-name candidates. No agricultural facts in code. Attaches chemical subject to dosages ("X 25 ml/L", "25 ml/L of X"). |
| Claim resolver | `services/ClaimResolver.ts` | Checks chemical mentions against `chemical_master` + `crop_master` (type=chemical, incl. aliases). Statuses (Restricted/Banned) come from the documents. Unknown chemical → NOT_FOUND. Interval/count claims recorded UNRESOLVED (expert evidence, M1). |
| Policy engine | `services/PolicyEngine.ts` | Deterministic 4-verdict decision from resolution counters: BLOCKED (restricted/banned or out-of-range) > REVIEW_REQUIRED (not found) > CONDITIONAL (near miss) > VERIFIED. |
| Receipt store | `repositories/VerificationReceiptRepository.ts` | `verification_receipts` collection, indexes on questionId/answerId/createdAt/verdict+createdAt. Receipt write failure never blocks the gate decision. |
| Orchestrator | `services/VerificationService.ts` | extract → resolve → decide → persist. |
| API | `controllers/VerificationController.ts` | `POST /api/verification/check`, `GET /api/verification/receipt/:questionId`, `GET /api/verification/receipts`. FlexibleAuth. |
| Module wiring | `index.ts` / `container.ts` / `types.ts` | Folder-convention exports (`verificationModuleControllers/Validators/ContainerModules`) — auto-discovered by `bootstrap/loadModules.ts`; one GLOBAL_TYPES symbol added. |

**Tests:** 22 vitest specs in `tests/` (extractor, policy, service), all offline (mocked resolver + receipt repo, no DB/Firebase/keys). Full verification suite: 22/22 pass. Backend `tsc` compiles clean with the new module.

**Live API proof (all three runs used the identical unsafe answer text: "Use 25 ml per litre of monocrotophos. Repeat every 5 days for 3 sprays."):**

1. Catalogue empty → `REVIEW_REQUIRED` ("1 claim could not be matched against trusted data"), receipt `6abe4d1a...3985`.
2. Seeded `Monocrotophos` status `Approved` in `crop_master` → `VERIFIED`, receipt `6abe4d62...3986`.
3. Same doc flipped to `Restricted` → `BLOCKED` ("1 restricted/banned chemical in the trusted catalogue"), receipt `6abe4dad...3987`.

Only the data changed — zero code/config changes between runs. This is the "facts come from data, not code" property demonstrated live. Demo seeds removed after each run; catalogue left as found. All three receipts remain in `verification_receipts` as the audit trail.

**Design decisions logged (feed Section C/D):**
- inversify requires parameterless or fully-decorated constructors — `PolicyEngine` optional constructor arg crashed container load at boot ("Found unexpected missing metadata on type PolicyEngine"). Fixed with a parameterless `configure()` override method. Lesson: DI constraints shape APIs here; check constructor shapes before binding `toSelf()`.
- Extraction precision deliberately sacrificed for recall: unknown chemical names must become NOT_FOUND (escalate), not be silently dropped. False negatives are the dangerous direction; false positives only cost expert time.
- Test files (`*.test.ts`) compile into the production build (tsconfig only excludes `*.spec.ts`) — they must typecheck under `tsc`; verified.
- Import extensions are load-bearing: `../types/index.js` not `../types.js` (nodenext). Cost one tsc round.

**Local infra notes:** backend boots ~90s (socks proxy shim) — wait on the :3141 LISTENING before curl; curl needs `--noproxy "*"`; dev JWT minted via frontend Firebase web key (backend key invalid), cached at `%LOCALAPPDATA%/Temp/ajra-idtoken.txt`.

**Next (queued):** seed a couple of real catalogue entries for a persistent demo, wire the gate into the delivery path (M1.5 seam behind `ENABLE_AI_SERVER` question processor / answer services), M2 `LlmClaimExtractor` behind the same interface, dashboard tab for receipts.

## 2026-10-02 — M1.5 wired, live-tested against the DB, four defects found and fixed

**Context:** the gate was wired into the two real delivery seams and then run against the local stack (mongod + backend + admin upload). Testing on real text exposed four defects that unit tests had missed. All four are fixed with regression tests.

**M1.5 wiring (behind `ENABLE_AJRAVERIFY`, off by default → on locally):**
- `questionProcessor.worker.ts` — after the AI initial answer is generated or read from the upload, the gate runs and `aiAnswerVerification {verdict, reason, receiptId}` is stored on the question document. The question `_id` is pre-allocated and passed to the gate so the receipt is linked to the question it judged. Best-effort: failures are logged and swallowed, ingestion never stalls.
- `AnswerApprovalService.approveLLMAnswer` — the WhatsApp/AI-ship path verifies `updates.answer` before marking it shipped and stores the verdict on the question. Same non-blocking rule.

**Defects found by running it (each one fixed + regression-tested):**

1. **Chemical subject lost before a formulation code** — "monocrotophos 36% SL at 25 ml per litre" produced subjects `"sl at"` and `"about"`, not `"monocrotophos"` (evidence receipt `6abe5f31ebd4291b0034e2c6`, stored claims show it). With a restricted chemical in the catalogue that resolves NOT_FOUND → REVIEW_REQUIRED instead of **BLOCKED** — a false go-ahead on the dangerous side. Fix: token-level filler/formulation-code rejection (`sl/ec/wp/…`, `about/at/…`), a new pass for "<name> NN% <formulation>", and positional subject attachment (nearest mention inside → before → after the dose, never across a sentence boundary).
2. **Unattributable dose passed as VERIFIED** — "Apply about 500 ml per acre of water" has a dose and no product; the resolver returned MATCHED_NO_VALUE and the policy engine called it verified *without comparing anything*. Fix: an unattributable dose resolves NOT_FOUND → REVIEW_REQUIRED ("could not be attributed to a chemical name in the answer").
3. **Receipts not linked to the question** — the worker called the gate before insert with no question id, so `questionId` was null (12 of 17 receipts) and `GET /receipt/:questionId` 404'd for every ingested question. Fix: pre-allocate the question ObjectId, pass it to the gate, insert with it. Verified: `GET /api/verification/receipt/6abf84086c4139d68ea7f5bc` → 200 with `questionId` set.
4. **Per-verdict totals ignored the filter** — `total` came from `countDocuments({})`, so every filtered query reported the collection size (all four verdicts showed the same number). Fix: `count(verdict?)` — the list and its total now always agree.

Also refactored while in there: the policy engine no longer detects restrictions by regexing `reason` text — `ClaimResolver` sets an explicit `restrictedChemical` flag (a status block, not a value comparison), so decisions read structured fields only. Reason strings are now purely human-facing.

**Live proof after the fixes (identical answer text, only catalogue data changed):**

| Catalogue state for Monocrotophos | Verdict | Receipt |
|---|---|---|
| no entry | REVIEW_REQUIRED (1 claim unmatched) | `6abf81be66c31ab082675ac8` |
| status `Restricted` | **BLOCKED** — "1 restricted/banned chemical in the trusted catalogue." | `6abf81cf66c31ab082675aca` |
| status `Approved` | VERIFIED | `6abf81cf66c31ab082675acb` |

Same text with no product name ("Apply about 500 ml per acre of water") → REVIEW_REQUIRED, receipt `6abf81be66c31ab082675ac9`.

**End-to-end ingestion proof:** admin bulk upload with `allocationMode=pae_expert` → question `6abf84086c4139d68ea7f5bc`, `aiAnswerVerification = {REVIEW_REQUIRED, "1 claim could not be matched…", receiptId 6abf84086c4139d68ea7f5bd}`, receipt retrievable by question id. Receipt store at time of writing: 18 total — VERIFIED 5 / CONDITIONAL 0 / REVIEW_REQUIRED 10 / BLOCKED 3.

**Tests:** 25 → **36 offline specs** (4 files: extractor 16, policy 8, resolver 4, service 8). `tsc --noEmit` clean. Verified live: blank body 400, bad verdict 400, malformed id 400, unknown receipt 404, both auth modes accepted.

**Cleanup done:** the two throwaway demo questions were deleted; `6abe12e0997a10320b06553d` is kept on purpose as the unverified "before" artifact (its identical answer text is the one the after-run gates). Catalogue seeds removed — local catalogues left as found. The temporary seed helper script was deleted.

**Second small PR (env typo, PR-ready):** `frontend/src/shared/app.ts` now reads `VITE_IS_DEVELOPMENT`; `.env.example` already had the correct key. (The local gitignored `frontend/.env` still carries a stale duplicate typo key that is inert now — file tools block editing env files, so it was left; the correct key is set there too.)

**Notes for the form:** the four-defect round is the honest Section C story (first live cut vs final), and defect 1 is the strongest Section D story ("understood only after building"): a *unit-tested* extractor can still lose the chemical name on real phrasing, and live DB runs are what surfaced it. `docs/ajraverify-before-after.md` cites every receipt id above.
