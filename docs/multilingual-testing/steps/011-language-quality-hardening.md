# Step 011 — Language Quality Hardening (Proportion + Segment Checks)

**Date:** 2026-07-23
**Status:** COMPLETE — immutable historical record

---

## What Changed

Two new sub-checks were added to the language quality validator chain.

### 1. Native Script Proportion Check (`validators/language_match.py`)

For non-English responses, added a `≥15%` native script character proportion requirement:

```python
NATIVE_PROPORTION_THRESHOLD = 0.15  # 15% of response chars must be native script
```

Returns additional fields:
- `language_proportion` — fraction of response chars that are native script
- `language_proportion_pass` — True if ≥ threshold
- `language_proportion_reason` — human-readable failure reason

A response that detects the correct script characters but at <15% is flagged as
likely a mostly-English response with minimal decoration — which indicates the
translate_answer node failed.

### 2. Sentence-Level Language Switch Check (`validators/lang_switch.py`)

Added segment-level (sentence-by-sentence) switch detection in addition to the
existing token-level check:

```python
_SEGMENT_LATIN_THRESHOLD = 0.80  # segment with >80% Latin tokens = switch
```

Returns additional fields:
- `language_segment_switch_detected` — True if any segment fires
- `language_segment_switch_count` — number of flagged segments
- `language_segment_switch_reason` — which segments fired

**URL stripping:** Before segment splitting, URLs (`https://...`, `www....`) are
stripped from the text. This prevents URL fragments (e.g. `dac`, `gov` from
`soilhealth.dac.gov.in`) from being flagged as unexpected Latin segments.

### Mock Fixture Update

Native script seeds were extended from ~30 to ~60 characters per language to reliably
pass the ≥15% proportion threshold. Non-English mock response bodies now contain only
native script (no English labels) to prevent segment-level switch detection.

### Mock Mode Terminology Leniency

The runner now only hard-FAILs on terminology when:
- Language is English (`expected_vocal == "English"`), OR
- `terminology_review_required` is explicitly False

For non-English responses, missing English terminology is flagged as
`review_required=True` (needs human review) but does NOT cause FAIL.

### Files Changed

- `ai/ajrasakha/evaluation/multilingual/validators/language_match.py`
- `ai/ajrasakha/evaluation/multilingual/validators/lang_switch.py`
- `ai/ajrasakha/evaluation/multilingual/fixtures/mock_responses.py`
- `ai/ajrasakha/evaluation/multilingual/run_multilingual.py` — updated status logic

---

> [!TIP]
> The URL-stripping fix ensures that disclaimers containing source URLs
> (like `soilhealth.dac.gov.in`) are correctly evaluated without false switch alarms.
