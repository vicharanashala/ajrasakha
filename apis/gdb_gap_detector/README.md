# GDB Coverage Gap Detector (Project 6)

Finds the questions the Golden Dataset (GDB) cannot answer, clusters them, and produces a prioritised weekly gap report, a coverage heatmap and state-level outreach guidance.

```
backend/   FastAPI + pymongo + scikit-learn / sentence-transformers pipeline
frontend/  React (Vite) dashboard
REPORT.md  What was built, the approach, assumptions and next steps
```

## Run it (demo mode, no database needed)

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api to :8000)
```
With `MONGO_URI=mongomock://` (default) an in-memory DB is seeded with ~3,700 synthetic questions and the pipeline runs on startup.

## Run it against the real MongoDB

Copy `backend/.env.example` to `backend/.env` and set `MONGO_URI` / `MONGO_DB`. The service only **reads** `questions`; it writes to `gdb_gap_reports`, `gdb_gap_clusters`, `gdb_gap_coverage_cells`. Then `POST /api/pipeline/run` (or the "Re-run pipeline" button). The pipeline re-runs automatically every 2 hours (`REPORT_INTERVAL_HOURS`) when `ENABLE_SCHEDULER=1`.

For better multilingual clustering: `pip install sentence-transformers` (it is picked up automatically, `EMBEDDING_BACKEND=auto`).

## API
| Endpoint | Purpose |
|---|---|
| `POST /api/pipeline/run` | Run the pipeline now |
| `GET /api/reports/latest` , `/api/reports/{id}` , `/api/reports` | Weekly GDB Gap Report (top-N clusters, emerging, outreach) |
| `GET /api/reports/latest/export.csv` / `.md` | Shareable exports |
| `GET /api/clusters?crop=&state=&domain=&trend=` | Filter clusters |
| `GET /api/heatmap?rows=crop&cols=state&domain=` | Coverage matrix on any two axes |
| `GET /api/meta` , `/api/health` | Filter values / health |

## Tests
```bash
cd backend && pytest -q      # 11 tests
```
