# Step 005 — Reporters & Language Quality Matrix

**Phase:** Phase 1  
**Author:** Lead Engineer (AI)  
**Status:** ✅ Complete  

---

## Objective

Implement three reporters:
1. **Language Quality Matrix** — 30×6 grid of PASS/FAIL/BLOCKED/SKIPPED
2. **Recommendations generator** — evidence-based, priority-ranked findings
3. **HTML report** — self-contained, shareable HTML with matrix and full results table

---

## Files Changed

| File | Change |
|------|--------|
| `ai/ajrasakha/evaluation/multilingual/reporters/__init__.py` | [NEW] Package init |
| `ai/ajrasakha/evaluation/multilingual/reporters/matrix.py` | [NEW] Matrix builder + CSV writer |
| `ai/ajrasakha/evaluation/multilingual/reporters/recommendations.py` | [NEW] Evidence-based recommendations |
| `ai/ajrasakha/evaluation/multilingual/reporters/html_report.py` | [NEW] HTML report generator |

---

## Design Decisions

### Language Quality Matrix
- A `dict[scenario_id → dict[language_code → status_string]]`
- Missing cells default to `"SKIPPED"` (not hidden)
- CSV columns: `scenario_id, scenario_name, domain, EN, HI, KN, TA, PA, TE`
- Summary stats: per-language and per-scenario pass rates + worst performers

### Recommendations
Priority levels:
- `CRITICAL`: >50% fail rate in a language/domain
- `HIGH`: >20% fail rate, or disclaimer failures, or lang_switch detections
- `MEDIUM`: Isolated failures
- `INFO`: Translation review pending, overall stats

**Security rule**: All findings must be derived from actual test data.
The generator never fabricates scores, invents failures, or claims results it cannot compute.

### HTML report
- Inline CSS only — no external dependencies
- Color-coded matrix cells (green/red/orange/purple/grey)
- Full results table with all validator columns
- Recommendations rendered as priority-labeled cards

---

## Test Commands & Results

```
Mock suite (180 cases):
  PASS:    180 / 180
  FAIL:    0
  ERROR:   0
  BLOCKED: 0
  Pass rate: 100.0%

Files generated:
  multilingual_results_mock_TIMESTAMP.csv   — 180 data rows
  multilingual_matrix_mock_TIMESTAMP.csv    — 30×6 grid
  multilingual_report_mock_TIMESTAMP.html   — HTML report
```

---

## Remaining Risks / Blockers

| Risk | Severity | Status |
|------|----------|--------|
| HTML report not tested in browser | LOW | ⚠️ Visual review recommended |
| Matrix CSV "latest" symlink not implemented | LOW | ⚠️ Stable suite uses timestamped file; will show BLOCKED in stable suite runner |

---

## Next Step

→ [006 — CLI Entry & Stable Suite Integration](006-run-entry-and-stable-suite-integration.md)
