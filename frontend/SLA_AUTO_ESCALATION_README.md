# SLA Breach Auto-Escalation

Automatically detects and reallocates questions that exceed the 2-hour SLA to available experts.

## Features

- **Auto-Escalation Toggle** — Enable/disable automatic escalation via localStorage-persisted switch
- **Live Dashboard Panel** — Shows delayed question count, active experts, escalated count, and auto-escalation status on the admin Dashboard
- **One-Click Escalation** — "Escalate Now" button to manually trigger immediate reallocation
- **Manual Override** — Opens the existing `ReallocationManualModal` for expert-by-expert assignment
- **Real-Time Badge** — ReAllocate button on the Questions page shows a live delayed count with pulse animation
- **Auto-Polling** — When enabled, polls every 5 minutes for newly delayed questions

## Files

| File | Description |
|------|-------------|
| `src/hooks/api/question/useSLAAutoEscalation.ts` | Hook: polls `GET /questions/reallocation-preview?type=escalation`, triggers `POST /questions/reAllocateLessWorkload?type=escalation` |
| `src/components/SLAEscalationPanel.tsx` | Dashboard card UI with stats, toggle, and action buttons |
| `src/components/dashboard.tsx` | Integrates panel below stats row, admin-only |
| `src/features/question-table-page/QuestionsFilters.tsx` | Live delayed count badge on ReAllocate button |

## SLA Threshold

Questions are considered "delayed" when they exceed **2 hours** (7,200,000ms) since assignment, matching the existing `useQuestionTimer` SLA constant.

## API Endpoints Used

- `GET /api/questions/reallocation-preview?type=escalation` — Returns list of delayed questions and available experts
- `POST /api/questions/reAllocateLessWorkload?type=escalation` — Auto-reallocates delayed questions to experts with lower workload

## Visibility

- **Dashboard Panel** — Admin role only
- **Badge on Questions page** — Visible to all non-expert/non-tester roles
