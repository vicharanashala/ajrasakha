# Bugs found while writing E2E tests

Target: `https://desk.vicharanashala.ai` (Ajrasakha / Annam Review system). Recorded 2026-09-09 from an unauthenticated session plus client-bundle inspection. Severity is an intern-QA estimate, not a formal pentest result.

## High

### Client runtime config exposes telephony credentials

`/runtime-config.js` is a public script. It includes Plivo endpoint usernames and passwords for multiple agents, in addition to Firebase web config.

**Why it matters:** Anyone who loads the desk can read those values. That can affect voice/notification infrastructure that reviewers and farmers depend on.

**Suggested fix:** Move secrets to a server-only store. Rotate the published Plivo passwords. Keep only non-secret public keys in the browser bundle.

## Medium

### No `data-testid` (or equivalent) on primary auth controls

Login, signup, and reset use labels and placeholders only. Password visibility toggles have **no accessible name**. Queue/allocate/approve controls will be similarly brittle for automation.

**Suggested fix:** Add stable `data-testid` values for auth, queue rows, allocate expert, submit answer, approve/close, stuck indicator, reputation, queue counts, and analytics widgets.

### Email fields are not `required`

Login and reset password inputs are `type="email"` but HTML5 `validity.valid` is **true** when they are empty. Empty Sign In / Send Reset Link does not use native constraint validation. The SPA still stays on `/auth`; client-side messaging should be checked with credentials and a network tab.

**Suggested fix:** Add `required` (and visible error text) on email/password.

### Protected-route redirect is asynchronous

Visiting `/home/` (and other app routes) while logged out eventually lands on `/auth`, but the first paint can be an empty `#app` shell. Tests must wait for the email field, not only the URL.

## Low

### Auth title vs brand copy mismatch

Document title is **Ajrasakha - Review system**. Visible product name on the card is **Annam**. That is not a functional bug, but it confuses testers and farmers looking at browser tabs.

### Signup vs login field set

Signup includes Full Name, Confirm Password, and two unlabeled eye buttons. Worth a visual QA pass on smaller viewports (the card is dense).

## Not yet verified (needs moderator + expert staging users)

These are the intern brief risks; they need logged-in runs:

1. Expert notification after moderator allocation
2. Next-reviewer notification after expert submit
3. Closed status and Golden Database (GDB) write after final approve
4. Stuck-question indicator after the expert SLA window
5. Reputation score change after a review action
6. Queue details counts matching each section
7. Analytics figures updating after pipeline actions

Add findings here after the first credentialed run (`npm test` with `.env` filled).
