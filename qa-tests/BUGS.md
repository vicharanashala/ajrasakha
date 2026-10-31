# Bug report: Reviewer System frontend testing

Findings from writing Playwright E2E tests for the Reviewer System (moderator and expert flows).

## Scope and method

- **Environment:** local stack (backend on :8080, frontend on :5173, built with `vite build` for test runs), my own Firebase project and MongoDB Atlas cluster. **Not staging**, which I could not access.
- **Accounts:** one moderator and four experts, created through the signup form, then roles set in MongoDB. Some findings may depend on that setup. They are flagged below.
- **How found:** a manual walkthrough of the full flow (create question, allocate expert, expert answers, 3 approvals, moderator approves, question closes), reading the frontend and backend source for each step that stalled, and Playwright runs.
- **Confidence labels:**
  - **Confirmed**: reproduced in the UI and explained by the code.
  - **Code-read**: found in the source, not reproduced end to end.
  - **Verify**: looks wrong in a screenshot, not yet checked against the source.

## Summary

| ID | Title | Severity | Confidence |
|---|---|---|---|
| B-01 | Example env files point the frontend at the wrong port | Medium | Confirmed |
| B-02 | Backend does not start with the example env | Medium | Confirmed |
| B-03 | Frontend `build` script fails type-check (572 errors) | Medium | Confirmed |
| B-04 | Dead handler uses undefined identifiers | Low | Confirmed |
| B-05 | Source URL validation accepts any host containing "zoho" and "workdrive" | Medium | Confirmed |
| B-06 | Moderator not assignable without `special_task_force: true`, no explanation in UI | Medium | Confirmed (setup-dependent) |
| B-07 | "Ready for your approval" notification sent with no moderator assigned | Medium | Confirmed once |
| B-08 | Manually assigning a moderator sends no notification | Low | Code-read |
| B-09 | Reviewer hand-off for manual-source questions stalls under several conditions | Medium | Confirmed |
| B-10 | Moderator auto-assignment outcomes are only logged to the server console | Low | Code-read |
| B-11 | No confirmation that an approved Q&A entered the Golden Database | Low | Confirmed |
| B-12 | Dashboard figures that disagree with each other | Medium | Verify |
| B-13 | Console flooded with `useToast() called outside <ToastProvider />` | Low | Confirmed |
| B-14 | Moderator home page is slow to render | Medium | Measured once |
| B-15 | Backend dev script races on first start | Low | Confirmed |
| B-16 | First-run data gaps (states, districts) and install pitfalls | Low | Confirmed |
| B-17 | Backend development-mode email-verification bypass is unreachable from the UI | Low | Code-read |
| B-18 | "No questions found" is rendered twice | Low | Confirmed |
| B-19 | Page and card titles are not semantic headings | Low | Confirmed |
| B-20 | My Queue may open on rerouted questions instead of allocated questions | Low | Code-read |

## Details

### B-01 Example env files point the frontend at the wrong port
- **Steps:** copy `frontend/.env.example` to `.env`, start both servers, try to sign up.
- **Expected:** the request reaches the backend.
- **Actual:** "Failed to fetch". `VITE_API_BASE_URL` in the example is `http://localhost:3141/api`, and the startup summary prints `App URL: http://localhost:3141`, but the server listens on `PORT || APP_PORT || 8080`, which is 8080.
- **Source:** `backend/src/index.ts` (`.listen(appConfig.port)`), `backend/src/config/app.ts`.
- **Suggested fix:** align the examples with the real port, or log the actual listening port.

### B-02 Backend does not start with the example env
- **Steps:** copy `backend/.env.example` to `.env`, fill the Firebase and DB values, run `pnpm run dev`.
- **Actual:** the process crashes at startup in two ways:
  - `TypeError: Cannot read properties of null (reading 'startsWith')`, because `ANNAM_URL_ANALYTICS` (and `ANNAM_DB_ANALYTICS`, `DB_URL_ANALYTICS`, `DB_NAME_ANALYTICS`) are read by the code but missing from `.env.example`.
  - `Vapid public key should be 65 bytes long when decoded.`, because the example contains placeholder VAPID values.
- **Suggested fix:** add the missing variables to the example and make startup fail with a clear message naming the variable.

