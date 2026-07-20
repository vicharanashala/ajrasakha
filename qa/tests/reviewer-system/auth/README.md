# Reviewer System — Auth (`tests/reviewer-system/auth/`)

End-to-end coverage of the authentication contract for every role in the
Reviewer System: moderator, expert, peer-reviewer, coordinator.

This PR (#1) puts the **scaffolding** in place — folder, page object
(`LoginPage`), fixtures (`auth-fixtures.ts`), and environment-variable
loading.  The actual cross-role login matrix lands in **PR #2** alongside
the Expert flow.

## Planned coverage (PR #2)

| # | Behaviour | Notes |
|---|-----------|-------|
| AUTH-01 | Moderator login happy path | **MOD-01 in PR #1 — already covered** |
| AUTH-02 | Moderator login fails gracefully | **MOD-02 in PR #1 — already covered** |
| AUTH-03 | Expert login happy path | PR #2 |
| AUTH-04 | Reviewer login happy path | PR #2 |
| AUTH-05 | Coordinator login happy path | PR #3 |
| AUTH-06 | Logout clears session + storage | **MOD-10 in PR #1 — already covered** |
| AUTH-07 | Password-reset flow | PR #4 |

## Files in this folder

```
auth/
└── README.md
```

> Folder is intentionally empty until PR #2 lands so the structure is
> visible in `tree` output and a future spec drop doesn't need to move
> files across directories.