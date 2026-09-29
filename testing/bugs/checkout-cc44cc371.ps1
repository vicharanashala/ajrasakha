<#
checkout-cc44cc371.ps1 — Bug-1195 checkout.

Use
---
This script checks out the backend at the buggy commit that PR #1195
addresses. Run the bug repro with:

    pwsh -File testing/bugs/checkout-cc44cc371.ps1
    python testing/bugs/bug_1195_repro.py --base-url http://localhost:3141

Notes
-----
* Reads the backend path from env var `BACKEND_DIR` (defaults to
  `<repo>/ajrasakha/backend`).
* The commit `cc44cc371` IS the post-fix state; for *demonstrating* the
  bug, revert one commit further: `git revert cc44cc371 --no-edit`.
* This script does NOT rebuild the backend. Run `npm install` and
  restart the dev server before invoking the repro.
#>
[CmdletBinding()]
param(
    [string]$BackendDir = $env:BACKEND_DIR,
    [switch]$Revert       # do `git revert cc44cc371 --no-edit` to expose the bug
)

if (-not $BackendDir) {
    $BackendDir = Join-Path $PSScriptRoot "..\..\ajrasakha\backend" | Resolve-Path
}

if (-not (Test-Path $BackendDir)) {
    throw "Backend dir '$BackendDir' not found. Set BACKEND_DIR or pass -BackendDir."
}

Push-Location $BackendDir
try {
    Write-Host "[cc44cc371] before:" (git rev-parse --short HEAD)
    git fetch --all --quiet | Out-Null
    git checkout cc44cc371 -- 2>&1 | Out-Null

    if ($Revert) {
        Write-Host "[cc44cc371] reverting fix to expose bug..."
        git revert cc44cc371 --no-edit 2>&1 | Out-Null
    }

    Write-Host "[cc44cc371] now at:" (git rev-parse --short HEAD)
    Write-Host "[cc44cc371] status:" (git status --porcelain)
    Write-Host "Reminder: run 'npm install' and restart the backend before invoking bug_1195_repro.py"
}
finally {
    Pop-Location
}
