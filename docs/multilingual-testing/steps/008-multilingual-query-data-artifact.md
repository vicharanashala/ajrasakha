# Step 008 — Multilingual Query Data Artifact

**Date:** 2026-07-23
**Status:** COMPLETE — immutable historical record

---

## What Changed

Created `data/multilingual_queries.json` — the canonical 180-slot query data artifact
— and `data/translation_reviewer_worksheet.csv` — the reviewer-facing worksheet for
human translators to fill in native-language queries.

### data/multilingual_queries.json

- 30 scenario entries × 6 language codes = 180 query slots
- English slots are pre-filled from the scenario definition
- Non-English slots are empty strings pending manual review
- Each slot records `query`, `query_source`, and `reviewer`

### data/translation_reviewer_worksheet.csv

A pipe-delimited CSV with columns:

```
scenario_id | domain_group | language | query_en | query_native | reviewed_by | review_date | notes
```

Provided to the agri-team translation reviewer for sign-off before a live test run.

### Case Generator Update

`case_generator.py` loads queries from the data artifact at case generation time.
Non-English empty slots fall back to the English query with
`query_translation_source = "en_fallback"`.

### New Fields on MultilingualCase (case_schema v2)

| Field | Type | Purpose |
|-------|------|---------|
| `domain_group` | str | Domain label for domain×language matrix |
| `disclaimer_mode` | str | `"required"` \| `"forbidden"` \| `"optional"` |
| `query_translation_source` | str | `"data_artifact"` \| `"en_fallback"` |
| `expected_gdb_no_match` | bool | True for out-of-domain scenarios |

### Files Created / Modified

- `ai/ajrasakha/evaluation/multilingual/data/multilingual_queries.json` — 180-slot artifact
- `ai/ajrasakha/evaluation/multilingual/data/translation_reviewer_worksheet.csv` — reviewer worksheet
- `ai/ajrasakha/evaluation/multilingual/case_generator.py` — query loading from data artifact
- `ai/ajrasakha/evaluation/multilingual/case_schema.py` — v2 fields added

---

> [!IMPORTANT]
> The `data/multilingual_queries.json` file is the single source of truth for queries.
> Do not modify query text directly in scenarios.py. Always update the data artifact.
