<#
run-locust-1x.ps1 — 1× baseline Locust run.

Usage
-----
    pwsh -File testing/scripts/run-locust-1x.ps1
or, with explicit host and env:
    pwsh -File testing/scripts/run-locust-1x.ps1 -Host http://localhost:3141 `
         -LoadProfile moderate -RunFor 60m

Side-effects
------------
* Writes `results/1x_locust/requests.csv`, `assertions.csv`, `queue_lengths.csv`,
  `reputation_snapshots.csv`, `run_manifest.csv`.
* Appends a summary row to `results/aggregated/_runs.csv`.

Pre-flight
----------
* The backend (`run.ps1`) and the seed must be live.
* MongoDB must be a single-node replica set (sockets/transactions).
* `pip install -r testing/locust/requirements.txt` must already be done.
#>
[CmdletBinding()]
param(
    # NOTE: Renamed from `$Host` → `$HostUrl`. PowerShell 5.1 (the default
    # `powershell.exe`) has `$Host` as a read-only automatic variable, so
    # binding that name fails outright. pwsh 7.x tolerates it, but the
    # rename keeps the script portable across both runtimes.
    [string]$HostUrl        = $(if ($env:LOCUST_HOST) { $env:LOCUST_HOST } else { "http://localhost:3141" }),
    [string]$LoadProfile    = "moderate",
    [string]$RunFor         = "60m",
    [string]$ResultsDir     = "results/1x_locust"
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

Write-Host "[run-locust-1x] host=$HostUrl profile=$LoadProfile time=$RunFor out=$ResultAbsDir"

Push-Location $RepoRoot
try {
    python "$LocustDir\scenarios\1x.py"
    if ($LASTEXITCODE -ne 0) {
        throw "Locust 1x scenario exited with $LASTEXITCODE"
    }
    # Snapshot-vs-live reputation reconciliation (S6). Must run BEFORE
    # aggregate_results.py so the REP_DRIFT count is appended to
    # assertions.csv in time for aggregate's SLA summary to consume it.
    & python (Join-Path $PSScriptRoot "reconcile_reputation.py") --scenario 1x_locust
    & (Join-Path $PSScriptRoot "aggregate_results.py") --scenario 1x_locust
}
finally {
    Pop-Location
}
