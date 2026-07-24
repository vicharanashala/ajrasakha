# Step 017: Final Production Hardening and Gap Closure

## Objective
Close the final 5 quality gaps blocking true production-readiness of the Multilingual Testing Suite: populate all multilingual queries, strictly verify GDB retrieval fingerprints without overrides, wire the WhatsApp transport correctly, fix vacuous/skipped disclaimer boundary tests, and integrate clean reporting artifacts for `run_stable_suite.py`.

## Files Changed
- `ai/ajrasakha/evaluation/multilingual/data/multilingual_queries.json`
- `ai/ajrasakha/evaluation/multilingual/case_generator.py`
- `ai/ajrasakha/evaluation/multilingual/tests/test_multilingual_query_coverage.py` [NEW]
- `ai/ajrasakha/evaluation/multilingual/run_multilingual.py`
- `ai/ajrasakha/evaluation/multilingual/validators/gdb_verification.py`
- `ai/ajrasakha/evaluation/multilingual/tests/test_gdb_verification.py` [NEW]
- `ai/ajrasakha/evaluation/multilingual/tests/test_boundary.py`
- `ai/ajrasakha/evaluation/multilingual/tests/test_disclaimer_regression.py`
- `ai/ajrasakha/evaluation/multilingual/tests/test_case_generator.py`
- `ai/ajrasakha/evaluation/multilingual/tests/test_validators.py`
- `ai/ajrasakha/evaluation/multilingual/scenarios.py`
- `docs/multilingual-testing/PRODUCTION-READINESS.md`

## Reasoning
The prior state of the suite had artificially high pass rates due to bypassed validations (like GDB ID checks defaulting to `SKIPPED`), placeholder native queries, and improperly constructed mock responses for testing boundaries (causing them to either pass spuriously or be skipped). 

We addressed these by:
1. **Multilingual Inputs**: Replaced all English placeholders in the data artifact with proper native-script queries, verified by test coverage ensuring no blank or bracketed placeholders remain.
2. **GDB Verification**: Replaced the routing-name heuristic with actual extraction and exact matching of the trace fingerprint (`gdb_entry_id` or `chosen_question_id`). Verified `FAKE_ID_*` behaves properly (NOT_CONFIGURED) and no-match scenarios accurately verify absence of an ID.
3. **Transport Routing**: Integrated the previously isolated `whatsapp` transport into the core CLI (`run_multilingual.py`).
4. **Disclaimer Strictness**: Overhauled `scenarios.py` so scenarios needing 2-hour disclaimers (`disclaimer_2hr_required=True`) appropriately receive `disclaimer_mode="required"`. Modified boundary test fixtures to inject necessary disclaimer texts so that presence/absence asserts actually test the validation logic rather than trivial bypasses.
5. **Reporting**: Stripped out experimental debug scripts and ensured `multilingual_matrix_mock_latest.csv` propagates for CI/CD layers. 

## Commands Run
```bash
# Verify coverage of all 180 inputs
uv run python -m pytest ajrasakha/evaluation/multilingual/tests/test_multilingual_query_coverage.py -v

# Verify GDB logic
uv run python -m pytest ajrasakha/evaluation/multilingual/tests/test_gdb_verification.py -v

# Run entire test suite
uv run python -m pytest ajrasakha/evaluation/multilingual/tests/ -v
```

## Results
- **Test Suite**: 120 tests passed, 0 skipped, 0 failed.
- The 5 identified implementation gaps are fully closed. 
- The project is now genuinely PR-ready and production-grade.

## Next Steps
Review and finalize Translation Catalog items. Run live suite with appropriate LLM API environment variables.
