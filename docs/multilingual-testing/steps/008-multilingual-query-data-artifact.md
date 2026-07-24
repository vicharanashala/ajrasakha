# Step 008 — Multilingual Query Data Artifact

**Phase:** Phase 2 — Multilingual Expansion
**Status:** COMPLETE — immutable historical record

---

## What Changed

Created `data/multilingual_queries.json` — the canonical 180-slot query data
artifact — and `data/translation_reviewer_worksheet.csv` — the reviewer-facing
worksheet for human translators.

### data/multilingual_queries.json

- 30 scenario entries × 6 language codes = 180 query slots
- English slots are pre-filled from the scenario definition
- Non-English slots are populated by the agri-team translation reviewers
- Each slot records `query`, `query_source`, and `reviewer`

### data/translation_reviewer_worksheet.csv

A pipe-delimited CSV provided to the agri-team translation reviewer for
sign-off before a live test run:

```
scenario_id | domain_group | language | query_en | query_native | reviewed_by | review_date | notes
```

### Case Generator Strict Sentinel (Phase 3 Hardening)

`case_generator.py` loads queries from the data artifact at case generation
time. For non-English languages, if the artifact slot is absent or empty, the
case is assigned:

- `query = "MISSING_TRANSLATION"` (sentinel value)
- `query_translation_source = "missing_translation"`

The execution runner (`run_multilingual.py`) detects this sentinel and returns
`CaseStatus.SKIPPED_MISSING_TRANSLATION` before making any API call. These
cases are excluded from the Domain x Language matrix denominator so absent
translations never inflate Indic-language pass rates.

This is a deliberate departure from the earlier `en_fallback` behavior, which
silently allowed English queries to run under non-English language labels.

### Fields on MultilingualCase (case_schema v2)

| Field | Type | Purpose |
|-------|------|---------|
| `domain_group` | str | Domain label for domain×language matrix |
| `disclaimer_mode` | str | `"required"` \| `"forbidden"` \| `"optional"` |
| `query_translation_source` | str | `"data_artifact"` \| `"missing_translation"` |
| `expected_gdb_no_match` | bool | True for out-of-domain scenarios |

### Files Created / Modified

- `ai/ajrasakha/evaluation/multilingual/data/multilingual_queries.json` — 180-slot artifact
- `ai/ajrasakha/evaluation/multilingual/data/translation_reviewer_worksheet.csv` — reviewer worksheet
- `ai/ajrasakha/evaluation/multilingual/case_generator.py` — strict sentinel on missing translations
- `ai/ajrasakha/evaluation/multilingual/case_schema.py` — v2 fields; `SKIPPED_MISSING_TRANSLATION` status
- `ai/ajrasakha/evaluation/multilingual/reporters/domain_matrix.py` — excludes sentinel from denominator

---

> [!IMPORTANT]
> The `data/multilingual_queries.json` file is the single source of truth for queries.
> Do not modify query text directly in scenarios.py. Always update the data artifact.
