# =============================================================================
# testing/scripts/run.ps1
# -----------------------------------------------------------------------------
# Single entrypoint for the Project 7 load & SLA toolchain on Windows.
# Cross-platform equivalent: `make` (GNU Make).
#
# Subcommands:
#   up       — docker compose up -d the testbed (mongo + auth-emu + backend)
#   down     — stop + remove containers (preserves mongo-data volume)
#   nuke     — down + remove the mongo-data volume
#   seed     — install Node deps for seed/ + run seed_all.mjs
#   clear    — drop every loadtest-tagged document
#   smoke    — run scripts/smoke.mjs against http://localhost:3141
#   logs     — tail the reviewer-backend container
#   status   — docker ps + curl /api/health
#
# Usage examples:
#   pwsh -File testing/scripts/run.ps1 up
#   pwsh -File testing/scripts/run.ps1 seed
#   pwsh -File testing/scripts/run.ps1 smoke
# =============================================================================

param(
  [Parameter(Mandatory = $true)][ValidateSet('up','down','nuke','seed','clear','smoke','logs','status','deps')]
  [string]$Cmd
)

$RepoRoot    = Resolve-Path "$PSScriptRoot/../.."
$Testing     = Resolve-Path "$PSScriptRoot/.."
$DockerDir   = Join-Path $Testing 'docker'
$EnvFile     = Join-Path $DockerDir 'backend-loadtest.env'

function Step([string]$m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host "  ✓ $m" -ForegroundColor Green }
function Bad([string]$m)  { Write-Host "  ✗ $m" -ForegroundColor Red }

switch ($Cmd) {
  'deps' {
    Step 'install Node deps for testing/seed'
    Push-Location $Testing
    if (-not (Test-Path 'node_modules')) {
      npm install | Out-Host
    } else { Ok 'node_modules already present' }
    Pop-Location
  }

  'up' {
    Step 'docker compose up -d'
    Push-Location $DockerDir
    if (-not (Test-Path $EnvFile)) { Bad "missing $EnvFile"; exit 1 }
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { Bad 'docker compose up failed'; exit $LASTEXITCODE }
    Pop-Location
    Step 'waiting for /api/health'
    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
      try {
        $h = Invoke-WebRequest -Uri 'http://localhost:3141/api/health' -UseBasicParsing -TimeoutSec 3
        if ($h.StatusCode -eq 200) { Ok "backend healthy: $($h.Content)"; return }
      } catch { Start-Sleep -Seconds 2 }
    }
    Bad 'backend never became healthy — run: docker compose logs reviewer-backend'
    exit 1
  }

  'down' {
    Step 'docker compose down'
    Push-Location $DockerDir
    docker compose down
    Pop-Location
  }

  'nuke' {
    Step 'docker compose down -v'
    Push-Location $DockerDir
    docker compose down -v
    Pop-Location
  }

  'seed' {
    Step 'installing/testing deps'
    & $PSCommandPath -Cmd deps
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Step 'seed_all.mjs'
    Push-Location $Testing
    $env:FIREBASE_EMULATOR_HOST = 'localhost:9099'
    node seed/seed_all.mjs
    if ($LASTEXITCODE -ne 0) { Bad 'seed failed'; exit $LASTEXITCODE }
    Pop-Location
  }

  'clear' {
    Step 'drop loadtest docs'
    Push-Location $Testing
    node seed/clear.mjs
    Pop-Location
  }

  'smoke' {
    Step 'smoke.mjs'
    Push-Location $Testing
    node scripts/smoke.mjs
    Pop-Location
  }

  'logs' {
    Push-Location $DockerDir
    docker compose logs -f reviewer-backend
    Pop-Location
  }

  'status' {
    Push-Location $DockerDir
    docker compose ps
    Pop-Location
    try {
      $h = Invoke-WebRequest -Uri 'http://localhost:3141/api/health' -UseBasicParsing -TimeoutSec 3
      Ok "/api/health → $($h.StatusCode) $($h.Content)"
    } catch { Bad '/api/health unreachable' }
  }
}