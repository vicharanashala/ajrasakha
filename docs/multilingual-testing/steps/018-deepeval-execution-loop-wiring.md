# Step 018 — DeepEval Execution Loop Wiring & Translation Sentinel

**Phase:** Phase 3 — Structural Hardening
**Status:** COMPLETE — immutable historical record

---

## Objective

Close two final architectural gaps identified in a post-completion audit:

1. `validators/deepeval_multilingual.py` existed but was never imported or
   called in the main execution loop — meaning DeepEval scores were never
   actually produced regardless of environment configuration.
2. `case_generator.py` silently fell back to English queries when an Indic
   translation was absent from the data artifact, causing English responses to
   be evaluated under Indic language labels and inflating quality matrix
   pass rates.

---

## Changes Made

### 1. DeepEval Wired into `_run_single_case`

`evaluate_deepeval()` is now imported from
`validators/deepeval_multilingual.py` in `run_multilingual.py` and called as
Step 11 of the `_run_single_case` evaluation pipeline:

```python
deepeval = evaluate_deepeval(
    query=case.query,
    response_text=result.response_text,
)
result.deepeval_status = deepeval.get("deepeval_status", "SKIPPED")
result.deepeval_answer_relevancy = deepeval.get("deepeval_answer_relevancy")
result.deepeval_faithfulness = deepeval.get("deepeval_faithfulness")
result.deepeval_reason = deepeval.get("deepeval_reason", "")
```

The function self-guards: it returns `SKIPPED` when `DEEPEVAL_MULTILINGUAL`
is absent, and `BLOCKED` when model credentials are missing. Neither outcome
causes the containing case to fail. Results are written as dedicated columns
in the CSV output.

### 2. Translation Sentinel — `SKIPPED_MISSING_TRANSLATION`

`CaseStatus` gained a new terminal value: `SKIPPED_MISSING_TRANSLATION`.

`case_generator.py` now assigns:
- `query = "MISSING_TRANSLATION"` (sentinel string)
- `query_translation_source = "missing_translation"`

when a non-English language slot is absent or empty in the data artifact.

`_run_single_case` detects the sentinel early and returns
`CaseStatus.SKIPPED_MISSING_TRANSLATION` before making any network call.

`domain_matrix.py` excludes `SKIPPED_MISSING_TRANSLATION` from the `total`
denominator, preserving mathematical accuracy of the Language Quality Matrix.

### 3. DeepEval Fields Added to `CaseResult`

Four new fields on `CaseResult` (all defaulting to safe values):

| Field | Default | Purpose |
|-------|---------|---------|
| `deepeval_status` | `"SKIPPED"` | Outcome of the LLM judge step |
| `deepeval_answer_relevancy` | `None` | AnswerRelevancy metric score |
| `deepeval_faithfulness` | `None` | Faithfulness metric score |
| `deepeval_reason` | `""` | Human-readable explanation |

All four are included in `CaseResult.to_row()` so they appear in every CSV
export regardless of whether DeepEval was active.

---

## Files Modified

- `ai/ajrasakha/evaluation/multilingual/run_multilingual.py` — DeepEval import + execution loop wiring
- `ai/ajrasakha/evaluation/multilingual/case_schema.py` — `SKIPPED_MISSING_TRANSLATION` enum value; DeepEval fields on `CaseResult`
- `ai/ajrasakha/evaluation/multilingual/case_generator.py` — translation sentinel replacing `en_fallback`
- `ai/ajrasakha/evaluation/multilingual/reporters/domain_matrix.py` — sentinel excluded from denominator

---

## Verification

```bash
uv run pytest ajrasakha/evaluation/multilingual/tests/ -v
```

Result: **105 tests passed, 0 failed, 0 regressions introduced.**
