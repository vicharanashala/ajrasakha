<#
run-locust-10x.ps1 — 10× overload.

Pre-flight
----------
10× is expected to breach at least one of {S1, S2, S5, S6} — that is the
intended outcome. The `error_budget.sla_pass` column in the aggregated
CSV will record `False`, which is what the report wires to "10× breach".
#>
[CmdletBinding()]
param(
    # Renamed from `$Host` → `$HostUrl` for Windows PowerShell 5.1 compat.
    [string]$HostUrl     = $(if ($env:LOCUST_HOST) { $env:LOCUST_HOST } else { "http://localhost:3141" }),
    [string]$LoadProfile = "squash_p95",
    [string]$RunFor      = "15m",
    [string]$ResultsDir  = "results/10x_locust"
)

$ErrorActionPreference = "Stop"

$RepoRoot     = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LocustDir    = Resolve-Path (Join-Path $RepoRoot "testing\locust")
$ResultAbsDir = Resolve-Path (Join-Path $RepoRoot $ResultsDir) -ErrorAction SilentlyContinue
if (-not $ResultAbsDir) {
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot $ResultsDir) | Out-Null
    $ResultAbsDir = Resolve-Path (Join-Path $RepoRoot $ResultsDir)
}

$Env:PYTHONPATH = "$LocustDir;$Env:PYTHONPATH"
$Env:LOCUST_HOST = $HostUrl
$Env:LOAD_PROFILE = $LoadProfile
$Env:RESULTS_DIR = $ResultAbsDir
# Point reconcile_reputation.py at the same single-node replica set the
# backend uses. Without these, the S6 drift check silently queries a
# non-existent DB on port 27017 and reports every snapshot as drifted.
if (-not $env:DB_URL)  { $env:DB_URL  = 'mongodb://127.0.0.1:27018/?replicaSet=rs0' }
if (-not $env:DB_NAME) { $env:DB_NAME = 'agriai_loadtest' }

Write-Host "[run-locust-10x] host=$HostUrl profile=$LoadProfile time=$RunFor out=$ResultAbsDir"

Push-Location $RepoRoot
try {
    python "$LocustDir\scenarios\10x.py"
    if ($LASTEXITCODE -ne 0) {
        throw "Locust 10x scenario exited with $LASTEXITCODE"
    }
    & python (Join-Path $PSScriptRoot "reconcile_reputation.py") --scenario 10x_locust
    & (Join-Path $PSScriptRoot "aggregate_results.py") --scenario 10x_locust
}
finally {
    Pop-Location
}
