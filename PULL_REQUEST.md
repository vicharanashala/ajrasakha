# Pull Request Description

## Title
`feat: GDB Coverage Gap Detector — Continuous Query Analysis, Clustering & Heatmap Dashboard`

## Overview
This PR builds the complete **GDB Coverage Gap Detector** system to address unanswered ACE queries where the 2-hour disclaimer is shown. Instead of reactive content creation, this system automatically aggregates, clusters, and ranks disclaimer-triggered questions into prioritized knowledge gaps to drive strategic GDB growth.

---

## What's Included

### 1. Ingestion API & Standalone Pipeline
- **Real-Time Ingestion**: `POST /api/disclaimer-queries` logs unanswered queries directly into MongoDB.
- **Data Generator**: `generate_data.py` synthesizes 12 weeks of realistic disclaimer events across 10 crops, 10 domains, 10 states, and 6 intents.

### 2. Multi-Dimensional & Semantic Clustering
- **Structured Key Aggregation**: Groups queries by `(Crop, Domain, State)`, with `Intent` as an internal sub-dimension.
- **Semantic Sub-Clustering**: Uses TF-IDF + KMeans (with optional `sentence-transformers` support) to collapse duplicate phrasings into a unified cluster and extract centroid representative questions.
- **Scoring Model**: Blends 12-week volume and WoW momentum ($\text{Priority} = 0.6 \times \text{Volume} + 0.4 \times \max(\text{Growth}\%, 0)$).
- **Classification**:
  - **High-Volume Gaps**: $\ge 75^{\text{th}}$ percentile volume.
  - **Fast-Growing Gaps**: Trailing 2-week volume $\ge 40\%$ higher than prior 2 weeks.

### 3. FastAPI Service & MongoDB Layer
- **Resilient MongoDB Access**: Includes `mongomock` in-memory fallback so tests and local dev work without an external Mongo server daemon.
- **JWT Authentication**: Secured endpoints with role-based access for Content Leads and Field Ops.
- **On-Demand Pipeline Execution**: `POST /api/pipeline/run` endpoint allowing real-time re-clustering.

### 4. Interactive React Dashboard
- **Executive KPIs**: Live counters for queries, active gap clusters, and immediate field actions.
- **High-Volume & Fast-Growing Gap Cards**: Custom SVG sparkline charts, crop badges, momentum percentages, and representative questions.
- **Coverage Field-Maps**: Interactive Crop $\times$ Domain and State $\times$ Domain heatmaps with cell intensity shading.
- **Interactive Outreach Plan**: Urgency-filtered table with live status toggles (**Mark Resolved** / **Reopen**).
- **Ingestion Simulator**: Modal to log test queries and trigger instant pipeline analysis directly from the UI.

### 5. Automated Word Executive Report & CI Suite
- **Docx Generator**: `generate_report_docx.py` creates styled `Weekly_GDB_Gap_Report.docx`.
- **Test Suite & CI**: Comprehensive `unittest` test suite (`tests/`) and GitHub Actions workflow (`.github/workflows/ci.yml`).

---

## How to Test & Verify

```bash
# 1. Run Unit Test Suite
python -m unittest discover tests

# 2. Run Gap Analysis & Pipeline Pass
python generate_data.py
python analyze_gaps.py
python backend/pipeline.py
python generate_report_docx.py

# 3. Start Backend API
uvicorn backend.api:app --reload --port 8000

# 4. Start React Dashboard
cd frontend && npm install && npm run dev
```

---

## Checklist
- [x] Backend FastAPI ingestion & clustering pipeline
- [x] MongoDB database access layer with fallback
- [x] Unit test suite passing (6/6 tests)
- [x] Word executive report generation script
- [x] React dashboard with heatmaps, gap cards, and status resolution
- [x] GitHub Actions CI configuration
- [x] Updated README and setup documentation
