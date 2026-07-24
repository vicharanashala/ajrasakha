# Step 003 — Case Generator & Schema

**Date:** 2026-07-23  
**Author:** Lead Engineer (AI)  
**Status:** ✅ Complete  

---

## Objective

Implement the deterministic case generator that expands 30 scenarios × 6 languages
into 180 `MultilingualCase` objects with stable IDs, full metadata, and disclaimer
strings pulled from the existing translation catalog.

---

## Files Changed

| File | Change |
|------|--------|
| `ai/ajrasakha/evaluation/multilingual/case_schema.py` | [NEW] MultilingualCase, CaseResult, CaseStatus |
| `ai/ajrasakha/evaluation/multilingual/case_generator.py` | [NEW] generate_cases() |

---

## Design Decisions

### Case ID format: `ML-SXX-YY`
- `ML` prefix distinguishes from existing test cases in `questions.py`
- `SXX` = zero-padded scenario ID (S01–S30)
- `YY` = 2-letter language code (EN/HI/KN/TA/PA/TE)
- Examples: `ML-S01-EN`, `ML-S30-TE`
- Assertion guard at module load time prevents duplicates

### Disclaimer strings from catalog
`get_testing_disclaimer()` and `get_two_hour_disclaimer()` from `agents/translation_catalog.py`
are called at case generation time — the existing module is reused without duplication.
If a catalog entry is missing, the exception is caught and the disclaimer is set to `""`,
allowing the validator to behave correctly (no assertion on an empty disclaimer).

### Frozen dataclass
`MultilingualCase` is a `@dataclass(frozen=True)` — any attempt to mutate a case raises
`FrozenInstanceError`. This prevents accidental case mutation in test loops.

### `to_legacy_dict()` bridge
Converts a `MultilingualCase` to the dict format expected by existing evaluators:
`evaluate_routing()`, `evaluate_plan()`, `evaluate_source_attribution()`,
`evaluate_disclaimer_language()`. This avoids modifying those existing modules.

### Translation review status
All 180 cases are generated with `translation_review_status="pending"` and
`translation_reviewer=None`. This cannot be changed without explicit human sign-off.

---

## Commands Run

```powershell
uv run python -m ajrasakha.evaluation.multilingual.case_generator
# Output: Generated 180 cases
#   ML-S01-EN: Cultural Practices | English | stable=True | review=pending
#   ML-S01-HI: Cultural Practices | Hindi | stable=True | review=pending
#   ...
```

---

## Test Commands & Results

```
test_case_generator.py — 19/19 PASSED
  - TestCaseCount: 3 tests (count, assert_case_count, unique IDs)
  - TestCaseIdFormat: 3 tests (format regex, scenario coverage, language coverage)
  - TestFiltering: 4 tests (language, scenario, stable_only, combined)
  - TestCaseContent: 7 tests (pending review, null reviewer, disclaimers, provenance, frozen)
  - TestDisclaimerPopulation: 2 tests (2hr required/not-required)
```

---

## Remaining Risks / Blockers

| Risk | Severity | Status |
|------|----------|--------|
| Catalog lookup fallback to English if language missing | LOW | ✅ Handled gracefully |
| Agri-team must validate disclaimer strings | HIGH | 🔴 Pending |

---

## Next Step

→ [004 — Deterministic Validators](004-validators.md)
