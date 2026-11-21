@echo off
rem Ajrasakha - start frontend dev server (self-healing PATH, works in any terminal)
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0frontend"
echo [Ajrasakha] Starting frontend on http://localhost:5173 ...
node -v
pnpm dev
pause
