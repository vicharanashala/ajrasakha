# Planner graph — product decisions

These choices extend the manager's `PLANNER_SYSTEM_PROMPT` with existing AjraSakha rules.

## Always-on (not planner flags)

- **Reviewer upload** (`upload_question_to_reviewer_system`): runs on every complete turn via `execute_plan`, before specialist tools.
- **Location resolve**: if thread GPS exists but state/district are missing, `ensure_location` / executor calls `location_information_tool` before other tools.
- **Exact search**: Mongo exact-match still runs before the planner (`exact_search` node).

## Chemical checker — dual trigger

1. Planner sets `chemical_checker=true` when the farmer names a chemical in the query.
2. After `gdb` returns, executor scans tool text for known chemical tokens and may run a **second parallel batch** with `chemical_checker` only.

## Crop / non-crop classifier

`domains.py` lists crop-required vs crop-all domains. `planner_rules.apply_planner_completeness_rules` enforces:
- Location: state in text → ask district only; GPS on thread → do not ask location; no GPS and no state → ask state+district once.
- Crop: ask only when `domain_requires_crop` and crop not in full conversation.
- Schemes/insurance/PM-KISAN: `schemes=true`, block meta follow-ups ("what would you like to know…").
- Planner reads full conversation (not only the latest line).

## Feature flag

- `USE_PLANNER_GRAPH=true` (default): planner → ensure_location → execute_plan → synthesize → relevance_check → sanitize.
- `USE_PLANNER_GRAPH=false`: legacy single-LLM `ajrasakha` + `tools` loop.

## Synthesizer

The synthesizer LLM does not bind tools. It only composes farmer-facing text from tool results.
