@echo off
echo ===================================================
echo   Starting Ajrasakha Presentation Environment...
echo ===================================================

cd /d "%~dp0"

echo.
echo [1/3] Starting AI Agent Server (LangGraph)...
start "Ajrasakha - AI Agent Server" cmd /k "cd ai && .venv\Scripts\python.exe -m langgraph_cli dev --port 2026 --no-browser --allow-blocking"

echo [2/3] Starting Backend API Server (Express)...
start "Ajrasakha - Backend Server" cmd /k "cd backend && npm run dev"

echo [3/3] Starting Frontend UI (React/Vite)...
start "Ajrasakha - Frontend UI" cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo All 3 servers are starting in separate windows!
echo Please wait 10-15 seconds for them to fully boot up.
echo.
echo Your presentation UI will be available at:
echo http://localhost:5173
echo ===================================================
pause
