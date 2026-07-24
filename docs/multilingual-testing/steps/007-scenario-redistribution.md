# Step 007 — Scenario Redistribution and Domain Integrity Guard

**Date:** 2026-07-23
**Status:** COMPLETE — immutable historical record

---

## What Changed

Rewrote `scenarios.py` to a 5-domain × 6-scenario layout replacing the previous
ad-hoc scenario list. The 30 scenarios are now deterministically distributed with
an automated integrity guard.

### Domain Groups (6 scenarios each)

| Domain | Scenario IDs | Coverage |
|--------|-------------|---------|
| `weather` | S01–S06 | Current conditions, 5-day forecast, advisory, heat, monsoon, no-match |
| `pest` | S07–S12 | Yellow rust, blast, whitefly, BPH, armyworm, no-match |
| `schemes` | S13–S18 | PM-KISAN, soil card, subsidy, crop insurance, non-agri, no-match |
| `soil` | S19–S24 | NPK deficiency, pH, organic carbon, irrigation, soil health, no-match |
| `market` | S25–S30 | Wheat/paddy/tomato/onion/mango price, multi-crop, no-match |

### Integrity Guard

```python
from ajrasakha.evaluation.multilingual.scenarios import assert_domain_distribution
assert_domain_distribution()  # raises AssertionError if distribution is wrong
```

The guard is called at module import time in scenarios.py and in the domain distribution
unit tests.

### Files Changed

- `ai/ajrasakha/evaluation/multilingual/scenarios.py` — complete rewrite to 30-scenario, 5-domain layout
- `ai/ajrasakha/evaluation/multilingual/tests/test_case_generator.py` — added `TestDomainDistribution`

### No-Match Scenarios

Each domain ends with a "no-match" scenario (S06, S12, S18, S24, S30) with `expected_gdb_no_match=True`.
These test that the agent correctly handles out-of-domain queries without hallucinating.

---

> [!NOTE]
> All previous tests that referenced S01 as "paddy cultivation" were updated to
> use S07 (wheat yellow rust) since S01 is now weather_today (forbidden disclaimer mode).
