@echo off
echo ===================================================
echo   Starting Ajrasakha Backend and Frontend...
echo ===================================================

start "Ajrasakha Backend (Port 3141)" cmd /k "cd backend && pnpm dev"
start "Ajrasakha Frontend (Port 5173)" cmd /k "cd frontend && pnpm dev"

echo.
echo Both servers are launching in separate windows!
echo - Frontend: http://localhost:5173
echo - Backend:  http://localhost:3141/api
echo.

