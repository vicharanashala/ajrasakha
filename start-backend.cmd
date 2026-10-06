@echo off
rem Ajrasakha - start backend API (self-healing PATH, works in any terminal)
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0backend"
echo [Ajrasakha] Starting backend (API port comes from backend\.env APP_PORT) ...
node -v
pnpm dev
pause