### B-03 Frontend `build` script fails type-check
- **Steps:** `cd frontend && pnpm run build` (script is `vite build && tsc`).
- **Actual:** `tsc` reports **572 errors in 133 files** and the command exits with code 2. The bundle is still produced by `vite build`, which runs first.
- **Examples:** `Property 'userName' does not exist on type 'IUser'` (`ReRouteDialog.tsx`, `ReroutePaeDialog.tsx`); `Property 'currentExpertAllocatedAt' does not exist on type 'ISubmission'` (`AllocationTimeline.tsx`); `Property 'pae_review' does not exist on type 'IQuestionFullData'` (`AnswerTimeline.tsx`).
- **Impact:** any pipeline that uses the repo's own build script will fail.
- **Note:** I could not check whether these errors pre-date my work. I did not edit the frontend source files named above.

### B-04 Dead handler uses undefined identifiers
- **Where:** `frontend/src/features/question-table-page/DistrictAliasModal.tsx`, `handleDownloadStateReport`.
- **Actual:** it calls `setIsDownloadingCrops` and `cropService`, which are not defined in the file, and the function is never used. Calling it would throw a `ReferenceError`. Looks like copy-paste leftover.

### B-05 Source URL validation accepts any host containing "zoho" and "workdrive"
- **Steps:** as an expert, open an allocated question, add a source reference with a non-Zoho URL (rejected with "Only Zoho WorkDrive URLs are allowed"), then add `https://workdrive.zoho.com/fake-local-test`.
- **Actual:** the fake, non-existent URL is accepted and the answer is submitted. The check parses the URL and tests `hostname.includes("zoho") && hostname.includes("workdrive")`, so `https://zoho-workdrive.invalid/test` would pass too.
- **Source:** `frontend/src/components/source-url-manager.tsx`, `MessageDetail.tsx`.
- **Impact:** unverifiable sources can enter reviewed answers.
- **Not checked:** whether the backend validates the link again.

### B-06 Moderator not assignable without `special_task_force: true`, no explanation in UI
- **Steps:** on a question in review, open the Moderator tab and click Select Moderator.
- **Actual:** "No moderators available". The backend log shows `[ModeratorQueue] No available moderators for either category`. The picker (`GET /users/stf-moderators`) and the automatic assignment only consider moderators with `special_task_force: true`. My moderator's `users` document had no such field. After adding it, the picker listed the moderator and assignment worked.
- **Caveat:** I set the role by editing MongoDB, so a normally promoted moderator may get this field set. I did not test the admin promotion flow.
- **Impact:** the UI gives no hint about why there are no moderators.

### B-07 "Ready for your approval" notification sent with no moderator assigned
- **Steps:** bring a question to 3 approvals with no moderator assigned.
- **Actual:** the moderator account received "A question is ready for your approval", while the question's Moderator tab said "No Moderator Assigned" and no approve action was available. Opening the notification did not take me to the question in my run.
- **Note:** seen once, not retested.

### B-08 Manually assigning a moderator sends no notification
- **Code-read:** `PATCH /questions/:id/moderator` calls `changeQuestionModerator`, which saves the moderator and adds the question to their assigned list. I found no notification call in that path, while the automatic path notifies. I only checked that one function.

### B-09 Reviewer hand-off for manual-source questions stalls under several conditions
Questions created from the Manual tab have source `AGRI_EXPERT`. Observed with a local setup where the scheduled job is run by hand (`node build/jobs/time-bound-reallocate/run.js`):
- **Pre-selected queue stalls.** Selecting several experts at once via Select Experts gives `queue.length = 3, history.length = 1`. The job's query requires `history.length >= queue.length`, so it reports `NeedReviewer: 0` and reviewers 2 and 3 never receive the question. It worked after allocating only one expert first.
- **Hidden flag.** The job only handles questions with `isAutoAllocate: true`. The "Auto-allocate Experts" toggle is off by default, and a moderator who picks an expert manually has no hint that it matters.
- **Silent no-op.** Bulk auto-allocate is deliberately disabled for these sources. Toggling it gives no feedback.
- **External dependency.** The in-process cron is disabled (`ENABLE_INPROCESS_CRON = false`); production relies on Cloud Scheduler. Until the job runs, the next reviewer's My Queue is empty, with no indication to the moderator that nobody was notified.
- **Code-read:** the My Queue query (`getAllocatedQuestions`) excludes questions whose status is `in-review` and has no case for "next reviewer whose turn has arrived but who has not acted yet".

### B-10 Moderator auto-assignment outcomes are only logged to the server console
- **Code-read:** `triggerModeratorQueueAllocation` is fire-and-forget with `.catch(err => console.error(...))`. The UI says "One will be assigned automatically" even when no eligible moderator exists.

