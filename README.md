# Reviewer System E2E (Playwright)

Tests run against a **local desk app** that mirrors Ajrasakha (Annam) — not `desk.vicharanashala.ai`. Moderator and expert login happen only on that independent app.

## Local desk

```bash
npm run app
```

Opens `http://127.0.0.1:4173` with built-in users:

| Role | Email | Password |
| --- | --- | --- |
| Moderator | `moderator@annam.local` | `Moderator@123` |
| Expert | `expert@annam.local` | `Expert@123` |

Playwright starts this app automatically via `webServer`.

## Tests

```bash
npm ci
npx playwright install chromium
npm test
```

| ID | Workflow |
| --- | --- |
| Flow 1 | Moderator login (local) → queue → allocate expert → expert notified |
| Flow 2 | Expert login → assigned question → submit answer → next reviewer notified |
| Flow 3 | Moderator approve → closed → GDB count increases |
| Scenario 4 | Stuck / delayed indicator |
| Scenario 5 | Reputation score after approve |
| Scenario 6 | Queue section counts |
| Scenario 7 | Analytics GDB figure updates |

## Explain it this way

We do not use the live Ajrasakha portal for moderator sessions. We run a standalone Reviewer System with the same screens (auth, queue, notifications, analytics) and point Playwright at localhost so QA does not need production credentials.

See [docs/BUGS.md](docs/BUGS.md) for findings from the live portal inspection.
