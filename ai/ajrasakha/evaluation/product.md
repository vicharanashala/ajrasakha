# Answer Evaluation Pipeline — what this PR does

This document is written for a mentor reading it cold: what the gap was, what this branch
fixes, and what's genuinely new here.

---

## 1. The problem

The codebase already had a quality-scoring module, `deepeval_metrics.py`, wrapping DeepEval's
`AnswerRelevancyMetric`, `FaithfulnessMetric`, and `ContextualRelevancyMetric`. But it was
never actually wired up: `answer_eval.py`'s `evaluate_response_quality()` was a stub that
returned a hardcoded `"disabled"` result no matter what ran. The evaluation pipeline
(`run.py`) called it, got the stub back every time, and no answer-quality signal ever reached
a report. The plumbing existed; nothing used it.

## 2. What this PR does

- **Fixes the wiring.** `evaluate_response_quality()` in `answer_eval.py` now actually calls
  `evaluate_answer_with_deepeval()` when `enabled=True` (live mode), passing through the
  query, answer, retrieval context, and case metadata (expected crop/domain/region).
- **Adds four new metrics** on top of the three existing DeepEval ones:
  - **GDB Match Score** — a G-Eval metric comparing the bot's answer against an
    expert-validated GDB reference answer for factual/recommendation overlap.
  - **CropCorrectness / TreatmentCorrectness / RegionCorrectness** — three independent
    G-Eval metrics (facet-decomposed per the brief's own wording — see §3), each checking
    one of crop, treatment area, and region separately when the test case specifies it,
    instead of one blended "agricultural accuracy" number.
- **Modular, judge-agnostic scoring.** `_build_judge_model()` resolves a judge in preference
  order `GEMINI_API_KEY → ANTHROPIC_API_KEY → OPENAI_API_KEY → DeepEval default`, so the
  judge backend is swappable via env var and defaults to Gemini's free tier rather than a
  paid key.
- **Seeds real GDB data.** `fixtures/gdb_samples.json` holds actual MongoDB-sourced
  `agriai.answers` samples (via `scripts/fetch_gdb_samples.py`), not synthetic ones — sparse
  (2 samples today) and honestly labeled with `verification_status`
  (`expert_approved` vs `pending_partial_approval`) and `approval_count`, so callers can see
  exactly how vetted each reference actually is instead of treating all fixtures as
  equally authoritative.
- **Per-domain reporting.** `summary.py` averages each of the 7 quality metrics per
  `expected_domain` (`build_domain_quality_breakdown`), skipping non-numeric/disabled scores.

## 3. Design decisions: facet-decomposed agricultural correctness, and MockJudge for offline tests

The brief asks whether the answer got the "correct crop, correct treatment, and correct
region" — three distinct things. A single blended `AgriculturalAccuracy` G-Eval metric would
bundle all three into one score, which hides which fact actually failed — an answer could
score "70% agricultural accuracy" while being completely wrong about the region, with no way
to tell from the number alone.

1. **Facet-decomposed agricultural correctness.** `deepeval_metrics.py` runs three independent
   G-Eval checks — `CropCorrectness`, `TreatmentCorrectness`, `RegionCorrectness` — each
   scored, passed, and reasoned separately, flowing through `summary.py`'s `QUALITY_METRICS`
   and (with zero code changes required, since both are metric-name-agnostic) `report.py`'s
   CSV and `trends_store.py`/`generate_trend_report.py`'s regression detection. A regression
   can now be pinned to one specific facet — see §5 below for a live demonstration. This stays
   G-Eval/judgment-based rather than whole-word/substring string matching, so it tolerates
   wording variation while still discriminating real content differences. **Update
   (post-audit pass, see §7):** `TreatmentCorrectness`'s semantics *did* later turn out to
   need changing — it originally checked `expected_domain` as a stand-in for "treatment" (a
   category-label proxy an answer could satisfy just by naming the domain), which is exactly
   the kind of shortcut worth flagging honestly rather than glossing over. §7 covers the fix:
   it now checks real treatment/dosage content, gated the same way `GDBMatchScore` is.
   `RegionCorrectness` and `CropCorrectness` were untouched — they always checked a real
   single-value fact (the named region/crop), never a label proxy.
2. **`MockJudge` for offline/CI testing.** Added `ajrasakha/evaluation/tests/mock_judge.py`:
   a `DeepEvalBaseLLM` subclass returning schema-shaped Pydantic responses (`Steps`,
   `ReasonScore`, `Statements`, `Claims`, `Truths`, `Verdicts`, `ContextualRelevancyVerdicts`)
   so `AnswerRelevancyMetric`, `FaithfulnessMetric`, `ContextualRelevancyMetric`, and
   `GEval`-based metrics can all run their real `measure()` codepath — real schema
   generation, real prompt construction — with zero network calls. `test_answer_eval.py`'s
   new `TestEvaluateAnswerWithDeepevalUsingMockJudge` class uses it for AnswerRelevancy,
   Faithfulness, ContextualRelevancy, and GDBMatchScore. One deliberate scope limit: MockJudge
   always returns the same fixed passing response regardless of input content, so it *cannot*
   prove one input scores differently than another. The three facet-independence tests
   (`TestAgriculturalFacetsIndependence`) therefore keep their existing per-facet mocking at
   the `_build_geval_metric` boundary — that's the only way to assert "wrong region actually
   scores lower than correct crop" in a fast, deterministic unit test.

`_metric_passed()` falls back to the metric's public `is_successful()` method rather than
reading an internal `.success`/`.passed` attribute directly, avoiding coupling to an internal
attribute name that could change across DeepEval versions — verified against the installed
`deepeval==4.1.2`, where `.passed` is never set.

## 4. What's distinctly new here: quality trends + automatic regression alerts

This branch adds two new modules, on top of the wiring fix above:

- **`trends_store.py`** — an append-only history of per-domain/per-metric average scores,
  one row per run. Originally SQLite-only (`quality_history.db`, stdlib `sqlite3`, zero new
  dependencies); **§7 (FIX 5) added a real Postgres backend** (via `psycopg2`, the one new
  dependency this branch now has) used automatically when `DATABASE_URL` is set, falling
  back to the original SQLite file when it isn't — see §7 for details.
- **`generate_trend_report.py`** — reads that history, compares each run's domain+metric
  score against the immediately preceding run, flags any drop greater than 10% as a
  regression, and renders `quality_trends.html`: a static, self-contained page with a
  regression alert banner and a per-domain/per-metric score table across runs.

Both are wired directly into `run.py`'s existing `main()` — no new CLI flag, no extra step:

```python
log_run(summary["domain_quality_breakdown"], mode=args.mode)
trend_report_path = generate_trend_report()
print(f"Quality trend report: {trend_report_path.resolve()}")
```

Every normal `python -m ajrasakha.evaluation.run --mode live` run appends to the history and
regenerates the HTML report automatically. Nothing else changes about how the pipeline is
invoked — this is the plug-and-play part.

## 5. How to see it — mentor demo walkthrough

1. Run the pipeline once in live mode:
   ```bash
   cd ai && python -m ajrasakha.evaluation.run --mode live
   ```
   This appends one run's scores to `ajrasakha/evaluation/quality_history.db` and writes
   `ajrasakha/evaluation/quality_trends.html`. With only one run logged, the page renders
   the score table with an "No regressions detected" banner (nothing to compare against yet).
2. Run it again:
   ```bash
   cd ai && python -m ajrasakha.evaluation.run --mode live
   ```
3. Open `ai/ajrasakha/evaluation/quality_trends.html` in a browser. If any domain/metric
   dropped more than 10% between the two runs, the page now shows a red regression alert
   banner at the top naming the domain, metric, and the exact score drop — with the
   offending cell highlighted in the table below. This is the live demo moment: two runs,
   one regression, rendered automatically with no extra command.

For a controlled demo (guaranteed regression to show), the fastest path is temporarily
feeding a deliberately wrong `expected_region` (or a mismatched `expected_answer`) into the
second run, so `RegionCorrectness` (or `GDBMatchScore`) drops for that specific facet —
see §6 below for exactly this, run end-to-end with a real judge. `ajrasakha/evaluation/tests/test_trends.py`
also demonstrates the exact regression-detection mechanics without needing live API calls, if
a fully deterministic walkthrough is preferred for the demo slot.

## 6. Proof: facets are real, and the regression pipeline catches one

Two separate proofs, kept honestly distinct — one uses the real judge, the other doesn't:

**a) One real Gemini call per facet, proving genuine content discrimination.** Fed the
production `_build_geval_metric`/`_AGRICULTURAL_FACETS` code a deliberately mismatched
example — a real cauliflower-nursery answer that's correct on crop, names a real treatment,
but states the wrong region (Himachal Pradesh instead of the case's expected Odisha):

| Facet | Real Gemini score | Judge's reason |
|---|---|---|
| CropCorrectness | **1.0** | "correctly identifies and addresses the crop Cauliflower... without omitting the crop or mentioning an incorrect one" |
| TreatmentCorrectness | **0.3** | *(pre-§7 criteria — see caveat below)* credits the named nursery techniques, but penalizes the missing explicit domain naming and the wrong region bleeding into its reasoning |
| RegionCorrectness | **0.0** | "the actual output replaces Odisha with Himachal Pradesh and fails to mention Odisha at all" |

**Caveat added in the post-audit pass (§7):** the `TreatmentCorrectness` row above was captured
against the *old* criteria — "does the answer name the domain label" (in this example,
`"Cultural Practices"`) — which §7 replaced with a real content check. That's exactly why the old
judge reason above penalizes "missing explicit domain naming" instead of evaluating whether the
nursery-care content was actually correct. Kept here unedited as an honest historical record of
what was actually run at the time, not restated as current behavior. `CropCorrectness` and
`RegionCorrectness` rows are unaffected by §7 and still reflect current behavior.

Three genuinely different, real judge-computed scores from one example — not three copies of
the same number. Worth noting honestly: GEval reasons somewhat holistically rather than in a
perfectly sealed box per facet (the treatment reasoning above also references the wrong
region), but the three numeric outputs are still clearly, independently discriminated.
Gemini's free tier caps at 5 requests/minute and a full `evaluate_response_quality()` call
fires ~15+ requests across all 7 metrics, so this proof exercised only the 3 facets in
isolation (6 requests, paced) rather than a full end-to-end run — a practical constraint of
the free tier, not a limitation of the facet logic itself.

**b) Two-run regression demo, seeded with hand-authored synthetic scores.** To show the
regression-detection and HTML-rendering mechanism pins a drop to one specific facet — without
spending more of the rate-limited free-tier quota — `trends_store.log_run()` was called
directly with two hand-authored score sets, clearly labeled `mode="mock-demo"` (same
labeling precedent the pipeline already uses to distinguish `mock` vs `live` runs). **These
two runs are not real Gemini output** — they're deliberately constructed so `RegionCorrectness`
drops sharply (0.90 → 0.20) while `CropCorrectness` (0.95 → 0.94) and `TreatmentCorrectness`
(0.85 → 0.83) stay flat. Result, rendered in `quality_trends.html`:

