# Step 014 — Domain × Language Matrix Reporter

**Phase:** Phase 2
**Status:** COMPLETE — immutable historical record

---

## What Changed

Created `reporters/domain_matrix.py` — a 5 domain_group × 6 language count matrix
distinct from the existing 30-scenario × 6-language matrix in `reporters/matrix.py`.

### Output

For each `(domain_group, language_code)` cell:

| Column | Meaning |
|--------|---------|
| `total` | Total cases run |
| `PASS` | Cases that passed |
| `FAIL` | Cases that failed |
| `ERROR` | Cases with runtime errors |
| `BLOCKED` | Cases blocked by missing config |
| `SKIPPED` | Cases skipped |

### New CLI Output

```
Language Quality Matrix written to: multilingual_reports/multilingual_matrix_mock_....csv
Domain×Language Matrix written to:  multilingual_reports/multilingual_domain_matrix_mock_....csv
```

### Mock Mode Label

The runner now prints a clear label for mock mode:

```
[FIXTURE/CONTRACT VERIFICATION] Results above are from deterministic
mock fixtures, not live agent responses. They verify that the test
framework contracts are correct. Live language quality is NOT evidenced.
```

This prevents confusion between mock 100% pass rate and real-world quality.

### Files Created / Modified

- `ai/ajrasakha/evaluation/multilingual/reporters/domain_matrix.py` — new
- `ai/ajrasakha/evaluation/multilingual/run_multilingual.py` — domain matrix call + mock label

---

> [!NOTE]
> The domain×language matrix is the primary tool for identifying which domain–language
> combinations are most problematic in live mode. It should be the first thing
> reviewed after a live test run.
