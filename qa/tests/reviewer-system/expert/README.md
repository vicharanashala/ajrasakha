# Reviewer System — Expert (`tests/reviewer-system/expert/`)

End-to-end coverage of the **expert's** workflow: reviewing an allocated
question, drafting the answer, submitting for peer review, and (after
approval) pushing the final answer into the Golden Database.

## Planned coverage (PR #2)

| # | Behaviour |
|---|-----------|
| EXP-01 | Expert sees the question just allocated to them in their inbox |
| EXP-02 | Expert can draft an answer (rich-text) and attach references |
| EXP-03 | Submitting for peer review triggers a notification to the reviewer |
| EXP-04 | After approval, the answer is published to the Golden Database |
| EXP-05 | Expert can request re-allocation back to the moderator |
| EXP-06 | Expert reputation score updates after a published answer |

## Files in this folder

```
expert/
└── README.md
```

> Folder is intentionally empty until PR #2 lands.

## Why this folder sits beside `moderator/`

The Reviewer pipeline is a relay: **moderator → expert → reviewer (peer) →
GDB**.  Keeping each role's specs in its own folder makes it obvious which
step a failing test belongs to, even when the trace.zip is the only signal
the on-call has.