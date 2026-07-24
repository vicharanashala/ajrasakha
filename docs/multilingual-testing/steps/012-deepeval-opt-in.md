# Step 012 — DeepEval Opt-In Evaluator

**Phase:** Phase 2 — Evaluation Hardening
**Status:** COMPLETE — immutable historical record

---

## What Changed

Created `validators/deepeval_multilingual.py` — an opt-in DeepEval evaluation
wrapper. The validator is always `SKIPPED` in CI and never makes API calls
without explicit environment configuration.

In a subsequent hardening pass (Step 018), `evaluate_deepeval()` was imported
and wired directly into the `_run_single_case` execution loop in
`run_multilingual.py` as Step 11 of the evaluation pipeline, making it an
active component of every test run rather than an isolated utility.

### Activation Requirements

Both must be present:
1. `DEEPEVAL_MULTILINGUAL=1` environment variable
2. At least one model credential (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`)

### Status Values

| Status | Meaning |
|--------|---------|
| `SKIPPED` | `DEEPEVAL_MULTILINGUAL` env var not set |
| `BLOCKED` | Flag is set but no model credentials are present |
| `BLOCKED` | Empty response text — cannot evaluate |
| `PASS` | Both AnswerRelevancy and Faithfulness metrics passed |
| `FAIL` | One or more metrics failed |
| `ERROR` | Exception raised by the deepeval library |

### Execution Loop Integration

`evaluate_deepeval()` is called unconditionally inside `_run_single_case` in
`run_multilingual.py`. The function's own internal guard returns `SKIPPED` or
`BLOCKED` when the environment is not configured. Neither outcome causes the
containing test case to fail — DeepEval results are informational and are
written as dedicated columns to the CSV output.

```python
# run_multilingual.py — Step 11 (always executed)
deepeval = evaluate_deepeval(query=case.query, response_text=result.response_text)
result.deepeval_status = deepeval.get("deepeval_status", "SKIPPED")
result.deepeval_answer_relevancy = deepeval.get("deepeval_answer_relevancy")
result.deepeval_faithfulness = deepeval.get("deepeval_faithfulness")
result.deepeval_reason = deepeval.get("deepeval_reason", "")
```

### Wraps Existing Evaluator

Calls `ajrasakha.evaluation.deepeval_metrics.evaluate_answer_with_deepeval()`
without modification — preserves the existing DeepEval integration contract.

### Files Created / Modified

- `ai/ajrasakha/evaluation/multilingual/validators/deepeval_multilingual.py` — new validator
- `ai/ajrasakha/evaluation/multilingual/run_multilingual.py` — execution loop wiring (Step 018)
- `ai/ajrasakha/evaluation/multilingual/case_schema.py` — `deepeval_*` fields added to `CaseResult`
- `ai/ajrasakha/evaluation/multilingual/tests/test_deepeval_multilingual.py` — mocked unit tests

---

> [!WARNING]
> DeepEval calls cost money. Never enable DEEPEVAL_MULTILINGUAL in a CI environment
> without explicit cost controls and a test run size limit.
