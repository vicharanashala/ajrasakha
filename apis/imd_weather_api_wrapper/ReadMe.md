# IMD API Wrapper

A production-ready REST API wrapper for India Meteorological Department (IMD) weather endpoints, built from analysis of **15,549,889 farmer weather queries** from the KCC dataset.

The 6 endpoints exposed by this wrapper were selected by clustering 15.5M farmer queries into 59 clusters, then mapping those clusters to the IMD APIs that best serve each farmer need.

---

## Project Structure

```
imd_api_wrapper/
│
├── api/
│   ├── __init__.py          ← empty file, makes api/ a Python package
│   └── main.py              ← FastAPI application, all 15 routes
│
├── wrapper/
│   ├── __init__.py          ← re-exports IMDClient, route_query etc.
│   ├── config.py            ← all KCC analysis constants (59 clusters)
│   ├── api_mapping.py       ← cluster/need lookup functions
│   ├── client.py            ← IMDClient with 6 methods + mock engine
│   └── router.py            ← text query → endpoint router
│
├── app.py                   ← direct Jupyter usage without server
├── run_api.py               ← FastAPI Jupyter runner cells
├── requirements.txt         ← Python dependencies
├── WORKING.md               ← step-by-step testing commands
└── README.md                ← this file
```

---

## File Roles

### `wrapper/config.py`
**The data layer.** Contains every number from the KCC 15.5M analysis as Python dictionaries. No logic — only reference data.

Stores:
- `ENDPOINTS` — 6 IMD URL slugs
- `FRESHNESS_MINUTES` — update frequency per endpoint
- `PRIORITY` — CRITICAL / HIGH / MEDIUM / LOW per endpoint
- `FARMER_NEED` — human-readable need label per endpoint
- `TOTAL_QUERIES_PER_NEED` — KCC query count per farmer need
- `TOTAL_WEATHER_QUERIES` — 15,549,889
- `CLUSTER_TO_NEED` — maps all 59 clusters to 1 of 6 farmer needs
- `NEED_TO_ENDPOINT` — maps each farmer need to its endpoint key
- `CLUSTER_QUERY_COUNTS` — exact query count per cluster

Every other file imports from `config.py`. Nothing else.

---

### `wrapper/api_mapping.py`
**The lookup layer.** Provides functions to query the config data in a structured way.

| Function | What it returns |
|---|---|
| `get_endpoint_for_cluster(id)` | endpoint, priority, query count for one cluster |
| `get_endpoint_for_need(name)` | endpoint, priority, coverage % for one farmer need |
| `get_full_mapping_table()` | all 59 clusters as a list of dicts |
| `get_need_summary()` | all 6 farmer needs sorted by query volume |

Used by `api/main.py` to serve the `/analysis/*` routes.

---

### `wrapper/client.py`
**The API layer.** Contains `IMDClient` — the class that makes the actual weather data requests. Currently runs in **mock mode**, which generates realistic season-aware responses without needing real credentials.

| Method | Farmer Need | KCC Queries | Priority |
|---|---|---|---|
| `get_city_forecast(city, state)` | General Weather Forecast | 13,706,092 | CRITICAL |
| `get_district_forecast(district, state)` | District Weather Forecast | 1,335,570 | HIGH |
| `get_rainfall_forecast(district, state, days)` | Rain Forecast | 248,633 | MEDIUM |
| `get_current_weather(city, state)` | Current Weather Condition | 180,855 | MEDIUM |
| `get_nowcast(district, state)` | Short Term Forecast | 57,084 | LOW |
| `get_agromet_advisory(district, state, crop)` | Weather Impact on Crops | 21,655 | LOW |
| `get_full_profile(city, district, state, crop)` | All 6 at once | 15,549,889 | ALL |

Every method returns a normalised response with consistent keys:
```json
{
  "endpoint"         : "city_forecast",
  "farmer_need"      : "General Weather Forecast",
  "priority"         : "CRITICAL",
  "freshness_minutes": 360,
  "temperature_c"    : 35.9,
  "rainfall_mm"      : 3.8,
  "humidity_pct"     : 37.1,
  "wind_speed_kmh"   : 12.6,
  "alert_type"       : null,
  "condition"        : "Cloudy",
  "raw"              : {}
}
```

