# Step 017 — Production Hardening & QA Audit Remediation

**Phase:** Phase 3 — Structural Hardening
**Status:** COMPLETE — immutable historical record

---

## Objective

Close the final quality gaps blocking genuine production-readiness of the
Multilingual Testing Suite: remove all synthetic GDB identifiers, enforce
strict domain distribution math, wire the WhatsApp transport into the CLI,
fix vacuous disclaimer boundary tests, and integrate clean reporting
artifacts for the `run_stable_suite.py` Layer 4 pipeline.

---

## Gap Closures

### 1. GDB Verification — No Synthetic IDs
Removed all `FAKE_ID_*` placeholder values from `scenarios.py`. All scenarios
now carry `expected_gdb_id=None`, which causes `gdb_verification.py` to return
`BLOCKED` rather than a false `PASS`. Real fingerprints must be populated from
live trace output when `chosen_question_id` is exposed by the trace
infrastructure.

### 2. Domain Distribution — Enforced at Module Load
`scenarios.py` calls `assert_domain_distribution()` at module load, raising
`AssertionError` if any of the 5 domain groups does not contain exactly 6
scenarios. This guard fires before the test runner reaches any test case,
preventing silent domain coverage drift.

### 3. WhatsApp Transport — Integrated into CLI
The WhatsApp transport (`transports/whatsapp_transport.py`) is wired into the
`run_multilingual.py` CLI via the `--transport whatsapp` flag. Without
required environment variables, the transport returns `BLOCKED` with an
explicit list of missing variables rather than silently defaulting.

### 4. Disclaimer Strictness — Boundary Tests Corrected
Overhauled `tests/test_boundary.py` so disclaimer boundary cases inject the
actual expected disclaimer strings from the translation catalog into mock
responses. Tests now assert real presence/absence logic rather than trivially
passing with empty responses.

### 5. Scaffolding Cleanup
Removed all debug and scaffolding scripts that accumulated during development.
Updated `.gitignore` to exclude local report outputs and timestamped CSV files
from version control.

---

## Files Changed

- `ai/ajrasakha/evaluation/multilingual/scenarios.py`
- `ai/ajrasakha/evaluation/multilingual/validators/gdb_verification.py`
- `ai/ajrasakha/evaluation/multilingual/run_multilingual.py`
- `ai/ajrasakha/evaluation/multilingual/tests/test_boundary.py`
- `ai/ajrasakha/evaluation/multilingual/tests/test_disclaimer_regression.py`
- `ai/ajrasakha/evaluation/multilingual/tests/test_gdb_verification.py` [NEW]
- `ai/ajrasakha/evaluation/multilingual/tests/test_multilingual_query_coverage.py` [NEW]
- `docs/multilingual-testing/PRODUCTION-READINESS.md`
- `.gitignore`

---

## Verification

```bash
uv run pytest ajrasakha/evaluation/multilingual/tests/ -v
```

Result: **105 tests passed, 0 failed.**

---

## Remaining Operational Milestones

- **Translation Approvals:** Regional agri-team review of `draft_pending_agri_validation` entries.
- **Live GDB Fingerprints:** Populate `expected_gdb_id` from production trace output.
- **Live Mode Execution:** Configure `LIVE_API_URL` and `ASSISTANT_ID` for real model grading.
