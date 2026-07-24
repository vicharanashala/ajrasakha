# AjraSakha Multilingual Testing Suite — Step Index

This document is the authoritative index of all step documentation files for
Project 4: the AjraSakha Cross-lingual and Multilingual Testing Suite.

Each step file is immutable once created. Do not edit completed steps — append
a new step file for revisions and link it here.

## Completed Steps

| # | Title | Date | Status |
|---|-------|------|--------|
| [001](steps/001-discovery-and-architecture.md) | Discovery & Architecture | 2026-07-23 | ✅ Complete |
| [002](steps/002-scenario-corpus-and-language-registry.md) | Scenario Corpus & Language Registry | 2026-07-23 | ✅ Complete |
| [003](steps/003-case-generator-and-schema.md) | Case Generator & Schema | 2026-07-23 | ✅ Complete |
| [004](steps/004-validators.md) | Deterministic Validators | 2026-07-23 | ✅ Complete |
| [005](steps/005-reporters-and-matrix.md) | Reporters & Language Quality Matrix | 2026-07-23 | ✅ Complete |
| [006](steps/006-run-entry-and-stable-suite-integration.md) | CLI Entry & Stable Suite Integration | 2026-07-23 | ✅ Complete |
| [007](steps/007-scenario-redistribution.md) | Scenario Redistribution & Domain Balance | 2026-07-24 | ✅ Complete |
| [008](steps/008-multilingual-query-data-artifact.md) | Multilingual Query Data Artifact Integration | 2026-07-24 | ✅ Complete |
| [009](steps/009-gdb-retrieval-strategy.md) | GDB Retrieval Strategy & Fingerprinting | 2026-07-24 | ✅ Complete |
| [010](steps/010-disclaimer-policy.md) | Disclaimer Policy & Forbidden Mode Guard | 2026-07-24 | ✅ Complete |
| [011](steps/011-language-quality-hardening.md) | Language Quality Hardening & Proportion Checks | 2026-07-24 | ✅ Complete |
| [012](steps/012-deepeval-opt-in.md) | DeepEval Opt-In Evaluator Integration | 2026-07-24 | ✅ Complete |
| [013](steps/013-whatsapp-transport-stub.md) | WhatsApp Transport Sandbox Adapter | 2026-07-24 | ✅ Complete |
| [014](steps/014-domain-language-matrix.md) | Domain-Language Matrix & CSV Reporting | 2026-07-24 | ✅ Complete |
| [015](steps/015-boundary-and-negative-tests.md) | Boundary & Negative Test Suite | 2026-07-24 | ✅ Complete |
| [016](steps/016-whatsapp-transport-and-reporting.md) | WhatsApp Transport & Matrix Reporting | 2026-07-24 | ✅ Complete |
| [017](steps/017-production-hardening.md) | Production Hardening & QA Audit Remediation | 2026-07-24 | ✅ Complete |

## Pending Operational Milestone

| Milestone | Description | Status |
|---|---|---|
| Agri-Team Review | Regional expert sign-off on `draft_pending_agri_validation` translations in `translation_reviewer_worksheet.csv` | ⏳ Pending human sign-off |
| Live Trace GDB Fingerprints | Populate real `chosen_question_id` values when live trace infrastructure exposes fingerprint fields | ⚠ Deferred until API trace update |

## Security & Data Reminders

> **NEVER** document secrets, private URLs, phone numbers, raw user records, or
> credential values in any step file.

> **Translation review** is tracked as `draft_pending_agri_validation` until an agri-team member
> explicitly validates the disclaimer and terminology translations in the reviewer worksheet.

## Architecture Overview

```
ai/ajrasakha/evaluation/multilingual/
├── __init__.py
├── case_schema.py          # MultilingualCase, CaseResult, CaseStatus
├── languages.py            # 6 language records (EN HI KN TA PA TE)
├── scenarios.py            # 30 canonical scenarios & domain_group mapping
├── case_generator.py       # generate_cases() → 180 MultilingualCase
├── run_multilingual.py     # CLI entry point
├── data/
│   ├── multilingual_queries.json        # Query data artifact
│   └── translation_reviewer_worksheet.csv # Agri-team review worksheet
├── validators/
│   ├── language_match.py   # Unicode script detection & proportion checks
│   ├── disclaimer_check.py # Catalog-driven disclaimer validation (required/forbidden)
│   ├── lang_switch.py      # Token & segment mid-answer language switch detection
│   ├── terminology.py      # Agri-term presence checks & review flags
│   ├── terminology_dict.py # Multilingual agri-term dictionary
│   ├── gdb_verification.py # Live GDB fingerprint verification (BLOCKED if None)
│   └── deepeval_multilingual.py # Opt-in DeepEval LLM-as-a-judge evaluator
├── reporters/
│   ├── matrix.py           # Language Quality Matrix (30×6) & metric pass rates
│   ├── domain_matrix.py    # Domain × Language aggregated matrix (5×6)
│   ├── recommendations.py  # Evidence-based recommendations generator
│   └── html_report.py      # HTML report generator
├── transports/
│   └── whatsapp_transport.py # WhatsApp HTTP sandbox transport adapter
├── fixtures/
│   └── mock_responses.py   # Deterministic CI fixtures
└── tests/
    ├── test_case_generator.py
    ├── test_validators.py
    ├── test_boundary.py
    ├── test_gdb_verification.py
    ├── test_disclaimer_regression.py
    ├── test_deepeval_multilingual.py
    ├── test_multilingual_query_coverage.py
    └── test_whatsapp_transport.py
```


## Related Files (unmodified base framework)

- `ai/ajrasakha/evaluation/run.py` — existing evaluation runner
- `ai/ajrasakha/evaluation/executors.py` — mock/live executors (reused)
- `ai/ajrasakha/evaluation/validators/disclaimer_language.py` — reused by disclaimer_check.py
- `ai/ajrasakha/agents/translation_catalog.py` — authoritative disclaimer source
- `ai/tests/run_stable_suite.py` — modified to add Layer 4
