# AjraSakha Farmer Feedback System

Feedback collection system for the AjraSakha agricultural Q&A platform.

## Overview

This system collects farmer feedback on GDB (Golden Dataset) answers to improve content quality.

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Farmer Answer Feedback Loop                         │
└─────────────────────────────────────────────────────────────────────┘

[Farmer] ──── asks question ────> [AjraSakha/GDB]
                                        │
                    ┌───────────────────┴───────────────────┐
                    ↓                                       ↓
              [Web Chat]                              [WhatsApp]
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        ↓
                               [Answer Delivered]
                                        │
                                        ↓
                        [Feedback Request: "Helpful? 1/2"]
                                        │
                    ┌───────────────────┴───────────────────┐
                    ↓                                       ↓
              [Farmer Replies]                        [Farmer Replies]
                    │                                       │
                    └───────────────┬───────────────────────┘
                                    ↓
                          [Feedback Stored in MongoDB]
                                    │
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
            [Dashboard UI]              [Auto-Flag Pipeline]
                    │                               │
                    ↓                               ↓
            View stats/graphs              Low-score entries → Review Queue
```

## Architecture

### Existing Ajrasakha Integration

The system is designed to work alongside the existing Ajrasakha WhatsApp integration:

```
┌──────────────┐      ┌─────────────────┐      ┌──────────────────┐
│   Farmers    │─────▶│  LangGraph WA   │─────▶│  Ajrasakha API   │
│  (WhatsApp)  │      │    Server       │      │   (Backend)      │
└──────────────┘      └─────────────────┘      └──────────────────┘
                                                        │
                                                        ▼
                                              ┌──────────────────┐
                                              │  Feedback Hook   │
                                              │  (This System)   │
                                              └────────┬─────────┘
                                                       │
                                                       ▼
                                             ┌──────────────────┐
                                             │    MongoDB       │
                                             │ (feedback coll)  │
                                             └────────┬─────────┘
                                                       │
                                              ┌────────┴─────────┐
                                              ▼                  ▼
                                      [Dashboard]      [Auto-Flag Cron]
```

## Components

### 1. Feedback Service (`/backend`)
- FastAPI-based REST API
- Captures feedback from any channel (web, WhatsApp, etc.)
- Provides aggregation endpoints for dashboard
- Auto-flagging cron job

### 2. WhatsApp Integration (`/whatsapp-bot`)
- Lightweight Flask webhook receiver
- Can integrate with existing LangGraph WhatsApp server
- Demo mode for testing without Twilio

### 3. Dashboard (`/frontend`)
- React + Material UI + Recharts
- Shows feedback statistics
- Flagged entries management
- Weekly digest view

## Quick Start

### 1. Seed Synthetic Data

```bash
cd backend
pip install -r requirements.txt
python seed_data.py
```

### 2. Start Backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 3. Start Frontend

```bash
cd frontend
npm install
npm start
```

### 4. WhatsApp Bot (Optional - Demo Mode)

```bash
cd whatsapp-bot
pip install -r requirements.txt
python demo.py  # Runs without Twilio
```

## API Endpoints

### Feedback
- `POST /api/feedback` - Submit feedback
- `GET /api/feedback/{gdb_entry_id}` - Get feedback for entry
- `GET /api/feedback/{gdb_entry_id}/stats` - Get entry statistics

### Dashboard
- `GET /api/dashboard/overview` - Overview statistics
- `GET /api/dashboard/entries` - All entries with stats
- `GET /api/dashboard/breakdown/{domain|language|state}` - Breakdown

### Flagged
- `GET /api/flagged/` - List flagged entries
- `PATCH /api/flagged/{gdb_entry_id}/status` - Update status

### Weekly Digest
- `GET /api/weekly-digest/latest` - Latest digest
- `GET /api/weekly-digest/` - Historical digests

## Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster/?appName=hackathon

# WhatsApp (optional - for production)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=

# Feedback thresholds
AUTO_FLAG_THRESHOLD=0.60
AUTO_FLAG_MIN_RESPONSES=10
```

## Demo/Test Mode

The WhatsApp bot can run in demo mode to test feedback flow without any external dependencies:

```bash
cd whatsapp-bot
python demo.py
```

This starts a simple web interface where you can:
- Simulate farmer queries
- Submit feedback (1/2)
- See feedback flow in real-time

## Integration with Existing Ajrasakha

To integrate feedback collection with the existing Ajrasakha system:

1. **Add feedback hook** after answer delivery in `WhatsAppService.ts`
2. **Call feedback endpoint** when farmer responds to help question

```typescript
// After sending answer, call feedback hook
await fetch('http://feedback-service:8000/api/feedback', {
  method: 'POST',
  body: JSON.stringify({
    gdb_entry_id: answer.entryId,
    farmer_id: phoneNumber,
    message_id: messageSid,
    response: null, // Will be updated when farmer replies
  })
});
```

## Dashboard Screens

### 1. Dashboard Overview
- Total feedback count
- Helpfulness ratio (pie chart)
- Feedback by domain (bar chart)
- This week's summary

### 2. GDB Entries
- Sortable table of all entries
- Filter by domain/language/state
- Helpfulness score per entry

### 3. Flagged Entries
- Entries below threshold (60% helpful, 10+ responses)
- Priority score for review queue
- Actions: In Review / Resolved

### 4. Weekly Digest
- Summary for the week
- Lowest-rated entries
- Breakdown by domain/language/state

## GDB Entry IDs (Synthetic Data)

When testing with synthetic data, GDB entry IDs follow this format:

```
gdb_crop_disease_001
gdb_irrigation_003
gdb_pest_control_002
...
```

Domains: Crop Disease, Irrigation, Pest Control, Fertilizers, Weather, Soil Health, Harvesting, Seeds

## License

MIT