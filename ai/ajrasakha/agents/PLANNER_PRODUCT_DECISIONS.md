# Planner graph — product decisions

These choices extend the manager's `PLANNER_SYSTEM_PROMPT` with existing AjraSakha rules.

## Planner Agent Flow (Deterministic)

```
Take input query
  → Check domain (LLM classifies tool flags)
  → Check state (deterministic: **latest message** text FIRST, then from GPS lat/long only)
  → Check crop (deterministic: **recent clarify turns**, not full thread history)
  → Lookup table check (domains.py):
      crop_required=True  AND crop available   → pass
      crop_required=True  AND crop unavailable  → ask user for crop
      crop_required=False                       → crop = "All"
  → State resolution:
      state in query      → state = query_state
      state NOT in query  → state = from lat/long (thread location)
  → Completeness check:
      state=True  AND crop_required=True  AND crop=True  → is_question_complete=True
      state=True  AND crop_required=True  AND crop=False → is_question_complete=False
  → Loop until is_question_complete=True (via clarify node)
  → When complete → determine tools to call
  → Output to main agent:
      {original_query, rephrased_query, state, crop, tools: [list]}
```

**Key principle:** LLM is used ONLY for domain/tool classification and query translation/rephrasing.  
State and crop resolution are fully deterministic (regex-based extraction).  
GDB no longer overrides state from thread config — it uses what the planner passed.

## Always-on (not planner flags)

- **Reviewer upload** (`upload_question_to_reviewer_system`): runs on every complete turn via `execute_plan`, before specialist tools.
- **Location resolve**: if thread GPS exists but state/district are missing, `ensure_location` / executor calls `location_information_tool` before other tools.

## Chemical checker — dual trigger (disabled by default)

Set `ENABLE_CHEMICAL_CHECKER = True` in `plan_executor.py` to re-enable.

1. Planner sets `chemical_checker=true` when the farmer names a chemical in the query (forced off while disabled).
2. After `gdb` returns, executor scans tool text for known chemical tokens and may run a **second parallel batch** with `chemical_checker` only.

## Crop / non-crop classifier

`domains.py` lists crop-required vs crop-all domains. `planner_rules.apply_planner_completeness_rules` enforces:
- Location: state in **latest message** → resolved (district defaults to `all` if not in text); else GPS on thread → use reverse-geocoded state/city; no GPS and no state → ask **state only** (never district-only follow-up). District from GPS city only when lat/long present.
- Crop: ask only when `domain_requires_crop` and crop not in **recent** farmer replies (last ~3 turns). **One-shot clarify**: if a crop follow-up was already asked in the thread and the farmer still does not name a crop, set `crop="all"` and proceed (no repeated crop questions).
- Schemes/insurance/PM-KISAN: `schemes=true`, block meta follow-ups ("what would you like to know…").
- State/district must not leak from unrelated older questions in the thread.

## Feature flag

- `USE_PLANNER_GRAPH=true` (default): planner → ensure_location → **`execute_plan`** (ag queries) → **assemble_answer_body** / **empty_gdb_reply** / **translate_answer** → END. Non-agriculture queries use the dedicated terminal path described below. No synthesizer LLM. Golden retrieval uses FastAPI + Gemma classification (no retrieval_sanitizer). (`sanitize_answer` is commented out.)
- **Non-agriculture** (`is_agriculture_related=false`): planner → `ensure_location` → `upload_reviewer_only` (reviewer MCP only) → `non_agriculture_reply` → END. The terminal node returns the exact localized **Non-Agriculture Query** catalog text followed by the localized **Testing disclaimer**; it never invokes the translation LLM. Specialist tools are skipped and reviewer `answer_text` remains ignored.

## Language (vocal + script)

- **Source of truth:** planner LLM proposes `vocal_language` and `script_language`; **`resolve_planner_language_pair()`** in `language.py` normalizes them from Unicode script on the **latest raw farmer message** (`detect_script`).
- **Romanized / Latin typing:** `script_language=English`, `vocal_language=<spoken>` (e.g. Romanized Telugu → English + Telugu; Hinglish → English + Hindi).
- **Native script:** `script_language` uses the detected script label and `vocal_language` uses the spoken language (e.g. `Devanagari` + `Hindi`).
- **Fixed strings** (exact cells, no LLM paraphrase): non-agriculture reply, testing disclaimer, 2-hour expert-queue text, state/crop follow-ups — keyed by `(script_language, vocal_language)`.
- **assemble_answer_body** uses GDB expert text or formatted specialist tool output as-is (no LLM); **translate_answer** translates + appends sources/testing.
- **Mixed GDB + specialist** in one turn → **empty_gdb_reply** (2-hour + testing catalog text only).
- **translate_answer** paths (see `plan.translate_path`):
  - **`empty_gdb_reply`** → catalog **2-hour + testing** only (no translate LLM).
  - **`assemble_answer_body` / reviewer direct** → translate body when needed → GDB **sources + author** (when applicable) → catalog **testing disclaimer** only (no 2-hour on this path).
- Expert-queue turns (no GDB and no specialist content) route to `empty_gdb_reply`.
- `USE_PLANNER_GRAPH=false`: legacy single-LLM `ajrasakha` + `tools` loop.

## Answer assembly (no synthesizer LLM)

The planner graph does **not** use a synthesizer LLM. Bodies are assembled deterministically in **assemble_answer_body**, then **translate_answer** handles language/script and footers.

**Specialist tool formatting:** Weather and market tools return raw JSON; `tool_output_formatters.format_tool_output()` turns them into readable prose before translate. Soil, schemes, and chemical_checker pass through unchanged.
