\# SLA, HOLD and Time-Bound Reallocation Testing



\## Overview



This document describes the automated testing added for the SLA, HOLD, and time-bound reallocation workflow in the AJRASAKHA Reviewer System.



The testing covers the workflow across the frontend, backend, and end-to-end layers.



\## What Was Added



\### Playwright E2E Tests



10 Playwright tests were added covering:



\- Live SLA countdown

\- HOLD confirmation

\- HOLD state and countdown freezing

\- Release HOLD and countdown resumption

\- SLA deadline extension after HOLD

\- HOLD persistence after page refresh

\- HOLD cancellation

\- Release HOLD cancellation

\- Expired SLA handling

\- Time-bound question reallocation



The E2E tests use the Chromium browser configuration in `frontend/playwright.config.ts`.



\### Frontend Unit Tests



13 unit tests were added for the countdown logic in:



`frontend/src/hooks/ui/useCountdown.test.ts`



These tests cover:



\- Normal SLA countdown calculation

\- Exact deadline

\- Expired SLA

\- Accumulated HOLD time

\- Active HOLD

\- Invalid dates

\- Zero and large hold durations

\- HOLD status options



\### Backend Tests



8 focused backend tests were added.



\#### Allocation Service



2 tests cover:



\- Time-bound reallocation

\- Protection against concurrent reallocation runs



\#### Submission Repository



6 integration tests cover:



\- Questions eligible at the 45-minute boundary

\- Questions older than 45 minutes

\- Recently allocated questions

\- Opened questions

\- Questions on HOLD

\- Non-time-bound sources



\## SLA and HOLD Behaviour



The tests verify that:



1\. The SLA countdown is displayed for an eligible question.

2\. Placing a question on HOLD freezes the countdown.

3\. Releasing HOLD resumes the countdown.

4\. The accumulated HOLD duration extends the SLA deadline.

5\. HOLD state and the frozen countdown persist after refreshing the page.

6\. Expired SLA values are handled without displaying malformed countdown values.



\## Time-Bound Reallocation Rules



The backend tests verify that time-bound reallocation applies to eligible `AJRASAKHA` and `WHATSAPP` questions.



A question becomes eligible when it has been allocated for at least 45 minutes and has not been opened.



The tests also verify that:



\- Opened questions are excluded.

\- Questions on HOLD are excluded.

\- Recently allocated questions are excluded.

\- Non-time-bound sources are excluded.

\- Concurrent reallocation runs are prevented.



\## Running the Tests



\### Frontend Unit Tests



From the `frontend` directory:



```powershell

pnpm test
