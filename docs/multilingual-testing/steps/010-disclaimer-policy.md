# Step 010 — Disclaimer Policy (required / forbidden / optional)

**Phase:** Phase 2
**Status:** COMPLETE — immutable historical record

---

## What Changed

Upgraded `validators/disclaimer_check.py` to support three disclaimer modes:

### Modes

| Mode | 2hr disclaimer | Testing disclaimer | Use case |
|------|---------------|-------------------|---------|
| `required` | ✅ Must be present | ✅ Must be present | GDB-backed advisory queries (pest, soil, schemes) |
| `forbidden` | ❌ Must NOT be present | Optional | Dynamic data queries (weather, market prices) |
| `optional` | ❌ Not checked | Optional | Greeting / out-of-domain / non-agri queries |

### Forbidden Violation Detection

```python
result["two_hr_disclaimer_forbidden_violated"] = True
result["disclaimer_pass"] = False
result["disclaimer_reason"] = "2-hour disclaimer FORBIDDEN for this scenario type..."
```

### Mock Fixture Alignment

`fixtures/mock_responses.py` was updated so that:
- `forbidden` mode responses contain **no** 2hr disclaimer
- `required` mode responses contain **both** disclaimers
- `optional` mode responses contain the testing disclaimer only

### New Tests (Step 015)

- `test_forbidden_mode_passes_without_2hr_disclaimer`
- `test_forbidden_mode_fails_if_2hr_disclaimer_present`
- `test_required_mode_both_disclaimers_passes`
- `test_required_mode_missing_2hr_disclaimer_fails`

### Files Changed

- `ai/ajrasakha/evaluation/multilingual/validators/disclaimer_check.py`
- `ai/ajrasakha/evaluation/multilingual/fixtures/mock_responses.py`
- `ai/ajrasakha/evaluation/multilingual/case_schema.py` — `disclaimer_mode` field added

---

> [!IMPORTANT]
> Weather and market scenarios must NEVER include the 2-hour disclaimer.
> Including it in a weather response would create a false expectation for the user.
