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

## Chemical checker — dual trigger

1. Planner sets `chemical_checker=true` when the farmer names a chemical in the query.
2. After `gdb` returns, executor scans tool text for known chemical tokens and may run a **second parallel batch** with `chemical_checker` only.

## Crop / non-crop classifier

`domains.py` lists crop-required vs crop-all domains. `planner_rules.apply_planner_completeness_rules` enforces:
- Location: state in **latest message** → resolved; else GPS on thread → use reverse-geocoded state; no GPS and no state in latest message → ask state+district once. District from GPS city only when lat/long present — never stale city from old turns without GPS.
- Crop: ask only when `domain_requires_crop` and crop not in **recent** farmer replies (last ~3 turns). Otherwise set crop="All".
- Schemes/insurance/PM-KISAN: `schemes=true`, block meta follow-ups ("what would you like to know…").
- State/district must not leak from unrelated older questions in the thread.

## Feature flag

- `USE_PLANNER_GRAPH=true` (default): planner → ensure_location → execute_plan → synthesize → relevance_check → sanitize.
- `USE_PLANNER_GRAPH=false`: legacy single-LLM `ajrasakha` + `tools` loop.

## Synthesizer

The synthesizer LLM does not bind tools. It only composes farmer-facing text from tool results.
