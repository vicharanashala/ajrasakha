# Answer Quality Evaluation

## Overview

Four signals evaluate agent responses on every evaluated case. Three come from
DeepEval (LLM-judged); the fourth — `gdb_match_score` — is a deterministic
text-overlap metric defined in this repo. All four are judge-agnostic via
`get_judge()` and share the same flat return shape.

| Metric | What it measures | retrieval_context required? |
|--------|------------------|------------------------------|
| **AnswerRelevancyMetric** | Does the answer directly address the user's question? (penalises vague, tangential, or incomplete responses) | No — always runs |
| **FaithfulnessMetric** | Are the claims in the answer consistent with the retrieved documents? (catches hallucinated facts) | Yes (note: structurally circular against GDB Q&A — see §4 "Why the gating") |
| **ContextualRelevancyMetric** | Is the retrieved context actually relevant to the query? (measures retrieval quality) | Yes |
| **gdb_match_score** (custom) | Direct lexical/semantic overlap between agent answer and canonical ground-truth answer. Deterministic, no LLM. | No — runs whenever `expected_output` is present |

All four share the `evaluate_response_quality()` entry point and are gated
by the same `enabled` flag. The return dict has the same keys in every state
(disabled / answer_missing / scored); CSV column order is stable.

---

## Judge backends (`EVAL_JUDGE`)

| Mode | When to use |
|------|-------------|
| `mock` (default) | Development, CI, fast iteration. Fixed passing score 1.0, instant, no network. |
| `ollama` | Local evaluation with real local model. Zero API cost but CPU-bound (~5 min/case). |
| `anthropic` | Production evaluation. Requires `ANTHROPIC_API_KEY`. Highest quality scores. |

```bash
# Example: mock mode (fast)
cd ai && EVAL_JUDGE=mock python -m ajrasakha.evaluation.run_ground_truth

# Example: single fixture, ollama
cd ai && CASE_FILTER=gdb_tomato_blight_01 EVAL_JUDGE=ollama python -m tests.harnesses.test_deepeval_isolated
```

---

## Activation status

| Metric | Status | When it runs |
|--------|--------|--------------|
| AnswerRelevancyMetric | **LIVE** | Every case (only needs input + actual_output) |
| FaithfulnessMetric | **GATED** | `retrieval_context` populated (auto-populated from GDB ToolMessage via `retrieval_context_extractor`) |
| ContextualRelevancyMetric | **GATED** | `retrieval_context` populated (same gate) |
| gdb_match_score | **GATED** | `expected_output` present in result dict (only present for ground-truth fixture runs, not live agent runs) |

### Why the gating?

- **Retrieval-context gating (Faithfulness + ContextualRelevancy):** Running
  them against `[]` produces misleading scores — the judge finds "no support"
  for claims it can't verify, creating false negatives. The
  `retrieval_context_extractor` module now extracts the GDB answer text from
  the SSE `values` event and populates `result["context"]`, so these metrics
  auto-activate on live runs.
- **Expected-output gating (gdb_match_score):** A rephrased-but-correct
  answer can score LOW on gdb_match_score and HIGH on AnswerRelevancy —
  that's expected. The metric only fires when there's a canonical answer to
  compare against. Live agent runs omit `expected_output`; the metric returns
  `method="not_applicable"` so the column is present but empty.

### Faithfulness vs GDB Q&A — known structural limitation

GDB stores curated expert answers and citation metadata (URLs, names). It does
NOT store the raw source documents (ICAR bulletins, KAU Package of Practices,
etc.). Feeding the GDB answer back as `retrieval_context` makes Faithfulness
circular: agent answers from GDB → Faithfulness checks against same GDB text
→ ~1.0 trivially. The metric remains useful as a check on raw-data tool
responses (weather, market, soil MCP tools) where tool output IS the canonical
source.

---

## Bugs fixed in `deepeval_metrics.py`

Three corrections to make the module compatible with installed DeepEval v4.0.7:

| Bug | Was | Now |
|-----|-----|-----|
| Wrong model class name | `from deepeval.models import ClaudeModel` | `from deepeval.models import AnthropicModel` |
| Wrong attribute name | `metric.passed` | `metric.success` (v4.0.7 uses this) |
| Wrong parameter name | `context=` for retrieval docs | `retrieval_context=` (matches `LLMTestCase` field name) |

---

## Per-domain quality reports

`domain_report.build_domain_report(results)` slices a list of eval_result
dicts by `metadata.domain` and produces:

- Per-domain case count + AnswerRelevancy mean + pass rate
- Per-domain Faithfulness + ContextualRelevancy skip counts
- Per-domain gdb_match_score mean (only on assessed cases)
- Per-domain agricultural_correctness mean + per-facet (crop, treatment,
  regional) pass rates, with **assessed counts** so you can see what was
  actually measured vs what's vacuously scored 1.0
- A markdown rendering (`render_markdown(report)`) with 3 sections
  (rollup table, facet breakdown, totals) suitable for PR descriptions
  or dashboard JSON

Cases without a domain key are bucketed as `unspecified` so the report
is never empty.

The runner writes a markdown file via `--domain-report-md <path>`.
For the 6-domain baseline covering all PS3 brief domains (gdb, weather, market, soil, schemes, greetings), run the pipeline against `gdb_ground_truth_sample_6domains.json`.

## Integration with the stable test suite

