# ACE GDB Gap Analysis System

Turns disclaimer-triggered ACE queries into structured, prioritized visibility
into GDB knowledge gaps — so growth is planned, not reactive.

## What's in this delivery

| File | Purpose |
|---|---|
| `generate_data.py` | Synthetic 12-week dataset of disclaimer-triggered queries (demo data — swap for real MongoDB export in production) |
| `analyze_gaps.py` | Standalone demo pipeline: clustering, gap scoring, heatmaps, report, outreach plan → `analysis_output.json` |
| `backend/db.py` | MongoDB access layer + ingestion function ACE calls when it shows the disclaimer |
| `backend/pipeline.py` | Production pipeline: reads `disclaimer_queries`, writes `gap_clusters` / `gap_reports` / `outreach_plan` |
| `backend/scheduler.py` | Runs the pipeline every Monday 06:00 IST via APScheduler |
| `backend/api.py` | FastAPI service exposing clusters, gaps, heatmap, report, and outreach plan to the dashboard |
| `backend/requirements.txt` | Python dependencies |
| `gdb_gap_dashboard.jsx` | React dashboard (coverage heatmap, gap cards, outreach table) |
| `Weekly_GDB_Gap_Report.docx` | This week's generated Gap Report, ready to circulate |
| `disclaimer_queries.json` / `analysis_output.json` | Sample data + computed output backing the demo |

## How the pieces connect

```
ACE (disclaimer shown)
        │  POST /api/disclaimer-queries
        ▼
MongoDB: disclaimer_queries  ──────────────┐
        │                                   │  every Monday 06:00 IST
        │  ad hoc reads                     ▼
        │                          backend/pipeline.py
        │                             │  TF-IDF + KMeans sub-clustering
        │                             │  volume + WoW growth scoring
        │                             │  heatmap matrices
        │                             │  outreach rules
        │                             ▼
        │            MongoDB: gap_clusters / gap_reports / outreach_plan
        │                             │
        ▼                             ▼
   backend/api.py  ◄───────────────────
        │  REST (FastAPI, CORS-enabled)
        ▼
   React dashboard (gdb_gap_dashboard.jsx)
        - Section 1: High-volume gaps
        - Section 2: Fast-growing gaps
        - Section 3: Crop×Domain / State×Domain coverage heatmap
        - Section 4: Outreach plan, filterable by urgency
```

## Gap detection logic

- **Structured clustering**: every disclaimer event is grouped by `(Crop, Domain, State)`, with `Intent` tracked as a sub-dimension inside each group.
- **Semantic sub-clustering**: within a structured group, TF-IDF + KMeans collapses near-duplicate phrasings ("yellow rust on wheat" vs. "wheat leaves turning yellow rust color") into one gap, and surfaces the most representative question.
- **High-volume gaps**: clusters at or above the 75th percentile of 12-week volume — chronic, high-traffic blind spots.
- **Fast-growing gaps**: clusters where the trailing 2-week volume is ≥40% higher than the prior 2 weeks (with a volume floor to filter noise) — usually a pest outbreak, weather event, or scheme deadline the GDB hasn't caught up to.
- **Priority score** = `0.6 × volume + 0.4 × max(growth%, 0)`, so both scale and momentum earn a place near the top.

## Running it locally

```bash
# 1. Demo pipeline (no MongoDB needed)
python generate_data.py
python analyze_gaps.py          # → analysis_output.json

# 2. Production stack (requires a running MongoDB)
cd backend
pip install -r requirements.txt
export MONGO_URI="mongodb://localhost:27017"
python db.py                    # create indexes once
python pipeline.py              # run one analysis pass
uvicorn api:app --reload --port 8000
python scheduler.py             # optional: keep it running weekly

# 3. Dashboard
# Drop gdb_gap_dashboard.jsx into your React app and point its fetch
# calls at http://localhost:8000/api/... (currently wired to the
# embedded demo dataset so it also renders standalone).
```

## Deploying a live, real-URL version (backend + auth + frontend)

This is the version that actually auto-updates — the artifact/demo HTML
file from earlier is a static snapshot; this is the real thing, with a
MongoDB-backed pipeline, JWT login, and a frontend that fetches live data.

### 1. Database — MongoDB Atlas (free tier is enough to start)
1. Create a cluster at [mongodb.com/atlas](https://mongodb.com/atlas).
2. Add a database user and allow network access from anywhere (or your host's IPs).
3. Copy the connection string — this is your `MONGO_URI`.

### 2. Backend — Railway, Render, or Fly.io
```bash
cd backend
cp .env.example .env        # fill in MONGO_URI, generate JWT_SECRET_KEY
pip install -r requirements.txt
python db.py                # create indexes
python seed_users.py        # create the demo login accounts
uvicorn api:app --reload --port 8000   # test locally first
```
To deploy:
- **Railway**: `railway init`, then `railway up` from the `backend/` folder. Set the env vars from `.env.example` in the Railway dashboard (Variables tab). Railway auto-detects the `Procfile`.
- **Render**: push this repo, create a new Web Service pointing at `backend/`, and it will pick up `render.yaml` automatically — just fill in `MONGO_URI` and `ALLOWED_ORIGINS` in the dashboard.
- **Fly.io / any Docker host**: `docker build -t gdb-gap-api . && docker run -p 8000:8000 --env-file .env gdb-gap-api`, or `fly launch` using the included `Dockerfile`.

Once deployed, note the backend's public URL, e.g. `https://gdb-gap-api.up.railway.app`.
Set `ALLOWED_ORIGINS` on the backend to your frontend's URL once you have it (step 3).

Keep the pipeline running on schedule with `python scheduler.py` as a
background worker/cron job on the same host (Railway and Render both
support a second "worker" process type for this).

### 3. Frontend — Vercel
```bash
cd frontend
cp .env.example .env        # set VITE_API_BASE_URL to your backend URL
npm install
npm run build                # verify it builds locally first
```
Deploy:
```bash
npm install -g vercel
vercel                       # first deploy, follow the prompts
vercel env add VITE_API_BASE_URL production   # paste your backend URL
vercel --prod
```
Or connect the repo in the Vercel dashboard — it auto-detects Vite via
`vercel.json` and only needs `VITE_API_BASE_URL` set under
Project Settings → Environment Variables.

You'll get a real URL like `https://gdb-gap-dashboard.vercel.app`.
Go back to the backend and set `ALLOWED_ORIGINS` to that exact URL so CORS allows it.

### 4. Log in
Use the demo accounts from `seed_users.py` (`admin` / `demo123`, etc.) —
or edit that file with your real team roster before running it, since
these are meant to be replaced before sharing the URL externally.

### What now updates automatically
- ACE → `POST /api/disclaimer-queries` → MongoDB, in real time.
- `scheduler.py` reclusters everything every Monday 06:00 IST.
- The frontend polls the API every 5 minutes and has a manual "Refresh now" button, so a fresh Monday pipeline run shows up without redeploying anything.


Wherever ACE currently shows the 2-hour disclaimer, add one call:

```python
import requests
requests.post("http://gap-api/api/disclaimer-queries", json={
    "crop": detected_crop,
    "domain": detected_domain,
    "state": farmer_state,
    "intent": detected_intent,
    "question_text": raw_question,
})
```

That's the only integration point required — everything downstream
(clustering, scoring, reporting, dashboard) runs on schedule from there.
