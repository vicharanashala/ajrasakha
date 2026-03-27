# Start IMD Weather API using Poetry
# This script uses poetry to run the uvicorn server

param(
    [int]$Port = 8010,
    [string]$Host = "127.0.0.1"
)

Write-Host "Starting IMD Weather API with Poetry..." -ForegroundColor Cyan
Write-Host "Host: $Host, Port: $Port" -ForegroundColor Cyan
Write-Host ""

cd (Split-Path -Parent $MyInvocation.MyCommand.Path)

python -m poetry run python -m uvicorn api.main:app --host $Host --port $Port

Write-Host ""
Write-Host "Server stopped. Press Ctrl+C again if needed." -ForegroundColor Yellow
