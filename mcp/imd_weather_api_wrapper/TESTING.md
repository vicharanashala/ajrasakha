# IMD Weather API Wrapper — Testing Guide

This document contains all commands to start, test, and stop your IMD Weather API using Poetry.

---

## Quick Start

### Start the Server (Poetry)

```powershell
cd "E:\VS Code\ajrasakha\mcp\imd_weather_api_wrapper"
python -m poetry run python -m uvicorn api.main:app --host 127.0.0.1 --port 8010
```

Keep this terminal open. Server runs on `http://127.0.0.1:8010`

---

## Testing Commands

### Option 1: Run Smoke Test Script (Easiest — 11 endpoints at once)

Open a **new terminal** and run:

```powershell
cd "E:\VS Code\ajrasakha\mcp\imd_weather_api_wrapper"
powershell -ExecutionPolicy Bypass -File .\run_curl_smoke_test.ps1 -BaseUrl "http://127.0.0.1:8010"
```

**Output:** PASS/FAIL summary for all 11 endpoints.

---

### Option 2: Individual Curl Commands

#### Health Check
```powershell
curl.exe "http://127.0.0.1:8010/"
curl.exe "http://127.0.0.1:8010/health"
```

#### City Forecast
```powershell
curl.exe --get "http://127.0.0.1:8010/weather/city-forecast" `
  --data-urlencode "city=Delhi" `
  --data-urlencode "state=Delhi"
```

#### District Forecast
```powershell
curl.exe --get "http://127.0.0.1:8010/weather/district-forecast" `
  --data-urlencode "district=Aligarh" `
  --data-urlencode "state=Uttar Pradesh"
```

#### Rainfall Forecast
```powershell
curl.exe --get "http://127.0.0.1:8010/weather/rainfall-forecast" `
  --data-urlencode "district=Aligarh" `
  --data-urlencode "state=Uttar Pradesh" `
  --data-urlencode "days=3"
```

#### Current Weather
```powershell
curl.exe --get "http://127.0.0.1:8010/weather/current" `
  --data-urlencode "city=Pune" `
  --data-urlencode "state=Maharashtra"
```

#### Nowcast
```powershell
curl.exe --get "http://127.0.0.1:8010/weather/nowcast" `
  --data-urlencode "district=Nagpur" `
  --data-urlencode "state=Maharashtra"
```

#### Agromet Advisory
```powershell
curl.exe --get "http://127.0.0.1:8010/weather/agromet-advisory" `
  --data-urlencode "district=Ludhiana" `
  --data-urlencode "state=Punjab" `
  --data-urlencode "crop=Wheat"
```

#### Full Profile (All 6 endpoints)
```powershell
curl.exe --get "http://127.0.0.1:8010/weather/full-profile" `
  --data-urlencode "city=Lucknow" `
  --data-urlencode "district=Lucknow" `
  --data-urlencode "state=Uttar Pradesh" `
  --data-urlencode "crop=Paddy"
```

#### Router — Single Query
```powershell
curl.exe --get "http://127.0.0.1:8010/router/query" `
  --data-urlencode "q=will it rain tomorrow in my district"
```

#### Router — Batch Query (POST)
```powershell
curl.exe -X POST "http://127.0.0.1:8010/router/batch" `
  -H "Content-Type: application/json" `
  -d '["will it rain tomorrow in Aligarh","current weather in Pune","crop loss due to hailstorm"]'
```

---

### Option 3: Browser GUI (Interactive Swagger UI)

1. Server must be running
2. Open in browser:
   ```
   http://127.0.0.1:8010/docs
   ```
3. Browse all endpoints and test interactively

---

## Stop the Server

Press **Ctrl + C** in the terminal running the server.

Or force-stop via PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8010 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

---

## Poetry vs Requirements.txt

### Using Poetry (Current Setup)

**Start server:**
```powershell
python -m poetry run python -m uvicorn api.main:app --host 127.0.0.1 --port 8010
```

**Why Poetry?**
- Locked dependencies in `poetry.lock`
- Reproducible environments
- Automatic virtual environment management
- Better for production

**Files:**
- `pyproject.toml` — Project config + dependencies
- `poetry.lock` — Locked versions

---

### Using Requirements.txt (Old Method)

**Activate venv:**
```powershell
.\.venv\Scripts\Activate.ps1
```

**Start server:**
```powershell
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010
```

---

## Project Structure

```
imd_weather_api_wrapper/
├── api/
│   ├── __init__.py
│   └── main.py              ← FastAPI app (15 routes)
├── wrapper/
│   ├── __init__.py
│   ├── client.py            ← IMDClient (6 methods)
│   ├── router.py            ← Query router
│   ├── config.py            ← KCC analysis data
│   └── api_mapping.py       ← Lookup functions
├── pyproject.toml           ← Poetry config (Poetry)
├── poetry.lock              ← Locked dependencies (Poetry)
├── requirements.txt         ← Old pip format (optional)
├── run_curl_smoke_test.ps1  ← Smoke test script
└── run_server_poetry.ps1    ← Poetry server launcher
```

---

## Endpoints Summary

| Method | Path | Priority | KCC Queries |
|---|---|---|---|
| GET | `/` | — | Health check |
| GET | `/health` | — | Detailed health |
| GET | `/weather/city-forecast` | CRITICAL | 13,706,092 |
| GET | `/weather/district-forecast` | HIGH | 1,335,570 |
| GET | `/weather/rainfall-forecast` | MEDIUM | 248,633 |
| GET | `/weather/current` | MEDIUM | 180,855 |
| GET | `/weather/nowcast` | LOW | 57,084 |
| GET | `/weather/agromet-advisory` | LOW | 21,655 |
| GET | `/weather/full-profile` | ALL | 15,549,889 |
| GET | `/router/query` | — | Route single query |
| POST | `/router/batch` | — | Route batch queries |
| GET | `/analysis/cluster/{id}` | — | Cluster → endpoint mapping |
| GET | `/analysis/need/{name}` | — | Farmer need → endpoint |
| GET | `/analysis/mapping` | — | All 59 clusters mapped |
| GET | `/analysis/needs` | — | All 6 farmer needs |

---

## Troubleshooting

**Q: Server won't start?**  
A: Make sure you're in the correct folder and Poetry is installed.

```powershell
python -m pip install poetry
```

**Q: "Connection refused" on curl?**  
A: Server is not running. Start it first in another terminal.

**Q: Want to use requirements.txt instead of Poetry?**  
A: Run:
```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010
```

---

Generated: March 27, 2026