### B-11 No confirmation that an approved Q&A entered the Golden Database
- **Steps:** approve a question with 3 approvals.
- **Actual:** status changes to `closed`. No message mentions the Golden Database. The Dashboard's "Golden Dataset Analytics" did show Verified Entries 1 and "View moderator Approvals (1)" afterwards, so the data appears recorded, but the moderator cannot confirm it from the question.

### B-12 Dashboard figures that disagree with each other (Verify)
Observed in screenshots on different days. Each one needs a re-check before being treated as a defect:
1. The All Questions list showed four questions as `delayed`, while Question Status Overview showed `open 4, delayed 0, in-review 0`. Check whether the overview has its own date filter.
2. The Questions and Answers analytics table and crop breakdown showed 4 Tomato questions, while the list had 5.
3. Golden Dataset Analytics put the verified entry in September (bars: Sep total 4 / verified 1; Oct total 1 / verified 0), while the approval happened on 19 Oct. It may group by creation date.
4. Role Overview showed "STF Moderators: 0" while the moderator's own profile showed STF: Yes.
5. Working Hours Trend showed about 500 hours for October by the 22nd, more than one person can work.

### B-13 Console flooded with `useToast() called outside <ToastProvider />`
- Seen many times per page load in the browser console (`AgriToast: useToast() called outside <ToastProvider />. Using no-op fallback.`). Toasts from those components are silently dropped. I saw the console message, not the user-visible effect.

### B-14 Moderator home page is slow to render
- Measured once on a production build: about 15 API calls on load; slowest were `performance/heatMapofReviewers` (about 2.8 s) and three `shift-based-*` endpoints (about 2.3 s each); about 8.6 s until the header tabs appeared. On the Vite dev server it was much slower.
- Several moderator tests needed a 90 s timeout. Part of this may be network latency to a free-tier Atlas cluster.

### B-15 Backend dev script races on first start
- `pnpm run dev` runs `concurrently "watch:compile" "watch:build"`. On a clean checkout, nodemon starts before `tsc` has written `build/index.js` and crashes with `Cannot find module '.../build/index.js'`. In my run it stayed crashed until I restarted.

### B-16 First-run data gaps and install pitfalls
- The State and District dropdowns in Add New Question are empty until the LGD scripts (`backend/scripts/create-lgd-*.mjs`) are run, which need a data.gov.in API key. The API returned HTTP 429 for about 16 states partway through, so the script had to be rerun.
- `npm install` fails with `EUNSUPPORTEDPROTOCOL "link:"`. The repo needs pnpm, which the README does not say. I did not check every README.

### B-17 Backend development-mode email-verification bypass is unreachable from the UI
- **Code-read:** `POST /auth/login` skips the email-verified check when `NODE_ENV=development`, but the frontend signs in through the Firebase client SDK, which enforces verification itself. The backend bypass never applies to a UI login.

### B-18 "No questions found" is rendered twice
- A strict-mode locator for the empty-state text matched two elements: a table cell (`<td colspan="11">`) and a `<p>`. I did not check whether one is hidden. If both are visible, the text appears twice.

### B-19 Page and card titles are not semantic headings
- **Actual:** "Welcome Back", "Golden Dataset Analytics", and "Question Status Overview" are `CardTitle` components rendered as `div` elements rather than headings. Heading navigation skips these titles.
- **Source:** `frontend/src/features/auth/components/AuthCardHeader.tsx`, `frontend/src/components/dashboard/golden-dataset.tsx`, and `frontend/src/components/dashboard/question-status.tsx`.
- **Confidence:** Confirmed.

### B-20 My Queue may open on rerouted questions instead of allocated questions
- **Code-read:** the expert's My Queue opens on "ReRouted Questions" and only switches to "Allocated Questions" if the rerouted list is empty. An expert with any rerouted item may not see newly allocated questions.
- **Source:** `frontend/src/features/qa-interface-page/QA-interface.tsx` and `frontend/src/features/qa-interface-page/QuestionList.tsx`.

## Not confirmed (noted for follow-up)
- A blank page appeared once at `localhost:5173` while the console showed `net::ERR_BLOCKED_BY_CLIENT` on an `...ics.js` file, probably an ad blocker stopping Firebase Analytics. An automated reload later rendered the login page. Not reproduced.
- The moderator's name shows as "divimano2007sdsdsd" in the Moderator Queue and as "divimano2007" in the tab and profile.