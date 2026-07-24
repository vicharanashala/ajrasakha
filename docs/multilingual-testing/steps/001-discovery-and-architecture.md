# Step 001 — Discovery & Architecture

**Date:** 2026-07-23  
**Author:** Lead Engineer (AI)  
**Status:** ✅ Complete  

---

## Objective

Audit the existing `ai/ajrasakha/evaluation/` codebase and `ai/ajrasakha/agents/`
to understand what already exists, what can be reused, and define the target
architecture for the 30 × 6 = 180 case multilingual testing suite.

---

## Files Inspected

| File | Purpose |
|------|---------|
| `ai/ajrasakha/evaluation/questions.py` | 14 English-only test cases (flat Python list) |
| `ai/ajrasakha/evaluation/executors.py` | `run_mock_case()` and `run_live_case()` |
| `ai/ajrasakha/evaluation/run.py` | CLI entry point, imports all evaluators |
| `ai/ajrasakha/evaluation/validators/disclaimer_language.py` | SCRIPT_PATTERNS + `evaluate_disclaimer_language()` |
| `ai/ajrasakha/evaluation/validators/source_check.py` | GDB source attribution check |
| `ai/ajrasakha/evaluation/tech.py` | Technical pass (HTTP 200, graph success) |
| `ai/ajrasakha/evaluation/routing.py` | Tool routing validation |
| `ai/ajrasakha/evaluation/plan.py` | Plan key/value comparison |
| `ai/ajrasakha/evaluation/summary.py` | Pass rate aggregation |
| `ai/ajrasakha/evaluation/failure.py` | Failure classification |
| `ai/ajrasakha/evaluation/triage.py` | Triage categories |
| `ai/ajrasakha/evaluation/report.py` | CSV writer |
| `ai/ajrasakha/agents/translation_catalog.py` | Loads translated_languages.json; 45 rows |
| `ai/ajrasakha/agents/translated_languages.json` | 45 (script, vocal) language pairs |
| `ai/ajrasakha/agents/language.py` | Unicode script detection (count-based) |
| `ai/ajrasakha/agents/domains.py` | Canonical domain names |
| `ai/tests/run_stable_suite.py` | 3-layer orchestrator (API, MCP, LangGraph) |
| `ai/pyproject.toml` | Python 3.10+, uv/hatchling, pytest config |

---

## Key Findings

### What exists
- **Translation catalog** has all 6 target languages with exact disclaimer strings.
- **Script patterns** are already defined in `disclaimer_language.py` — reusable.
- **`run_mock_case()`** provides the shape for mock responses.
- **`evaluate_disclaimer_language()`** can be directly called for disclaimer checks.

### What is missing
- No multilingual test cases (all 14 existing are English-only).
- No per-language case generation infrastructure.
- No Language Quality Matrix.
- No mid-answer language switch detection.
- No terminology/transliteration assertions.
- No multilingual HTML report.

### Constraints identified
- `translated_languages.json` schema version 1 — must not break this.
- Queries stay in English (agent detects language from user metadata; test
  exercises response language detection, not input detection).
- `translation_review_status = "pending"` for all 180 cases until human validates.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Extend `evaluation/`, do not duplicate | Architecture rule. All imports go through existing modules. |
| Disclaimers pulled from catalog at generation time | Single source of truth; prevents manual drift |
| All validators deterministic | No LLM calls in CI — safe for offline runs |
| Case IDs: `ML-S01-EN` format | Stable, sortable, human-readable |
| Queries stay in English | Production system detects language from user metadata; test exercises that detection |
| `translation_review_status = "pending"` | Security rule: never claim validation without human sign-off |
| Status vocabulary: PASS/FAIL/ERROR/BLOCKED/SKIPPED | Engineering standards requirement |

---

## Commands Run

```powershell
# Catalog inspection (no secrets)
uv run python -c "import json; f=open('ajrasakha/agents/translated_languages.json', encoding='utf-8'); data=json.load(f); f.close(); rows=data.get('rows',[]); print('Total rows:', len(rows)); [print(' ', r['script_language'], '/', r['vocal_language']) for r in rows]"
# Result: 45 rows, all 6 target languages confirmed present
```

---

## Test Commands & Results

N/A — this step is discovery only, no code changes.

---

## Remaining Risks / Blockers

| Risk | Severity | Status |
|------|----------|--------|
| Agri-team translation validation | HIGH | 🔴 Pending — no human reviewer assigned yet |
| Live API credentials not tested | MEDIUM | ⚠️ Only mock mode verified at this step |
| `translated_languages.json` schema changes | LOW | 🟡 Monitored; version 1 locked |

---

## Next Step

→ [002 — Scenario Corpus & Language Registry](002-scenario-corpus-and-language-registry.md)
