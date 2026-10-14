# GDB Coverage Gap Detector

## Overview

The **GDB Coverage Gap Detector** is an analytics service for Ajrasakha that identifies unanswered farmer questions, detects knowledge coverage gaps in the Golden Dataset (GDB), clusters similar missing queries, prioritizes them, and generates reviewer-friendly reports.

Instead of waiting for reviewers to manually discover missing knowledge, this service continuously analyzes disclaimer-triggered questions and highlights areas where the GDB should be expanded.

---

## Objectives

- Detect unanswered farmer questions
- Measure existing GDB coverage
- Identify coverage gaps
- Cluster semantically similar unanswered queries
- Prioritize gaps using configurable scoring
- Generate dashboard-ready reports
- Help reviewers expand the Golden Dataset efficiently

---

## Architecture

```
Farmer Question
       │
       ▼
Coverage Analysis
       │
       ▼
Gap Classification
       │
       ▼
Semantic Clustering
       │
       ▼
Priority Calculation
       │
       ▼
Weekly Reports & Analytics
```

---

## Project Structure

```
gdb_gap_detector/

├── main.py
├── models.py
├── gap_service.py
├── coverage.py
├── clustering.py
├── priority.py
├── reporting.py
├── requirements.txt
└── README.md
```

---

## Components

### coverage.py

Responsible for:

- Coverage analysis
- Vector similarity search
- Gap classification
- Similar question retrieval

---

### clustering.py

Responsible for:

- Semantic clustering
- Cluster assignment
- Cluster rebuilding
- Cluster registry management

---

### priority.py

Computes reviewer priority using multiple signals:

- Farmer demand
- Cluster growth
- Geographic spread
- Coverage deficiency
- Recency
- Reviewer backlog

---

### reporting.py

Generates:

- Dashboard statistics
- Weekly reports
- State summaries
- Crop summaries
- Domain summaries
- Coverage heatmaps

---

### gap_service.py

Coordinates the complete analysis pipeline.

---

### main.py

FastAPI application exposing REST endpoints.

---

## API Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/health/ready` | Readiness probe |
| POST | `/analyze` | Analyze one unanswered question |
| POST | `/analyze/batch` | Analyze multiple questions |
| GET | `/statistics` | Gap statistics |
| GET | `/report` | Weekly report |

---

## Future Enhancements

- MongoDB persistence
- Automatic scheduler
- Reviewer dashboard integration
- Continuous cluster updates
- Trend analytics
- Reviewer feedback loop

---

## Status

Current implementation focuses on the core analytics engine.

Persistence and integration with the reviewer workflow can be added incrementally without changing the algorithmic pipeline.

## Current Limitations

- Cluster registry is maintained in memory.
- Weekly reports are generated on demand.
- Gap events are not yet persisted.
- Scheduler integration is planned for future work.
