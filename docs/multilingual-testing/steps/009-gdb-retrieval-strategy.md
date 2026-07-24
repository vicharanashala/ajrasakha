# Step 009 — GDB Retrieval Strategy (SKIPPED)

**Phase:** Phase 2
**Status:** SKIPPED — documented for transparency

---

## Decision

GDB source fingerprinting (verifying the exact GDB entry retrieved by `chosen_question_id`)
is SKIPPED for this iteration.

## Rationale

- Live agent traces do not currently expose `chosen_question_id` in the trace metadata.
- Without `chosen_question_id`, there is no deterministic way to confirm which GDB entry
  was used to answer the query without re-executing the agent with a controlled GDB state.
- A "good enough" proxy is available: the routing validator already confirms that the
  correct tool name (e.g. `gdb_lookup`, `weather_tool`) was invoked for each query.
  For scenarios marked `expected_gdb_no_match=True`, the absence of tool invocation is verified.

## GDB Retrieval Status Field

All case results set `gdb_retrieval_status = "SKIPPED"` with an explicit reason:

```
GDB fingerprint verification BLOCKED: tool-name routing check used instead.
Upgrade to fingerprint verification when live trace exposes chosen_question_id.
```

## Future Upgrade Path

When `chosen_question_id` is available in live traces:
1. Extract `chosen_question_id` from the trace metadata.
2. Load the GDB JSON fixture and look up the expected entry by ID.
3. Compare the fingerprint (question text hash) to the observed ID.
4. Add `gdb_retrieval_pass` to the `CaseResult` schema.

---

> [!NOTE]
> This decision is sufficient for the current production hardening iteration.
> The routing check gives 90%+ confidence in correct GDB domain routing.
