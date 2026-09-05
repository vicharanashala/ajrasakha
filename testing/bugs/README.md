# Bug Reproduction Harnesses

This directory contains the regression harnesses for the two known
issues from the roadmap:

| ID | Description                                  | PR  | Commit     | Repro                                |
|----|----------------------------------------------|-----|------------|--------------------------------------|
| 1195 | Closed-report key-set mismatch (`allUsers` vs `moderator`) | #1195 | `cc44cc371` | `bug_1195_repro.py` |
| 1204 | Bulk-pae-allocate persists alias records under `unknown` | #1204 | `b2d86022a` | `bug_1204_repro.py` |

Both commits are **post-fix** state. To demonstrate the bugs, the
checkout scripts accept `-Revert` and `git revert` the fix.

## Running

```powershell
# 1. Check out the buggy state.
pwsh -File testing/bugs/checkout-cc44cc371.ps1 -Revert
Restart-Service ...   # or restart your dev server

# 2. Run the repro.
python testing/bugs/bug_1195_repro.py --base-url http://localhost:3141

# Result lands in results/bugs/bug_1195.csv (status column).
# Expected: status=fail, detail=key-set mismatch ...
```

Repeat the same with `b2d86022a` / `bug_1204_repro.py`.

## Passing criteria

| Repro | Status=pass means …                                                                                 |
|-------|-------------------------------------------------------------------------------------------------------|
| 1195  | `POST /api/questions/closed-reports {allUsers:true}` and `{moderator:"<id>"}` return identical key sets |
| 1204  | Every `bulk_pae_allocations` document under our seed marker carries the *real* crop name (not the `unknown` placeholder) |

When run against a *fixed* build, both repros should report `status=pass`.
When run against a *buggy* (pre-fix or reverted) build, `status=fail`.