The runner's `--csv-out <path>` flag emits a per-case CSV that the stable
test suite (`tests/run_stable_suite.py`) consumes as **Layer 4 — Answer
Quality**. The suite already runs 3 layers (API contracts, MCP connectivity,
LangGraph scenarios); Layer 4 is the 4th and runs the runner against the
6-domain fixture. The CSV-reader in `run_stable_suite.read_report_rows()`
uses `answerrelevancymetric_passed` as the pass criterion for Layer 4
(every other metric is either context-gated and skips, or is a custom
non-judge metric with a different pass semantics). Layers 1-3 still use
the legacy `passed` column. See `tests/test_stable_suite_layer4.py` for
the 6 tests that lock this integration in.

## Running the harness

```bash
# Ground-truth runner (synthetic fixtures; circular smoke-run by design)
cd ai && EVAL_JUDGE=mock python -m ajrasakha.evaluation.run_ground_truth
cd ai && EVAL_JUDGE=mock python -m ajrasakha.evaluation.run_ground_truth tests/fixtures/gdb_ground_truth_sample_multidomain.json

# Discrimination test (proves gdb_match_score actually discriminates)
cd ai && EVAL_JUDGE=mock python tests/test_gdb_match_score_discrimination.py

# Full test suite
cd ai && EVAL_JUDGE=mock python -m pytest tests/test_answer_eval.py tests/test_gdb_match_score.py tests/test_gdb_match_score_discrimination.py tests/test_storage_sqlite.py tests/test_retrieval_context_extractor.py tests/test_gdb_fixtures.py -v
```

---

## Files

```
ai/ajrasakha/evaluation/
├── judge.py                          # get_judge() factory + MockJudge
├── answer_eval.py                    # evaluate_response_quality() — main entry
├── deepeval_metrics.py               # DeepEval metric wrappers
├── gdb_match_score.py                # Custom text-similarity metric (seqmatch + jaccard)
├── retrieval_context_extractor.py    # Parses GDB answer from SSE state snapshot
├── gdb_fixtures.py                   # Loader for gdb_ground_truth*.json fixture files
├── run_ground_truth.py               # CLI runner for ground-truth fixture evaluation
├── summary.py                        # build_summary() — aggregates per-run results
├── domain_report.py                  # build_domain_report() + render_markdown()
├── storage.py                        # Postgres/sqlite persistence
├── schema.sql                        # Production DDL for eval_results table
└── README.md                         # This file

ai/tests/
├── harnesses/
│   └── test_deepeval_isolated.py     # Standalone metric development harness
├── run_stable_suite.py               # 4-layer stable test suite entry point
├── test_answer_eval.py               # evaluate_response_quality() + summary tests
├── test_gdb_fixtures.py              # gdb_fixtures loader tests
├── test_gdb_match_score.py           # Custom metric unit tests
├── test_gdb_match_score_discrimination.py  # Proves metric discriminates correct vs wrong
├── test_storage_sqlite.py            # storage.py round-trip tests
├── test_retrieval_context_extractor.py # SSE extraction tests (11 cases)
├── test_domain_report.py             # Domain report build + render tests
├── test_agricultural_correctness.py  # Agri correctness facet tests
├── test_stable_suite_layer4.py       # Layer 4 CSV integration tests
└── fixtures/
    ├── sample_eval_cases.json              # 3 PR1-era synthetic cases
    ├── gdb_ground_truth_sample.json        # 3 GDB-domain synthetic cases
    ├── gdb_ground_truth_sample_6domains.json # 12 cases (2 per PS3 domain)
    ├── gdb_ground_truth_sample_greetings_schemes.json  # greetings + schemes
    ├── gdb_ground_truth_sample_multidomain.json # 6 mixed-domain cases
    └── gdb_ground_truth_discrimination.json # 3 cases with deliberately wrong answers
```

---

## Future work

These items are out of scope for this PR and require separate work:

1. **Real Postgres round-trip** — `storage.py` is code-complete and logic-validated against sqlite (see `test_storage_sqlite.py`). Live psycopg2 round-trip against `ai-postgres` requires the Docker daemon to start (currently unreachable in this environment). Once Docker is back, apply `ai/ajrasakha/evaluation/schema.sql` and run `storage.save_eval_results()` end-to-end.

2. **Real GDB export** — All fixtures are synthetic (`synthetic: true`). Real GDB export requires MongoDB access to the `questions` + `answers` collections joined on `ObjectId`. The fixture loader is ready to consume a real export as soon as it lands; mark `synthetic: false` to distinguish from placeholders.

3. **Live Anthropic judge verification** — `judge.py`'s anthropic branch is written and uses `CLAUDE_MODEL` from `agents/config.py`. The mock backend is exercised end-to-end by all unit tests. One `EVAL_JUDGE=anthropic` run with a real `ANTHROPIC_API_KEY` would close this gap (~5 minutes when a real key is available).

4. **Live `/runs/stream` round-trip** — `retrieval_context_extractor` is unit-tested against 11 synthetic SSE payload fixtures covering every shape the real endpoint might emit. End-to-end verification (capture a real `last_values_payload` from a running AI service) requires the AI service to be live.

5. **GDB Match Score — semantic upgrade** — Current methods (seqmatch, jaccard) are character/token similarity. Adding embedding cosine similarity via sentence-transformers (already declared as a dep, ~1.5GB torch) would give a semantic dimension. Currently `method="embedding"` is not exposed; add when a real GDB export is available for validation.

6. **Postgres evaluation storage at scale** — `storage.py` is single-connection-per-call. For high-throughput use, batch inserts in a single transaction and add a connection pool. Out of scope for this PR.

7. **Extended summary fields for live runs** — Once `retrieval_context` is populated by `retrieval_context_extractor` in live runs, add `faithfulness_passed`, `faithfulness_mean_score`, `contextual_relevancy_passed`, and `contextual_relevancy_mean_score` to `build_summary()`. Currently only skip counts are surfaced.