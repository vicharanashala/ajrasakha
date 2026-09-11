# GDB Coverage Gap Detector Microservice 

A standalone Python FastAPI microservice for ajrasakha platform. The service continuously analyzes unanswered farmer disclaimers, clusters them semantically using HDBSCAN, prioritizes coverage gaps, and generates actionable weekly reports with regional heatmaps.

---

## Key Features

1. **GDB Gap Triage Model (`overlap.py`)**: Uses `best_match_score` from `disclaimer_logs` to triage gaps into `real_gap` (<0.4), `near_miss` (0.4–0.7), and `almost_covered` (≥0.7). This tells the team whether to write brand-new content or adjust retrieval/scoring on existing content.
2. **Weekly Growth & Trend Tracking (`trend.py`)**: Compares current week clusters against prior `gap_reports` documents in MongoDB to tag clusters as 🆕 `NEW`, 📈 `GROWING` (+30% priority), 📉 `SHRINKING`, or ✅ `RESOLVED`.
3. **Pre-Clustering Noise Filter (`extractor.py`)**: Drops non-agricultural noise (`confidence < 0.15`, `domain == "Off-topic"`, `is_off_topic == True`) at ingestion.
4. **HDBSCAN Outlier Safety Net (`clusterer.py`)**: Places HDBSCAN noise points (label `-1`) into a `"Miscellaneous"` cluster so low-frequency real farmer questions are accounted for rather than lost.
5. **Zero-PII Projection**: MongoDB projection `{"farmer_id": 0}` guarantees phone numbers never enter memory.
6. **Dual Output & Interfaces**: Interactive HTML Dashboard (`GET /dashboard`), Swagger OpenAPI (`/docs`), Rich Terminal CLI (`python -m gdb_gap_detector run`), and natural language Markdown report output (`GET /api/v1/gap-report/markdown`).

---

## Directory Structure

```
apis/gdb_gap_detector/
├── pyproject.toml             # Packaging & dependencies
├── Dockerfile                 # HuggingFace Spaces & Docker deployment
├── .env.example               # Configuration template
├── README.md                  # Microservice documentation
├── dashboard.html             # Single-page interactive HTML Dashboard
│
├── gdb_gap_detector/
│   ├── __init__.py
│   ├── __main__.py            # CLI module entrypoint
│   ├── config.py              # Pydantic BaseSettings (env-driven)
│   ├── db.py                  # Motor async MongoDB client
│   │
│   ├── models/                # Pydantic v2 models
│   │   ├── disclaimer.py      # DisclaimerLog (PII-stripped)
│   │   ├── gdb_entry.py       # GdbEntry
│   │   ├── flagged.py         # FlaggedEntry
│   │   ├── cluster.py         # GapCluster, ScoredCluster
│   │   ├── heatmap.py         # CoverageCell
│   │   └── report.py          # GapReport, OutreachRecommendation, TrendDelta
│   │
│   ├── pipeline/              # Isolated 6-stage business logic
│   │   ├── extractor.py       # Stage 1: Mongo extraction + noise filter
│   │   ├── embedder.py        # Stage 2: SentenceTransformer singleton
│   │   ├── overlap.py         # Stage 3: GDB Gap Triage Model
│   │   ├── clusterer.py       # Stage 4: HDBSCAN + Outlier Safety Net
│   │   ├── scorer.py          # Stage 5: Priority score formula
│   │   ├── coverage.py        # Stage 6: Heatmap & Outreach recommendations
│   │   ├── trend.py           # Stage 7: Weekly growth & trend deltas
│   │   └── reporter.py        # Stage 8: GapReport assembly & Markdown generator
│   │
│   ├── api/                   # FastAPI Web Layer
│   │   ├── app.py             # FastAPI app, CORS, lifespan
│   │   └── routes/
│   │       ├── health.py      # GET /health
│   │       ├── dashboard.py   # GET /dashboard (HTML response)
│   │       ├── gaps.py        # GET /api/v1/gap-report, /markdown, /clusters, POST /run-now
│   │       ├── heatmap.py     # GET /api/v1/heatmap
│   │       ├── export.py      # GET /api/v1/export/csv
│   │       └── scheduler.py   # POST /scheduler/start|stop, GET /status
│   │
│   └── scheduler/
│       └── jobs.py            # APScheduler weekly cron job
│
└── tests/                     # 50+ Pytest suite with mongomock-motor
    ├── conftest.py            # Fixtures built from sample database dump
    ├── test_privacy.py        # Zero-PII compliance assertion
    ├── test_extractor.py
    ├── test_embedder.py
    ├── test_overlap.py
    ├── test_clusterer.py
    ├── test_scorer.py
    ├── test_coverage.py
    ├── test_trend.py
    ├── test_reporter.py
    ├── test_api.py
    └── test_cli.py
```

---

## Quick Start

### 1. Installation
```bash
cd apis/gdb_gap_detector
pip install -e ".[dev]"
```

### 2. Run CLI Pipeline
```bash
python -m gdb_gap_detector run --period-days 30
```

### 3. Launch Web Server & Dashboard
```bash
python -m gdb_gap_detector serve --port 8090
```
Open your browser at:
- **Interactive Dashboard:** [http://localhost:8090/dashboard](http://localhost:8090/dashboard)
- **OpenAPI Swagger Docs:** [http://localhost:8090/docs](http://localhost:8090/docs)
- **Natural Language Markdown Report:** [http://localhost:8090/api/v1/gap-report/markdown](http://localhost:8090/api/v1/gap-report/markdown)

---

## Running Automated Tests

```bash
pytest tests/ -v
```

---
