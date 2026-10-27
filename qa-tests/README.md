# Reviewer System QA tests

Playwright end-to-end tests for the Reviewer System's moderator and expert flows. They cover
sign-in and role-specific navigation, moderator question management, creating and allocating a
question, expert queue and answer submission, and views of existing reviewer data.

## Prerequisites

- Node.js 22 and pnpm (CI pins pnpm 10.4.1).
- Your own Firebase project and MongoDB Atlas database, configured for the local backend and
  frontend. Do not point these tests at a database you cannot safely modify.
- Test accounts for a moderator and an expert. Create them in Firebase and ensure their user
  records in MongoDB have the appropriate roles.
- Playwright's Chromium browser (install command below).

## Run the application locally

Configure the backend and frontend environment files for your Firebase project, Atlas database,
and local service URLs. In separate terminals, from the repository root:

```sh
cd backend
pnpm install
pnpm run build
pnpm start
```

The backend should be available on `http://localhost:8080`. In another terminal:

```sh
cd frontend
pnpm install
pnpm exec vite build
pnpm run serve -- --host localhost --port 5173 --strictPort
```

The frontend is served at `http://localhost:5173`. Build it before serving; the tests target
the production build rather than the Vite development server.

## Configure and run Playwright

From `qa-tests`, copy the example and edit `.env` with the moderator and expert login details:

```sh
Copy-Item .env.example .env
```

`.env.example` contains `BASE_URL`, `MODERATOR_EMAIL`, `MODERATOR_PASSWORD`, `EXPERT_EMAIL`, and
`EXPERT_PASSWORD`. Keep real credentials only in your local, ignored `.env`; never commit or
paste credentials into documentation.

Install the test dependencies and Chromium once:

```sh
npm ci
npx playwright install chromium
```

Run all tests serially, or select a spec:

```sh
npx playwright test --workers=1
npx playwright test e2e/moderator-questions.spec.ts --workers=1
npx playwright test --workers=1 --headed
```

The first run signs in both accounts and writes local Playwright storage state under
`playwright/.auth/`. Open the HTML report after a run with:

```sh
npx playwright show-report
```

Some moderator/expert dashboard and existing-data checks expect the configured database to
contain reviewer data. Tests that create questions also write to the configured database.

## Folder layout

- `e2e/` — Playwright specs for auth, navigation, moderator, expert, and end-to-end flows.
- `pages/` — page objects and reusable UI interactions.
- `fixtures/` — authentication setup that creates the moderator and expert sessions.

## CI

`.github/workflows/reviewer-e2e.yml` installs Node 22 and pnpm, builds and starts the backend
and frontend on the runner, then runs `npx playwright test --workers=1`. It runs on pull
requests, manual dispatch, and pushes to `feature/reviewer-system-e2e-tests`. The application
services are local to the runner; their configuration comes from GitHub Actions secrets.

Configure these repository secrets:

- MongoDB: `DB_URL_STAGING`, `DB_NAME_STAGING`.
- Backend Firebase: `FIREBASE_PROJECT_ID_STAGING`, `FIREBASE_CLIENT_EMAIL_STAGING`,
  `FIREBASE_PRIVATE_KEY_STAGING`.
- Frontend Firebase: `VITE_FIREBASE_API_KEY_STAGING`, `VITE_FIREBASE_AUTH_DOMAIN_STAGING`,
  `VITE_FIREBASE_PROJECT_ID_STAGING`, `VITE_FIREBASE_STORAGE_BUCKET_STAGING`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING`, `VITE_FIREBASE_APP_ID_STAGING`,
  `VITE_FIREBASE_MEASUREMENT_ID_STAGING`.
- Test logins: `MODERATOR_EMAIL`, `MODERATOR_PASSWORD`, `EXPERT_EMAIL`, `EXPERT_PASSWORD`.

The workflow uploads `reviewer-e2e-service-logs` and `reviewer-e2e-playwright-artifacts`
(Playwright report and test results) even when a run fails; artifacts are retained for 7 days.

## Known limitations

- There is no staging access for this QA setup. Tests run against a locally built stack, using
  your configured Firebase project and MongoDB Atlas database; CI also starts the app locally
  on its runner.
- The backend reallocation job is needed to advance reviewer queues during relevant flows.
  From `backend` after building, run `node build/jobs/time-bound-reallocate/run.js`.
- The moderator home page can be slow to load, especially on the Vite development server.

See the [BUGS.md](./BUGS.md) report for known findings.
