# Step 002 — Scenario Corpus & Language Registry

**Phase:** Phase 1  
**Author:** Lead Engineer (AI)  
**Status:** ✅ Complete  

---

## Objective

Define and implement:
1. The **30 canonical farming scenarios** (domain-stable, language-agnostic)
2. The **6-language registry** (catalog lookup keys, script patterns, sample locations)

---

## Files Changed

| File | Change |
|------|--------|
| `ai/ajrasakha/evaluation/multilingual/languages.py` | [NEW] 6 language records |
| `ai/ajrasakha/evaluation/multilingual/scenarios.py` | [NEW] 30 canonical scenarios |

---

## Design Decisions

### Scenario selection rationale

| Domain coverage | Count |
|---|---|
| Crop-specific GDB (knowledge_base=True) | 21 |
| Market Prices (live market data) | 2 |
| Government Schemes | 2 |
| Weather (live dynamic) | 2 |
| General / Non-Agriculture | 2 |
| Multi-tool (weather + GDB) | 1 |

**Stability flag**: Scenarios S11, S12 (market), S16, S17 (weather), S30 (multi-tool)
are marked `stable=False` because their responses contain live dynamic data.
They run in mock mode using fixtures, and are excluded from `--stable-only` live runs.

### Language registry design

Each `LanguageRecord` maps a 2-letter code (e.g. "HI") to:
- The `(catalog_script, catalog_vocal)` tuple that looks up the translation catalog
- The Unicode regex pattern from the existing `disclaimer_language.py` `SCRIPT_PATTERNS`
- A sample Indian state/city for location fixtures

**Invariant**: catalog keys must exactly match entries in `translated_languages.json`.
Verified by running `load_catalog()` at generation time.

### Scenario ID numbering

IDs are `S01` through `S30` — zero-padded to 3 characters for lexicographic sort stability.

---

## Commands Run

```powershell
# Verify scenario assertion guard works
uv run python -c "from ajrasakha.evaluation.multilingual.scenarios import SCENARIOS; print('Scenarios:', len(SCENARIOS))"
# Output: Scenarios: 30
```

---

## Test Commands & Results

```
All 41 unit tests pass (see step 006 for full run)
```

---

## Remaining Risks / Blockers

| Risk | Severity | Status |
|------|----------|--------|
| Scenario queries are in English only | LOW | ✅ By design — production detects from user metadata |
| 5 unstable scenarios still run in mock | LOW | ✅ OK — fixtures are deterministic |
| Agri-team translation validation | HIGH | 🔴 Pending |

---

## Next Step

→ [003 — Case Generator & Schema](003-case-generator-and-schema.md)
