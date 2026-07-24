# Step 012 — DeepEval Opt-In Evaluator

**Date:** 2026-07-23
**Status:** COMPLETE — immutable historical record

---

## What Changed

Created `validators/deepeval_multilingual.py` — an opt-in DeepEval evaluation wrapper
that is always skipped in CI and never makes API calls without explicit configuration.

### Activation Requirements

Both must be present:
1. `DEEPEVAL_MULTILINGUAL=1` environment variable
2. At least one model credential (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`)

### Status Values

| Status | Meaning |
|--------|---------|
| `SKIPPED` | `DEEPEVAL_MULTILINGUAL` env var not set |
| `BLOCKED` | Flag is set but no model credentials |
| `BLOCKED` | Empty response text — cannot evaluate |
| `PASS` | Both AnswerRelevancy and Faithfulness metrics passed |
| `FAIL` | One or more metrics failed |
| `ERROR` | Exception raised by deepeval library |

### CLI Integration

```bash
python -m ajrasakha.evaluation.multilingual.run_multilingual --mode live --deepeval
```

Without `--deepeval` flag, `deepeval_status = "SKIPPED"` is written to results but
does not affect the overall case status.

### Wraps Existing Evaluator

Calls `ajrasakha.evaluation.deepeval_metrics.evaluate_answer_with_deepeval()` without
modification — preserves the existing DeepEval integration contract.

### Files Created / Modified

- `ai/ajrasakha/evaluation/multilingual/validators/deepeval_multilingual.py` — new
- `ai/ajrasakha/evaluation/multilingual/run_multilingual.py` — `--deepeval` flag + wiring
- `ai/ajrasakha/evaluation/multilingual/tests/test_deepeval_multilingual.py` — mocked unit tests

---

> [!WARNING]
> DeepEval calls cost money. Never enable DEEPEVAL_MULTILINGUAL in a CI environment
> without explicit cost controls and a test run size limit.
