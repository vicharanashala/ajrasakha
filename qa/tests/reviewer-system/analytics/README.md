# Reviewer System — Analytics (`tests/reviewer-system/analytics/`)

End-to-end coverage of the **moderator + coordinator analytics dashboards**
and the **expert reputation view**.  Validates that chart data is consistent
with what the queue APIs return — the most common class of analytics bug
is "the chart says pending=37 but the queue says pending=12".

## Planned coverage (PR #5)

| # | Behaviour |
|---|-----------|
| ANA-01 | Pending-question count matches queue length |
| ANA-02 | Status breakdown pie chart sums to total |
| ANA-03 | Date-range filter narrows the chart correctly |
| ANA-04 | Expert reputation leaderboard reflects recent approvals |
| ANA-05 | CSV export matches on-screen data |
| ANA-06 | GDB growth counter increments after a published answer |

## Files in this folder

```
analytics/
└── README.md
```

> Folder is intentionally empty until PR #5 lands.