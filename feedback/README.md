# Farmer Feedback System

A feedback loop that lets farmers rate GDB answers via WhatsApp ("Was this helpful? Reply 1 for Yes, 2 for No"), stores responses in MongoDB, and surfaces helpfulness trends through a React dashboard.

---

## What this builds

- **FastAPI backend** — receives farmer feedback, looks up real question/answer data from the original DB, stores enriched feedback in a separate cluster
- **React dashboard** — shows helpfulness stats by domain, language, and state; flags underperforming entries; generates a weekly digest
- **Test Panel** — simulates the WhatsApp webhook for local testing (dev only)
- **Seed script** — populates demo data from real GDB entries

---

## Architecture

```
Farmer replies "1" or "2" on WhatsApp
        ↓
POST /feedback (FastAPI)
        ↓
Looks up question + answer in original DB (READ ONLY)
Derives domain + state from question details
        ↓
Stores enriched feedback in own MongoDB cluster
        ↓
React dashboard reads aggregated stats
```

Two MongoDB clusters:
- **Original cluster** (agriai) — READ ONLY, owned by the ACE team
- **Own cluster** (feedback) — READ + WRITE, your Atlas cluster

---

## Prerequisites

- Python 3.12+
- Node.js 18+
- Two MongoDB Atlas connection URIs (see Environment setup below)

---

## Setup

### 1. Clone and navigate

```bash
git clone https://github.com/Anjali7462/ajrasakha.git
cd ajrasakha/feedback
```

### 2. Backend setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Environment setup

```bash
cp .env.example .env
```

Open .env and fill in your values:

```
ORIGINAL_DB_URL=mongodb+srv://<user>:<password>@<cluster>
ORIGINAL_DB_NAME=agriai

OWN_DB_URL=mongodb+srv://<user>:<password>@<cluster>
OWN_DB_NAME=feedback
```

### 4. Verify DB connections

```bash
python3 test_db.py
```

Expected output:
```
✅ Original DB (agriai) connected — X questions found
✅ Own DB (feedback) connected — write test passed
```

### 5. Frontend setup

```bash
cd dashboard
npm install
```

---

## Running the app

Two terminals needed simultaneously.

**Terminal 1 — Backend:**

```bash
cd ajrasakha/feedback
source venv/bin/activate
uvicorn main:app --reload
```

Runs at: http://localhost:8000

**Terminal 2 — Frontend:**

```bash
cd ajrasakha/feedback/dashboard
npm run dev
```

Runs at: http://localhost:5173

---

## Seeding demo data

With the backend running, open a third terminal:

```bash
cd ajrasakha/feedback
source venv/bin/activate
python3 seed.py
```

The script pulls real question/answer pairs from the original DB, generates synthetic feedback with varied helpful/not-helpful splits, and prompts to clear existing data before seeding.

---

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | Health check |
| GET | /questions/sample | Real question/answer pairs for Test Panel |
| POST | /feedback | Submit farmer feedback |
| GET | /feedback/all | List all feedback |
| GET | /feedback/count | Total feedback count |
| GET | /feedback/dashboard | Stats by domain, language, state |
| GET | /feedback/flagged | Low-rated entries (threshold and min_responses configurable) |
| GET | /feedback/digest | Weekly ranked worst entries |

Interactive API docs: http://localhost:8000/docs

---

## Dashboard pages

| Page | URL | What it shows |
|------|-----|---------------|
| Overview | / | Stat cards + domain summary |
| Domains | /domains | Bar chart by agricultural domain |
| Languages | /languages | Bar chart by language |
| States | /states | Bar chart by state |
| Flagged | /flagged | Entries below helpfulness threshold |
| Digest | /digest | Weekly ranked worst entries |
| Test Panel | /test | Simulate WhatsApp feedback (dev only) |

---

## Project structure

```
feedback/
├── main.py              # FastAPI app — all endpoints
├── models.py            # Pydantic data models
├── database.py          # MongoDB connections (two clusters)
├── seed.py              # Demo data seeder
├── test_db.py           # DB connection verifier
├── requirements.txt     # Python dependencies
├── .env                 # Your secrets (never committed)
├── .env.example         # Template — copy to .env and fill in
└── dashboard/           # React frontend
    └── src/
        ├── pages/       # One file per dashboard page
        ├── components/  # Navbar, StatCard, RateBar, StatsChart, ErrorMessage
        └── api.ts       # All axios calls to FastAPI
```

---

## What is not yet wired (V1.x)

| Feature | Status | Needs |
|---------|--------|-------|
| Auto WhatsApp follow-up | V1.1 | WhatsApp API credentials |
| Capture farmer reply from WhatsApp | V1.1 | WhatsApp API credentials |
| Push flagged entries to reviewer queue | V1.2 | Reviewer backend API access |
| Automated weekly digest email/Slack | V1.3 | SMTP or Slack webhook |
| Language auto-derived from bot | V1.4 | Bot team integration |

The Test Panel at /test simulates the WhatsApp webhook until V1.1 is live.

---

## Build plan

See build-plan.md for full version history, reasoning behind every decision, and open questions to confirm with the team.