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

## Pending Steps

| # | Title | Status |
|---|-------|--------|
| 007 | Live Mode Validation (requires LIVE_API_URL) | ⏳ Pending |
| 008 | Agri-Team Translation Review | ⏳ Pending — requires human sign-off |
| 009 | Live Run & Language Quality Baseline | ⏳ Pending |

## Security & Data Reminders

> **NEVER** document secrets, private URLs, phone numbers, raw user records, or
> credential values in any step file.

> **Translation review** is tracked as PENDING until an agri-team member
> explicitly validates the disclaimer and terminology translations.
> Do NOT change status to "approved" without a human reviewer sign-off.

## Architecture Overview

```
ai/ajrasakha/evaluation/multilingual/
├── __init__.py
├── case_schema.py          # MultilingualCase, CaseResult, CaseStatus
├── languages.py            # 6 language records
├── scenarios.py            # 30 canonical scenarios (S01–S30)
├── case_generator.py       # generate_cases() → 180 MultilingualCase
├── run_multilingual.py     # CLI entry point
├── validators/
│   ├── language_match.py   # Unicode script detection
│   ├── disclaimer_check.py # Catalog-driven disclaimer validation
│   ├── lang_switch.py      # Mid-answer language switch detection
│   └── terminology.py      # Agri-term presence checks
├── reporters/
│   ├── matrix.py           # Language Quality Matrix (30×6)
│   ├── recommendations.py  # Evidence-based recommendations
│   └── html_report.py      # HTML report generator
├── fixtures/
│   └── mock_responses.py   # Deterministic CI fixtures
└── tests/
    ├── test_case_generator.py
    └── test_validators.py
```

## Related Files (unmodified base framework)

- `ai/ajrasakha/evaluation/run.py` — existing evaluation runner
- `ai/ajrasakha/evaluation/executors.py` — mock/live executors (reused)
- `ai/ajrasakha/evaluation/validators/disclaimer_language.py` — reused by disclaimer_check.py
- `ai/ajrasakha/agents/translation_catalog.py` — authoritative disclaimer source
- `ai/tests/run_stable_suite.py` — modified to add Layer 4