> ⚠ Quality regressions detected
> **GDB Queries — RegionCorrectness** dropped 0.90 → 0.20 (78% drop) since last run

`CropCorrectness` and `TreatmentCorrectness` for the same domain are not flagged — exactly the
facet-specific regression this pass set out to prove is possible, distinct from a generic
blended "agricultural accuracy dropped" alert. The mechanics are the same ones
`test_trends.py` and `TestAgriculturalFacetsIndependence` in `test_answer_eval.py` already
lock in as unit tests — this is that mechanism working against the real HTML output.

---

## 7. Post-audit pass: six fixes, done incrementally with tests after each

A follow-up audit of this branch found six concrete gaps between what §§1-6 above claimed and
what the code actually did, plus one brief claim ("scores feed into the observability
dashboard") that turned out to be unbuildable here. Each fix below was implemented one at a
time with the full test suite (`ajrasakha/evaluation/tests`, run via `uv run python -m pytest
ajrasakha/evaluation/tests`) passing before moving to the next.

**FIX 1 — Gate GDB Match Score correctly.** Audit finding: `GDBMatchScore` fired for every
domain because `questions.py` backfilled a placeholder string into `expected_answer` for every
case, and that placeholder was always truthy. **Status: already correct in the code at audit
time** — `questions.py`'s `find_reference_answer()` returns `None` (not a placeholder) for any
domain without a real fixture match, and `deepeval_metrics.py`'s `if reference_answer and
str(reference_answer).strip()` gate gives `{"score": None, "passed": False, "reason":
"no_reference_answer"}` otherwise. Locked in by `TestGdbMatchScoreGating` in
`test_answer_eval.py`. No code change was needed; this pass added
`test_questions_domain_coverage.py` as a regression guard for the related domain-labeling work
below.

**FIX 2 — Relabel domains to the brief's exact 6 names.** `questions.py`'s `expected_domain`
values were already the brief's 6 names (Weather, Market, Soil, Schemes, "GDB queries",
Greetings) at the source — no split labels like "Market Prices" vs "Market" remained there.
Two test cases sit outside that set: `"General"` (a non-agriculture control question) and
`"Plant Protection"` (a multi-tool weather+GDB routing test). **Decision (confirmed with the
PR author, not guessed):** these are left as-is, not force-fit into one of the 6. They aren't
mislabeled duplicates of a real domain — they're functional test categories (out-of-scope
detection, multi-tool routing), not domain-specific answer-quality cases, so they're correctly
excluded from `domain_quality_breakdown`. See the comment above `TEST_CASES` in `questions.py`
and `test_questions_domain_coverage.py`'s `NON_DOMAIN_CATEGORIES` for where this is enforced.

*Related finding, left out of scope (confirmed with the PR author):* the **real production
planner** (`agents/domains.py`'s `ALLOWED_DOMAINS`) uses a completely different, 30-name
taxonomy — `"Market Prices"` not `"Market"`, `"Soil Health Card"`/`"Soil Testing"` not
`"Soil"`, `"Government Schemes"` not `"Schemes"`, `"General"` for greetings not `"Greetings"`,
and no `"GDB queries"` domain at all. `plan.py`'s `evaluate_plan()` directly compares
`case["expected_domain"]` against the live planner's `observed_plan["domain"]`, so in a real
`--mode live` run against an actual backend, `plan_pass` would spuriously fail for every
domain except Weather — independent of whether routing was actually correct. This is invisible
in this environment today (no live LangGraph server is reachable at `LIVE_API_URL`, so live
runs fail on connectivity before the domain check ever matters) but would surface immediately
against a real deployment. Reconciling the evaluation suite's coarse 6-domain reporting
vocabulary with the planner's fine-grained routing vocabulary needs its own design decision
(e.g. an alias map, mirroring `agents/domains.py`'s own `normalize_domain`/`_DOMAIN_ALIASES`
pattern) — flagged here as a known pre-existing issue, not fixed in this pass. See the comment
in `plan.py`'s `evaluate_plan()`.

**FIX 3 — Stable coverage across all 6 domains.** All 6 brief domains already had at least one
`stable: True` case at audit time (`weather_question_1`, `market_question_1`,
`soil_question_1`, `scheme_question_1`, `gdb_question_1`, `greeting_question`) — 6 of 15 cases,
one per domain. No code change was needed; `test_questions_domain_coverage.py`'s
`test_every_brief_domain_has_at_least_one_stable_case` now guards against silently losing this
coverage in a future edit.

**FIX 4 — Stop discarding quality scores in the real stable suite.** `ai/tests/run_stable_suite.py`
already carried quality-score columns (`QUALITY_SCORE_COLUMNS`) through
`read_report_rows()`/`write_combined_csv()`/`write_html()` into the combined
`stable_suite_report.csv`/`.html` at audit time — Layer 1/2 rows (no quality data) simply leave
those columns blank rather than omitting them, so every row shares one schema. No code change
was needed; `ai/tests/test_run_stable_suite.py` was added to lock this in (run via `uv run
python -m pytest tests/test_run_stable_suite.py` from `ai/` — this stable-suite tool is a
separate script outside `pyproject.toml`'s `testpaths`, not part of the default `pytest`
discovery). `ai/tests/README.md` was also out of date (still said Layer 3 "validates execution
health, not answer quality" and listed only 3 stable scenarios) — corrected to reflect that
quality scoring runs there and all 6 stable scenarios.

**FIX 5 — Real Postgres score storage (replaces the SQLite-only design).** `trends_store.py`
now has a real Postgres backend (via `psycopg2-binary`, the one new dependency this branch
adds) alongside the original SQLite one, selected the same way `deepeval_metrics.py` selects
its judge model: if `DATABASE_URL` is set (a pooled Neon Postgres connection in this repo's
`ai/.env`), `log_run()`/`fetch_history()` use it; if not, they fall back to the original
`quality_history.db` SQLite file, so offline/local demo runs still need zero setup.
`generate_trend_report.py` reads from whichever backend is active without knowing which one it
is. Schema (identical shape on both backends) is a single `quality_runs` table:
`run_timestamp, mode, domain, metric, avg_score` — one row per (run, domain, metric). A
`force_sqlite=True` override exists on all three functions specifically so
`demo_project3.py`'s hand-seeded, clearly-labeled `mode="mock-demo"` proof (§6b above) stays
isolated in its own file and can never land in the real Postgres baseline history, regardless
of whether `DATABASE_URL` happens to be configured. Verified against the real Neon database
(not mocked) via a zero-row connectivity smoke test before any real scores were written to it;
`ajrasakha/evaluation/tests/test_trends_postgres_backend.py` covers the dispatch logic itself
with a mocked `psycopg2.connect` (no network in unit tests), and
`ajrasakha/evaluation/tests/test_trends.py` forces the SQLite path via an autouse fixture so a
real `DATABASE_URL` in the environment never diverts those pre-existing tests.

*On the observability dashboard (explicitly not built, by design):* the brief also states these
scores "feed into the observability dashboard." No such cross-project dashboard exists anywhere
in this repo — confirmed by the audit, not assumed. This pass does not build one, and does not
claim to feed into one that doesn't exist. What it does instead: the Postgres `quality_runs`
schema above is a stable, generic, self-describing format (plain run/domain/metric/score rows,
no evaluation-suite-specific coupling) that's ready to be queried by that dashboard once it
exists elsewhere in the org's infrastructure. Treat "feeds the observability dashboard" as a
brief assumption that hasn't landed anywhere in this codebase yet, not a shortcoming of this
PR — there is nothing in this repo for it to feed into.

**FIX 6 — Real TreatmentCorrectness (not a domain-label proxy).** Audit finding, confirmed by
reading the code: `TreatmentCorrectness` was scored via `_AGRICULTURAL_FACETS`'s
`("TreatmentCorrectness", "expected_domain", "topic/treatment area")` entry — meaning the
"expected treatment" it judged against was literally the case's domain label (e.g. `"Soil"`),
not any real treatment/dosage/recommendation content. An answer could score well just by
naming the domain, regardless of whether the actual advice was right. This is the exact
mechanism visible in §6a's captured proof above (now annotated there as a historical record of
the old criteria, not current behavior).

Fixed by making `TreatmentCorrectness` compare real CONTENT, gated the same way `GDBMatchScore`
already is (`deepeval_metrics.py`'s new `_score_against_reference()` helper, shared by both).
The reference content comes from `questions.py`'s new `find_treatment_reference()`, which was
checked against what real reference data actually exists in this repo before writing any of
it (confirmed by direct investigation, not assumed):

- `soil_health_tool.py`'s `get_fertilizer_dosage()` calls a **live external government API**
  (`soilhealth4.dac.gov.in`) — there is no embedded N/P/K/OC → dosage table anywhere in this
  repo to check answers against.
- `fixtures/gdb_samples.json` (the real, MongoDB-sourced, expert-validated data from §2 above)
  covers exactly one domain: `"GDB queries"`.
- No domain besides `"GDB queries"` had any real reference data in this repo, full stop.

Given that, `TreatmentCorrectness` now behaves per-domain as follows (decided with the PR
author, not guessed — this exact distinction was requested explicitly):

- **`"GDB queries"`** — scored against the real `gdb_samples.json` fixture content (source
  tag `"real_gdb_fixture"`).
- **`"Soil"`** — no real reference exists (confirmed above), but "treatment" is a coherent,
  applicable concept for this domain (the test case literally asks for a fertiliser dosage
  recommendation). A new fixture,
  `fixtures/representative_treatment_samples.json`, supplies a **hand-authored, clearly
  labeled reference** (`"reference_type": "representative_authored"` in the fixture's
  `_comment` field, in code comments, and here) following standard Punjab Agricultural
  University (PAU) soil-test-based fertiliser-recommendation patterns. This is explicitly
  **not** expert-validated or MongoDB-sourced like `gdb_samples.json` — it exists only to give
  `TreatmentCorrectness` a genuine content check to run, and is not fit for real farmer advice.
- **`"Weather"`, `"Market"`, `"Schemes"`, `"Greetings"`** — `TreatmentCorrectness` returns N/A
  (`reason: "no_reference_treatment"`) for a reason distinct from Soil's: "treatment" is not a
  coherent concept for these domains at all (a weather forecast or scheme-eligibility answer
  has no dosage/recommendation to get right or wrong). This is a **category mismatch**, not a
  data gap — `questions.py`'s `TREATMENT_APPLICABLE_DOMAINS` constant (`{"GDB queries",
  "Soil"}`) encodes exactly this distinction, and `find_treatment_reference()` returns source
  `"not_applicable"` for these vs. `"data_gap"` for a treatment-applicable domain that simply
  has no reference yet (a case that doesn't currently occur, since Soil now has the
  representative fixture, but the distinction is real and tested).

Every case's `treatment_reference_source` (`real_gdb_fixture` / `representative_authored` /
`data_gap` / `not_applicable`) now flows through `answer_eval.py` into the flattened result
dict, so it's visible per row in the CSV report — not just documented statically. Locked in by
`TestTreatmentCorrectnessGating` and `TestFindTreatmentReference` in `test_answer_eval.py`
(including one test against the real on-disk representative fixture, not just a hand-built
one). `CropCorrectness` and `RegionCorrectness` were untouched — they always checked a real
single-value fact (the named crop/region), never a label proxy, so there was nothing to fix
there.

**Final baseline report — PARTIAL as of 2026-07-29, target complete by 2026-07-31 (demo is
2026-08-01).** Regenerated `quality_trends.html`/Postgres history across all 6 domains using
the real, unmocked Gemini judge (no `MockJudge`) — not the `--mode mock` CLI, which never
calls a judge at all, and not `--mode live` through the agent, since no live LangGraph server
is reachable in this environment (confirmed: `LIVE_API_URL`/`localhost:2026` times out).
Instead, each of the 6 `stable: True` cases (one per domain) was scored against a
**hand-authored representative answer** to that case's real query — written by the assistant,
**not live-agent output**, and not claimed to be. Logged to the real Postgres history with
`mode="live-representative-input"`, a label chosen specifically so it can never be confused
with `"live"` (real agent + real judge) or `"mock"` (no judge at all). **This baseline must be
re-run against real live-agent output once backend/server access exists** — representative
input proves the scoring+Postgres pipeline is real and working end to end, it does not prove
anything about the actual agent's answer quality.

Exact numbers (not estimates — counted directly from the run's output): 42 metric slots total
(7 metrics × 6 cases). 13 were correctly skipped as N/A with zero API calls (domains/facets
that don't apply — e.g. `CropCorrectness` for a crop-less Weather query, `TreatmentCorrectness`
for Greetings). The remaining 29 required a real Gemini call: **6 succeeded, 23 were rejected**
with `429 RESOURCE_EXHAUSTED`. The rejection reason, read directly from the API error payload,
is `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, **quota value 20 requests/day** for
`gemini-3.6-flash` — a hard daily cap, not the ~5 requests/minute figure assumed elsewhere in
this repo's docs (`DEMO_CHEAT_SHEET.md`). Only 6 of that 20-request daily allowance were
consumed by this run before hitting 429s, which suggests roughly 14 were already used by other
activity before this run started today — a caveat worth stating plainly: **it isn't guaranteed
a full fresh 20 will be available on the next reset either**, since this quota appears to be
shared with other activity this session doesn't control.

**BASELINE COMPLETE as of 2026-07-31.** Final result, all 6 domains, 29/29 applicable metric
cells scored (7 metrics × 6 domains, minus N/A-gated cells — see §-above for which facets are
N/A per domain and why), all against the real, unmocked judge (Gemini for the first 12 cells,
Groq for the remaining 17 — see the Groq section below for why the backend changed mid-run):

| Domain | AnswerRelevancy | Faithfulness | ContextualRelevancy | GDBMatchScore | CropCorrectness | TreatmentCorrectness | RegionCorrectness |
|---|---|---|---|---|---|---|---|
| Weather | 1.0 | 1.0 | 0.0 | N/A | N/A (crop="all") | N/A (not applicable) | 1.0 |
| Market | 1.0 | 1.0 | 0.0 | N/A | 1.0 | N/A (not applicable) | 1.0 |
| Soil | 1.0 | 1.0 | 0.0 | N/A | 1.0 | 1.0 | 1.0 |
| Schemes | 1.0 | 1.0 | 0.0 | N/A | N/A (crop="all") | N/A (not applicable) | 1.0 |
| GDB queries | 1.0 | 1.0 | 0.0 | 0.0 | 1.0 | 0.0 | 1.0 |
| Greetings | 1.0 | 1.0 | 0.0 | N/A | N/A (no location) | N/A (not applicable) | N/A (no location) |

Two patterns in the numbers are expected artifacts of this being a `live-representative-input`
baseline, not a bug in tonight's run:
- **`ContextualRelevancy=0.0` everywhere it applies.** Every representative-input test case is
  scored with an empty `retrieval_context` (no real live RAG retrieval happened - see the
  `LIVE_API_URL` unreachable note above), so there is genuinely no context to be relevant to.
  This is the correct score for empty context, not a scoring failure - the metric is doing its
  job here, and this cell should look different once this baseline is re-run against real live
  retrieval.
- **`GDBMatchScore=0.0` and `TreatmentCorrectness=0.0` for GDB queries specifically.** This is a
  known, pre-existing gap in `find_reference_answer()`/`questions.py`, not something introduced
  by this run: it matches a reference fixture entry by **domain only** (`expected_domain ==
  "GDB queries"`), not by query similarity, and `gdb_samples.json` only has cauliflower/Odisha
  entries - so the paddy/Punjab `gdb_question_1` case gets scored against a completely unrelated
  reference answer. The 0.0 is real and correctly computed given that mismatched reference; the
  mismatch itself is a fixture-coverage gap worth a follow-up (more GDB reference queries per
  domain, matched by similarity not just domain label), out of scope for this baseline-completion
  task.
| Greetings | *(none yet)* | AnswerRelevancy, Faithfulness, ContextualRelevancy |

**Untracked resync (2026-07-30, before tonight's second retry):** querying the live `quality_runs`
table for this `run_timestamp` directly (not trusting this doc) turned up 5 rows neither this doc
nor either throwaway script run had logged: `GDB queries` gained `Faithfulness`/`ContextualRelevancy`,
and `Schemes` gained `ContextualRelevancy`/`Faithfulness`/`RegionCorrectness` on top of last night's
`AnswerRelevancy` — completing Schemes entirely. Source unconfirmed (someone/something else scored
against this same shared `run_timestamp` outside this doc's tracking) — flagged to the PR author,
not silently absorbed. Table above is now the literal DB state, not a hand-maintained log; anyone
resuming this should re-query `quality_runs` for this `run_timestamp` rather than trust this table
blindly, the same lesson this resync just taught.

**2026-07-30 retry attempt (per-call pacing experiment) — result: still low yield, root cause
narrowed.** Re-ran the "still needed" cells above (regenerated throwaway script, priority order
Schemes → GDB queries → Greetings → Weather → Market → Soil per the 3 zero-coverage domains)
with a 25-second pause inserted before **every individual metric call**, not just between
cases/domains, to test whether 2026-07-29's 429s were a burst/RPM limiter mislabeled as the
daily cap. **Result: 1 successful call (Schemes/AnswerRelevancy=1.0), then an immediate 429 on
the very next call** — even with the full 25s gap. The error payload's `retryDelay` was only
`6.1s`, not "wait until tomorrow" — which argues *against* a genuine same-day exhaustion of a
fresh 20-request allowance and *for* the standing caveat above: this project's `gemini-3.6-flash`
free-tier quota is shared with other activity this session doesn't control, and was apparently
already consumed before tonight's run started. Per-call pacing did not fix it.

**Decision gate (per the PR author, set in advance of this result):** 0 or very-low yield on
tonight's retry means stop waiting on quota resets and switch the judge backend Friday morning
(2026-07-31) instead — no slack left before the 2026-08-01 demo to keep waiting-and-seeing.
Tonight's yield (1 success) meets that bar.

**2026-07-30, second attempt same night — fresh key, different Google account/project
("ajrasakha-2"):** `GEMINI_API_KEY` in `ai/.env` was swapped for a key from a different Google
account, on the theory that a fresh account/project would have an untouched daily quota. Result:
**0 successful calls out of 2 attempted.** Call 1 hit a genuine transient `503 UNAVAILABLE`
("high demand", unrelated to quota). Call 2, 25s later, hit an **immediate `429
RESOURCE_EXHAUSTED`** — same `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, same
`quotaValue: 20`, same model `gemini-3.6-flash`, as both the 2026-07-29 and the first 2026-07-30
attempt. Stopped immediately, nothing logged. **This is the key new finding: a different
account/project hit the identical quota wall within 26 seconds.** That's strong evidence this
isn't a per-project quota that a fresh key/project sidesteps — something broader (account-level,
org-level, or this specific model tier) is the real constraint, which means another fresh key is
unlikely to behave any differently. **This confirms the Friday-morning judge-backend switch is
the right call, not another key swap.** Next action is on the PR author: confirm which backend
to fall back to (`ANTHROPIC_API_KEY` / Claude is already wired as the second option in
`deepeval_metrics.py`'s `_build_judge_model()` fallback chain, so it's the lowest-effort switch,
but this hasn't been confirmed as the choice) and re-run the same "still needed" cells against
it.

**2026-07-31 — one more free option ruled out: per-model quota switch.** Since the 429's
`quotaId` names the model explicitly (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), tried
switching `GEMINI_MODEL_NAME` away from `gemini-flash-latest` (which resolves to the exhausted
`gemini-3.6-flash`) to see if a *different* Gemini model has its own untouched daily allowance.
Confirmed available flash-class models via the live `GET /v1beta/models` list (not guessed), then
tried the two most likely candidates:
- **`gemini-2.0-flash`**: `429`, but `limit: 0` for this account's free tier — not "exhausted,"
  **disabled outright** for this key/account.
- **`gemini-2.5-flash`**: `404 NOT_FOUND` — "no longer available to new users."

Neither is a quota-exhaustion failure like `gemini-3.6-flash`'s; both are hard blocks for a
different reason. Combined with the 2026-07-30 finding that a second Google account hit the
identical `gemini-3.6-flash` quota wall, the only model actually enabled and reachable on this
account's free tier is `gemini-3.6-flash` (20/day), and it's exhausted. **No further
key/model/account combination is worth trying — this confirms the Friday-morning judge-backend
switch (per the standing decision gate) as the only remaining path.** `GEMINI_MODEL_NAME` reverted
to `gemini-flash-latest` in `ai/.env` so the config stays coherent (the one model that's actually
enabled, even though exhausted) rather than left pointed at a disabled/unavailable one.

**2026-07-31 — Groq tried as a free alternative before falling back to Anthropic, and it
worked.** Before committing to the Anthropic switch, tried Groq (`GROQ_API_KEY`, a different
free-tier provider entirely, not another Gemini key/model/account). Two things to resolve first,
both confirmed rather than assumed:
- **Free-tier limits**: read directly from Groq's own response headers on a real call (not from
  docs, which can be stale) - `x-ratelimit-limit-requests: 1000`, `x-ratelimit-limit-tokens:
  12000`, both refilling continuously (reset windows in the tens of seconds / low milliseconds,
  not a hard daily wall like Gemini's). Comfortably enough for the ~15-17 remaining calls.
- **DeepEval integration**: DeepEval has no first-class Groq model (its `GrokModel` is xAI's
  unrelated product). `litellm` (which DeepEval does wrap) wasn't installed, and adding it would
  be a new dependency under time pressure. Instead, confirmed DeepEval's own `GPTModel` - built
  for OpenAI, but it accepts an arbitrary `base_url` - works cleanly against Groq's
  OpenAI-compatible endpoint: `GPTModel(model="llama-3.3-70b-versatile", api_key=GROQ_API_KEY,
  base_url="https://api.groq.com/openai/v1")`. A Groq model name isn't in DeepEval's OpenAI
  capability table, so it falls back to DeepEval's default capability data and takes the plain
  `chat.completions.create()` + manual JSON-schema-parse path - the portable path, not dependent
  on Groq supporting OpenAI's structured-output/JSON-mode endpoints specifically. Verified with a
  real model-list call and a real metric `.measure()` call (not just construction) before trusting
  it with the full batch.

Added `GROQ_API_KEY` to `deepeval_metrics.py`'s `_build_judge_model()` fallback chain -
**purely additive**, inserted between the existing Gemini and Anthropic branches, neither of
which was reordered or removed (`GEMINI_API_KEY -> GROQ_API_KEY -> ANTHROPIC_API_KEY ->
OPENAI_API_KEY -> DeepEval default`). Full suite re-run after the change: still 57/57 passing.
2 real calls tested first (doubling as real Greetings cells, not throwaway pings) - both
succeeded in ~1.2s each, correct scores and reasoning. Continued with the remaining 15 cells
under the same discipline as every prior attempt (same `run_timestamp`, 25s pacing between every
individual metric call, stop immediately on any real error): **15/15 succeeded, zero errors.**
Baseline is now complete - see the table above.

**Operational note on `ai/.env`:** `GEMINI_API_KEY` is currently commented out (not deleted -
value preserved inline) rather than restored, specifically because restoring it would silently
put Gemini back in front of Groq in the priority chain and this baseline (or the next
stable-suite run) would immediately start failing against the exhausted quota again. Leaving it
commented is a deliberate choice to keep Groq as the effective active judge, not an oversight -
flagged here rather than decided silently, since it's a standing config choice affecting every
future run of this pipeline, not just tonight's.

*For whoever resumes this: the completed baseline's `run_timestamp` is
`2026-07-29T11:13:19.460386+00:00`, `mode="live-representative-input"`. This mode label means
exactly what it always has - hand-authored representative answers proving the scoring+Postgres
pipeline end to end, not real live-agent output. **This baseline should still be re-run against
real live-agent output once backend/server access exists** (the standing caveat from the first
partial run above still applies in full).*

## 8. Second real run added (2026-08-08) - genuine multi-run history, not a one-off snapshot

The caveat above ("only one run logged, so 'trends over time' has nothing to compare against")
is now closed with real data, not just a proven mechanism on synthetic data. A second
`live-representative-input` run was logged: same methodology as §7's baseline (real Groq judge,
no `MockJudge`), freshly hand-authored representative answers for the same 6 stable cases (not
copy-pasted from run 1 - run 1's exact answer text was never saved, only its scores), through the
same production `evaluate_response_quality()` path, to the same real Postgres `quality_runs`
table under a brand-new `run_timestamp`.

**Operational note, worth keeping for next time:** the first two attempts at this second run hit
real `RateLimitError`s from Groq on an unpaced/under-paced burst of the ~29 real judge calls a
full run requires (confirmed via an isolated single-case retry that succeeded cleanly - not a
key/judge problem, purely a burst-pacing one). Both partial attempts were deleted from Postgres
before logging anything final, so no partial/duplicate run_timestamps were left behind. The fix
that worked is the same discipline §7 already documents for this exact judge: **25s pacing
between every individual metric call**, not just between cases/domains. With that pacing, the
full run succeeded 29/29, zero errors, in one pass.

**Result: `run_timestamp = 2026-08-08T04:21:26.346612+00:00`, 29/29 applicable cells scored**,
identical coverage shape to the 2026-07-29 baseline (same 6 domains, same N/A-gated cells for the
same reasons). Postgres now holds exactly 2 real runs, 58 rows total, no partial/orphaned
timestamps.

**`quality_trends.html` regenerated - now shows 2 real runs and 2 real, naturally-occurring
regressions** (not staged, not synthetic - distinct from §6b's clearly-labeled `mode="mock-demo"`
proof, which remains untouched and separate):

| Domain | Metric | Run 1 (Jul 29) | Run 2 (Aug 8) | Drop |
|---|---|---|---|---|
| Soil | CropCorrectness | 1.00 | 0.00 | 100% |
| Soil | TreatmentCorrectness | 1.00 | 0.40 | 60% |

Everything else across all 6 domains held flat between the two runs (see the full table in
`quality_trends.html` for every cell, not just the flagged two).

Plausible root cause, stated as a hypothesis (the underlying LLM judge call isn't re-inspectable
after the fact, so this is read from the input/output, not confirmed by re-running with tracing):
`soil_question_1`'s `expected_plan.crop` is `"Paddy"`, but this run's representative answer named
the crop **"Rice"** - agronomically the same crop, but `CropCorrectness`'s G-Eval criteria checks
whether the answer names crop `"Paddy"` specifically, and apparently didn't treat "Rice" as a
synonym match this time. `TreatmentCorrectness` dropping to 0.40 is consistent with this run's
fertilizer-dosage figures diverging somewhat from `representative_treatment_samples.json`'s exact
reference numbers. Both are genuine content differences between two independently-authored
representative answers for the same query, not a pipeline bug - exactly the kind of real
fluctuation the regression mechanism exists to catch, and a small illustration of why
crop-name/synonym consistency between a test case's query text and its `expected_plan.crop`
matters for this metric specifically.

**Standing caveat still applies unchanged:** both runs are `live-representative-input`, not real
live-agent output. Two real runs prove the trends/regression mechanism works on genuine
LLM-judge fluctuation now, not just on hand-seeded synthetic data - it does not yet say anything
about the actual agent's answer quality in production. That still requires backend/server access
to run in real `--mode live`.
