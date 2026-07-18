# Reviewer System — Analytics (`tests/reviewer-system/analytics/`)

End-to-end coverage of the **moderator + coordinator analytics dashboards**
and the **expert reputation view**.  Validates that chart data is consistent
with what the queue APIs return — the most common class of analytics bug
is "the chart says pending=37 but the queue says pending=12".

## Landed in PR #4

| # | ID | Behaviour |
|---|----|-----------|
| 1 | QDN-01 | Queue total count equals the sum of its section counts (pending + in-review + stuck + closed = total). |
| 2 | QDN-02 | Each section's badge count matches the number of visible rows/cards when expanded. |
| 3 | QDN-03 | Filtering the queue by a specific status narrows the total + list correctly. |
| 4 | ANA-01 | Analytics dashboard loads without error and renders the canonical metric cards. |
| 5 | ANA-02 | "Closed today" counter increments after a question is approved (serial — local side effect, no reliance on other spec files). |
| 6 | ANA-03 | Date-range filter narrows the gdb-growth / closed-today metric correctly. |
| 7 | ANA-04 | Metric values render as real numbers (no `undefined`, `NaN`, `[object Object]`, or negative). |

## Planned for PR #5

| # | ID | Behaviour |
|---|----|-----------|
| 8 | ANA-05 | Status breakdown pie chart sums to total. |
| 9 | ANA-06 | Expert reputation leaderboard reflects recent approvals. |
| 10 | ANA-07 | CSV export matches on-screen data. |
| 11 | ANA-08 | GDB growth counter increments after a published answer (long-window). |

## Files in this folder

```
analytics/
├── README.md                            [this file]
└── queue-and-analytics.spec.ts          [PR #4 — 7 tests]
```
