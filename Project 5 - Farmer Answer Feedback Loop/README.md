# Farmer Feedback System — Project 5

> Complete farmer feedback system for the ACE GDB (Golden Dataset), built with FastAPI + React + MongoDB + GROQ.

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB running on `localhost:27017`

---

### 1. Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — add your GROQ API key (optional but recommended)

# Seed the database from existing JSON data
python scripts/seed_data.py

# Start the API server
uvicorn app.main:app --reload --port 8000
```

API will be live at: http://localhost:8000  
Swagger docs: http://localhost:8000/docs

---

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Dashboard will be live at: http://localhost:5173

---

## 📊 Dashboard Pages

| Page | URL | Description |
|---|---|---|
| Overview | `/overview` | KPI cards, 30-day trend, top/bottom entries |
| GDB Entries | `/gdb-entries` | Filterable table of all 800+ GDB entries with scores |
| Domain Analysis | `/domain-analysis` | Helpfulness by agricultural domain |
| State & Language | `/state-language` | Geographic and linguistic breakdown |
| Flagged Entries | `/flagged` | Entries below 60% threshold — reviewer queue |
| Weekly Digest | `/weekly-digest` | GROQ AI-generated insights and recommendations |
| WhatsApp Sim | `/whatsapp-sim` | Live demo of the complete feedback flow |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/analytics/overview` | Overall KPIs |
| GET | `/analytics/gdb-entries` | Per-entry table with filters |
| GET | `/analytics/domain` | Domain breakdown |
| GET | `/analytics/language` | Language breakdown |
| GET | `/analytics/state` | State breakdown |
| GET | `/analytics/trends` | Daily trend (last 30 days) |
| POST | `/webhook/whatsapp` | Real WhatsApp webhook |
| POST | `/webhook/simulate` | Dashboard simulation endpoint |
| POST | `/feedback/submit` | Submit feedback manually |
| POST | `/flagging/run` | Run flagging pipeline |
| GET | `/flagging/flagged` | List flagged entries |
| PATCH | `/flagging/{id}/status` | Update flag status |
| POST | `/digest/generate` | Generate GROQ digest |
| GET | `/digest/latest` | Get latest digest |

---

## ⚙️ Configuration

Edit `backend/.env`:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=farmer_feedback_db
GROQ_API_KEY=your_groq_key_here       # Get at console.groq.com
FEEDBACK_THRESHOLD=60.0               # Flag below 60% helpfulness
MIN_RESPONSES_TO_FLAG=10              # Need 10+ responses before flagging
```

---

## 🔁 The Feedback Loop

```
Farmer asks question on WhatsApp
        ↓
GDB searched for best matching answer
        ↓
Answer delivered + "Was this helpful?" sent
        ↓
Farmer replies 1 (Yes) or 2 (No)
        ↓
Feedback stored + GDB entry score updated
        ↓
If score < 60% over 10+ responses → Auto-flagged
        ↓
Expert team reviews flagged entry → Improves answer
        ↓
GDB quality improves → Better answers for future farmers
```