---

### `wrapper/router.py`
**The routing layer.** Takes raw farmer query text and returns which IMD endpoint should answer it. Uses keyword matching in priority order — the same logic used to build the 59 KCC clusters.

Matching order (first match wins):
1. Weather Impact on Crops — `crop loss`, `frost`, `hailstorm`, `irrigation`
2. Short Term Forecast — `next 3 days`, `next 5 days`, `coming days`
3. Current Weather Condition — `current weather`, `today weather`, `weather now`
4. Rain Forecast — `rain`, `rainfall`, `barish`, `monsoon`
5. District Weather Forecast — `district`, `block`, `taluk`, `tehsil`
6. General Weather Forecast — `weather`, `forecast`, `mausam` (catch-all)

```python
route_query("will it rain tomorrow in my district")
# → { "farmer_need": "Rain Forecast", "endpoint_key": "rainfall_forecast" }
```

---

### `wrapper/__init__.py`
**Package exports.** Re-exports the most commonly used symbols so other code can write `from wrapper import IMDClient` instead of `from wrapper.client import IMDClient`.

---

### `api/main.py`
**The FastAPI application.** Exposes 15 routes across 4 groups. Each route receives a request, calls the appropriate wrapper function, and returns JSON.

```
GET  /                           health check
GET  /health                     detailed health

GET  /weather/city-forecast      → IMDClient.get_city_forecast()
GET  /weather/district-forecast  → IMDClient.get_district_forecast()
GET  /weather/rainfall-forecast  → IMDClient.get_rainfall_forecast()
GET  /weather/current            → IMDClient.get_current_weather()
GET  /weather/nowcast            → IMDClient.get_nowcast()
GET  /weather/agromet-advisory   → IMDClient.get_agromet_advisory()
GET  /weather/full-profile       → IMDClient.get_full_profile()

GET  /router/query               → route_query(q)
POST /router/batch               → route_batch(list)

GET  /analysis/cluster/{id}      → get_endpoint_for_cluster(id)
GET  /analysis/need/{need}       → get_endpoint_for_need(need)
GET  /analysis/mapping           → get_full_mapping_table()
GET  /analysis/needs             → get_need_summary()
```

Swagger UI (auto-generated docs) is available at `/docs`.
Each route description includes the exact KCC cluster IDs and query counts.

---

### `api/__init__.py`
Empty file. Required by Python to treat `api/` as a package so `api.main` can be imported by uvicorn.

---

### `app.py`
Direct usage without starting a server. Import `IMDClient` and call methods directly from a Jupyter notebook. Useful for quick testing without the FastAPI overhead.

---

### `run_api.py`
Jupyter notebook cells for starting, testing, and stopping the FastAPI server from inside JupyterHub.

---

### `requirements.txt`
```
fastapi>=0.110.0
uvicorn>=0.29.0
requests>=2.31.0
pandas>=2.0.0
matplotlib>=3.7.0
```

---

## KCC Analysis — Why These 6 Endpoints

The 6 endpoints were selected by clustering 15,549,889 farmer weather queries from the KCC dataset into 59 groups using TF-IDF vectorisation and MiniBatch K-Means, then grouping those clusters by semantic meaning.

| Endpoint | Clusters | Queries | Coverage |
|---|---|---|---|
| `city-forecast` | 3,18,28,27,58,10,15,14,30,13,47 | 13,706,092 | 88.14% |
| `district-forecast` | 54,36,41,8,9,12,40,52,17,7,26,1,53,32,22,45,48,56,0,6,33,37,50,31,39,21,25,46,55,49,44,57,34,38,43,16 | 1,335,570 | 8.59% |
| `rainfall-forecast` | 20,2,4,42,19 | 248,633 | 1.60% |
| `current` | 35,29,11 | 180,855 | 1.16% |
| `nowcast` | 24,23 | 57,084 | 0.37% |
| `agromet-advisory` | 5,51 | 21,655 | 0.14% |

