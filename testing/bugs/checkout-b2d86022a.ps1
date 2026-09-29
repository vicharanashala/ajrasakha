<#
checkout-b2d86022a.ps1 — Bug-1204 checkout.

Use
---
This script checks out the backend at the buggy commit that PR #1204
addresses. Run the bug repro with:

    pwsh -File testing/bugs/checkout-b2d86022a.ps1 -Revert
    python testing/bugs/bug_1204_repro.py

Notes
-----
* `b2d86022a` IS the post-fix state. Pass `-Revert` to demonstrate the
  bug (revert the fix commit, not the underlying regression).
* Pauses for `npm install` if `node_modules` is absent.
#>
[CmdletBinding()]
param(
    [string]$BackendDir = $env:BACKEND_DIR,
    [switch]$Revert
)

if (-not $BackendDir) {
    $BackendDir = Join-Path $PSScriptRoot "..\..\ajrasakha\backend" | Resolve-Path
}

if (-not (Test-Path $BackendDir)) {
    throw "Backend dir '$BackendDir' not found. Set BACKEND_DIR or pass -BackendDir."
}

Push-Location $BackendDir
try {
    Write-Host "[b2d86022a] before:" (git rev-parse --short HEAD)
    git fetch --all --quiet | Out-Null
    git checkout b2d86022a -- 2>&1 | Out-Null

    if ($Revert) {
        Write-Host "[b2d86022a] reverting fix to expose bug..."
        git revert b2d86022a --no-edit 2>&1 | Out-Null
    }

    Write-Host "[b2d86022a] now at:" (git rev-parse --short HEAD)
    if (-not (Test-Path "node_modules")) {
        Write-Host "[b2d86022a] WARN: node_modules missing. Run 'npm install' before starting the backend."
    }
}
finally {
    Pop-Location
}
