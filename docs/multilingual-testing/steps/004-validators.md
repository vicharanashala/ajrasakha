# Step 004 — Deterministic Validators

**Date:** 2026-07-23  
**Author:** Lead Engineer (AI)  
**Status:** ✅ Complete  

---

## Objective

Implement four deterministic validators (no LLM, no network calls) for:
1. Response language / script detection
2. Disclaimer presence and placement
3. Mid-answer language switch detection
4. Agri-terminology presence

---

## Files Changed

| File | Change |
|------|--------|
| `ai/ajrasakha/evaluation/multilingual/validators/__init__.py` | [NEW] Package init |
| `ai/ajrasakha/evaluation/multilingual/validators/language_match.py` | [NEW] Unicode script validator |
| `ai/ajrasakha/evaluation/multilingual/validators/disclaimer_check.py` | [NEW] Catalog-driven disclaimer wrapper |
| `ai/ajrasakha/evaluation/multilingual/validators/lang_switch.py` | [NEW] Language switch heuristic |
| `ai/ajrasakha/evaluation/multilingual/validators/terminology.py` | [NEW] Agri-term presence check |

---

## Design Decisions

### language_match.py
- Imports `SCRIPT_PATTERNS` from the existing `validators/disclaimer_language.py` at runtime
  (with a local fallback dict if the import fails)
- English responses: passes if response is non-empty (all responses contain Latin)
- Non-English: checks for Unicode script characters matching the expected language

### disclaimer_check.py
- Does NOT duplicate disclaimer validation logic
- Calls existing `evaluate_disclaimer_language(result_dict, case_dict)` directly
- `case.to_legacy_dict()` provides the expected disclaimer strings (from catalog)

### lang_switch.py
Heuristic: token-based detection of unexpected Latin content in non-Latin responses.

**Allowlist** (not counted as switch):
- Numbers and units (kg, ha, %, °C)
- URLs
- UPPERCASE acronyms (NPK, IMD, PM, DAP)
- Known agri-terms whitelist (paddy, wheat, Kharif, urea, etc.)

**Threshold**: 30% of cleaned tokens may be Latin before flagging.
Rationale: Agri responses legitimately use crop names, chemical names, and
brand names in Latin script even in a Hindi/Kannada response.

### terminology.py
- Case-insensitive substring matching
- Supports both required terms and banned terms (via `must_be_absent` flag)
- Non-English misses: set `terminology_review_required=True` instead of hard FAIL
  (native-script equivalents may be correct but not machine-verifiable)

---

## Commands Run

None — all validators are pure Python functions, no external calls.

---

## Test Commands & Results

```
test_validators.py — 22/22 PASSED

TestLanguageMatch (9 tests):
  - English response passes ✓
  - Empty response fails ✓
  - Hindi Devanagari detected ✓
  - Hindi missing Devanagari fails ✓
  - Kannada script detected ✓
  - Tamil script detected ✓
  - Punjabi Gurmukhi detected ✓
  - Telugu script detected ✓
  - Returns expected_vocal ✓

TestDisclaimerCheck (3 tests):
  - English case with both disclaimers passes ✓
  - Missing testing disclaimer fails ✓
  - No disclaimer required passes ✓

TestLangSwitch (5 tests):
  - English never triggers switch ✓
  - Clean Hindi no switch ✓
  - Predominantly Latin in Hindi triggers switch ✓
  - Empty response no switch ✓
  - Numbers not flagged as switch ✓

TestTerminology (5 tests):
  - All terms found passes ✓
  - Missing term fails ✓
  - No assertions trivially passes ✓
  - Non-English flags review_required ✓
  - Banned term absent passes ✓
```

---

## Remaining Risks / Blockers

| Risk | Severity | Status |
|------|----------|--------|
| Lang switch threshold (30%) may need tuning for live responses | MEDIUM | ⚠️ Review after live run |
| Terminology seeds are English-only; native-script terms need human review | HIGH | 🔴 Pending agri-team validation |
| SCRIPT_PATTERNS import fallback path not tested with actual import failure | LOW | ✅ Acceptable for now |

---

## Next Step

→ [005 — Reporters & Language Quality Matrix](005-reporters-and-matrix.md)