---

## How to Start the Server

Always use `find_free_port()` — JupyterHub permanently occupies port 8000.

```python
import socket, subprocess, sys, time, os

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]

PORT        = find_free_port()
PROJECT_DIR = os.path.join(os.path.expanduser("~"), "imd_api_wrapper")
sys.path.insert(0, PROJECT_DIR)

log    = open(os.path.join(PROJECT_DIR, "api_server.log"), "w")
server = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "api.main:app",
     "--host", "127.0.0.1", "--port", str(PORT)],
    stdout=log, stderr=log, cwd=PROJECT_DIR,
)
time.sleep(4)
print(f"Running : http://127.0.0.1:{PORT}")
print(f"Docs    : http://127.0.0.1:{PORT}/docs")
```

To stop:
```python
server.terminate()
log.close()
```

---

## Switching from Mock to Live IMD API

The project currently runs in **mock mode** — all responses are generated locally with realistic random values. No IMD credentials are needed.

For real IMD API credentials, make **only these changes**:

### Step 1 — Open `wrapper/client.py`

Find these three lines near the top of the file (around line 18–21):

```python
BASE_URL = "MOCK"
API_KEY  = "MOCK"
USE_MOCK = True
```

Replace them with real credentials:

```python
BASE_URL = "https://imdapi.met.gov.in"   #  IMD base URL
API_KEY  = "your-actual-api-key-here"    #  IMD API key
USE_MOCK = False                          # switch to live mode
```

### Step 2 — Uncomment the live request block in `_fetch()`

In the same file `wrapper/client.py`, find the `_fetch()` function.

Delete this block:
```python
if USE_MOCK:
    logger.info("[MOCK] %s params=%s", endpoint_key, params)
    raw = _MOCK_FNS[endpoint_key](**params)
    return _normalise(raw, endpoint_key)
```

Uncomment this block (remove the `#` characters):
```python
# import requests
# url     = BASE_URL.rstrip("/") + ENDPOINTS[endpoint_key]
# headers = {"Authorization": f"Bearer {API_KEY}"}
# last_err = None
# for attempt in range(1, max_retries + 1):
#     try:
#         resp = requests.get(url, params=params,
#                             headers=headers, timeout=timeout)
#         if resp.status_code == 200:
#             return _normalise(resp.json(), endpoint_key)
#         if resp.status_code == 429:
#             time.sleep(5); continue
#         last_err = f"HTTP {resp.status_code}"
#     except Exception as exc:
#         last_err = str(exc)
#     if attempt < max_retries:
#         time.sleep(attempt)
# raise RuntimeError(f"[{endpoint_key}] Failed: {last_err}")
```

### Step 3 — Restart the server

```python
server.terminate()
# then re-run the start cell
```

**No other files need to change.** All 15 API routes, the query router, the mapping functions, and the Swagger docs continue to work identically with live data.

---

## Where Credentials Go — Summary

```
wrapper/
└── client.py          ← ONLY file that needs editing to go live
    ├── BASE_URL       ← line ~18  replace "MOCK" with real URL
    ├── API_KEY        ← line ~19  replace "MOCK" with real key
    └── USE_MOCK       ← line ~20  change True to False
```

---

## Architecture Flow

```
Farmer Query Text
      │
      ▼
  router.py
  keyword match → identifies farmer need
      │
      ▼
  config.py
  CLUSTER_TO_NEED → NEED_TO_ENDPOINT
      │
      ▼
  client.py
  IMDClient method → mock or live API call
      │
      ▼
  _normalise()
  consistent response schema
      │
      ▼
  main.py
  FastAPI route → JSON response
```

---

## Clustering Validation Metrics

The 59 clusters were validated using:

| Metric | Value | Interpretation |
|---|---|---|
| Silhouette Score | ~0.32 | Acceptable separation for large-scale text clustering |
| Davies-Bouldin Index | ~1.18 | Acceptable cluster compactness |
| Total queries covered | 15,549,889 | 100% — no data loss |
| Clusters | 59 |