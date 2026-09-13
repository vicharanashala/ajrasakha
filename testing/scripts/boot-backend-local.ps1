# Boots the reviewer-backend locally against the already-running:
#   - MongoDB on 127.0.0.1:27017
#   - Firebase Auth Emulator on 127.0.0.1:9099
# and waits for /api/health to return 200.
#
# Used for host-side validation of Phase 1; not part of normal Phase 2+ flow.
#
# Usage (from repo root):
#   pwsh -File testing/scripts/boot-backend-local.ps1

$ErrorActionPreference = 'Stop'
$envFile    = Join-Path $PSScriptRoot '..\docker\backend-loadtest.env'
$backendDir = Join-Path $PSScriptRoot '..\..\ajrasakha\backend'
$logFile    = Join-Path $env:TEMP 'backend-boot.log'
$healthUrl  = 'http://127.0.0.1:3141/api/health'

Write-Host "[boot] Loading env overlay from $envFile" -ForegroundColor Cyan

Get-Content $envFile | Where-Object { $_ -and ($_ -notmatch '^\s*#') } | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
    $k = $Matches[1]
    $v = $Matches[2].Trim()
    # Strip surrounding double quotes if present
    if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
    # In-container hostname 'mongo' becomes 127.0.0.1 on host-side boot.
    # Anchor the pattern so we only replace the host segment, never the 'mongo' in 'mongodb://'.
    # The lookahead matches both ':port' and '/path' so URIs with query strings work.
    if ($k -in 'DB_URL','DB_URL_ANALYTICS','ANNAM_URL_ANALYTICS') {
      $v = $v -replace '(?<=://)mongo(?=[:/])', '127.0.0.1'
    }
    Set-Item -Path "env:$k" -Value $v
  }
}

# Inject a real Firebase Admin private key from docker/firebase-sa.json if one
# isn't already present. The placeholder in backend-loadtest.env was a stub that
# the firebase-admin SDK rejects with "Too few bytes to read ASN.1 value".
$saPath = Join-Path $PSScriptRoot '..\docker\firebase-sa.json'
if ((Test-Path $saPath) -and ([string]::IsNullOrEmpty($env:FIREBASE_PRIVATE_KEY) -or $env:FIREBASE_PRIVATE_KEY -match 'BEGIN PRIVATE KEY-----')) {
  try {
    $sa = Get-Content $saPath -Raw | ConvertFrom-Json
    if ($sa.private_key) {
      # Single-line env-friendly form: literal '\n' separators, not real newlines.
      $env:FIREBASE_PRIVATE_KEY = $sa.private_key -replace "`r?`n", '\n'
      $env:FIREBASE_CLIENT_EMAIL = $sa.client_email
      Write-Host "[boot] Loaded FIREBASE_PRIVATE_KEY from $saPath ($($env:FIREBASE_PRIVATE_KEY.Length) chars)" -ForegroundColor DarkCyan
    }
  } catch {
    Write-Warning "[boot] failed to read $saPath -- backend may fail to verify tokens"
  }
}

# Auth emulator wiring
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:GCLOUD_PROJECT              = 'ajrasakha-loadtest'

# Tailscale: explicitly disable (start.sh checks for empty key)
$env:TAILSCALE_AUTHKEY = ''

Write-Host "[boot] Starting backend (build already exists). Logs: $logFile" -ForegroundColor Cyan

Push-Location $backendDir
try {
  $proc = Start-Process -FilePath "node" `
                         -ArgumentList "build/index.js" `
                         -RedirectStandardOutput $logFile `
                         -RedirectStandardError  "$logFile.err" `
                         -WindowStyle Hidden `
                         -PassThru
} finally {
  Pop-Location
}

Write-Host "[boot] PID $($proc.Id); waiting up to 60s for $healthUrl ..." -ForegroundColor Cyan

$deadline = (Get-Date).AddSeconds(60)
$healthy  = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch { }
}

if ($healthy) {
  Write-Host "[boot] HEALTHY: $healthUrl returned 200" -ForegroundColor Green
  Write-Host "[boot] Backend PID $($proc.Id) is still running. Kill with: Stop-Process -Id $($proc.Id)"
  exit 0
} else {
  Write-Host "[boot] FAILED: backend did not become healthy in 60s" -ForegroundColor Red
  Write-Host "----- last 50 log lines -----" -ForegroundColor Yellow
  if (Test-Path $logFile)     { Get-Content $logFile -Tail 25 }
  if (Test-Path "$logFile.err") { Write-Host "----- stderr -----" -ForegroundColor Yellow; Get-Content "$logFile.err" -Tail 25 }
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  exit 1
}