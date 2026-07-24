# Step 015 — Negative and Boundary Tests

**Date:** 2026-07-23
**Status:** COMPLETE — immutable historical record

---

## What Changed

Created `tests/test_boundary.py` — a comprehensive negative and boundary test suite
with 18 test scenarios across 7 test classes.

### Test Classes

| Class | Coverage |
|-------|---------|
| `TestLanguageMatchBoundary` | Wrong script, empty response, low proportion, sufficient proportion |
| `TestDisclaimerBoundary` | Required mode missing disclaimers, forbidden mode violations |
| `TestLangSwitchBoundary` | Mixed response, clean native, URL-safe, segment-level English paragraph |
| `TestTerminologyBoundary` | Missing EN term (hard fail), non-EN review_required, no-seeds trivial |
| `TestDomainDistributionIntegrity` | Full corpus passes, wrong count raises AssertionError |
| `TestDeepEvalBoundary` | Missing flag (SKIPPED), missing creds (BLOCKED), empty response |
| `TestWhatsAppTransportBoundary` | Missing vars (BLOCKED), configured stub (NotImplementedError) |

### Key Boundary Scenarios

**Language proportion boundary:**
- `mostly_english = "A" * 200 + "क"` → proportion = 0.5%, FAIL

**URL-safe switch detection:**
- Mock response for HI S07 includes `soilhealth.dac.gov.in` in the testing disclaimer
- After URL stripping, `dac` / `gov` fragments no longer fire segment switch → PASS

**Forbidden mode violation:**
```python
result = validate_disclaimer(f"Weather today.\n{two_hr}", weather_case)
assert result["two_hr_disclaimer_forbidden_violated"] is True
assert result["disclaimer_pass"] is False
```

**Domain distribution integrity:**
```python
partial = [s for s in SCENARIOS if s.domain_group == "weather"][:5]
with pytest.raises(AssertionError, match="expected exactly 6"):
    assert_domain_distribution(partial)
```

### Files Created / Modified

- `ai/ajrasakha/evaluation/multilingual/tests/test_boundary.py` — new (108 tests total)
- `ai/ajrasakha/evaluation/multilingual/tests/test_deepeval_multilingual.py` — new
- `ai/ajrasakha/evaluation/multilingual/tests/test_whatsapp_transport.py` — new

### Final Test Count

```
108 passed in 0.25s
```

All 108 tests pass. No live API calls, no credentials required.

---

> [!NOTE]
> The boundary test suite is the most important safeguard against validator regressions.
> Any change to `language_match.py`, `lang_switch.py`, or `disclaimer_check.py`
> must be verified against all tests in `test_boundary.py`.
