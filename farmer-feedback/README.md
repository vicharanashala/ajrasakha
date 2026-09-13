# AjraSakha Farmer Feedback System

A complete farmer feedback collection and GDB (Golden Dataset) quality management system for the AjraSakha agricultural Q&A platform. This system closes the loop between farmer experience and GDB quality by turning every interaction into an improvement signal.

## 🌾 Problem Statement

ACE has 20,000+ expert-validated answers in the GDB, but no systematic way to know which ones farmers actually find helpful. An answer can be scientifically correct and still be too technical, too long, or missing the specific detail a farmer in a particular region needs. Currently there is no channel for farmer feedback to flow back into the GDB review process.

## ✨ Features

### Core Features
- **Feedback Collection**: After answer delivery, prompts farmer with "Was this helpful? Reply 1 for Yes, 2 for No"
- **Multi-Channel Support**: WhatsApp bot, Telegram bot, and web chat interface
- **Real-time Analytics**: Dashboard showing helpfulness scores per GDB entry, domain, language, and state
- **Auto-Flagging**: GDB entries with <60% helpfulness across 10+ responses are automatically flagged for re-review
- **Weekly Digest**: Automated reports for agri team with lowest-rated entries
- **AI Question Matching**: Smart semantic matching with fallback to AI-generated answers
- **Multilingual Support**: 12 Indian languages with auto-detection

### Feedback Loop Flow
```
[Farmer asks question] → [GDB Answer Delivered] → [Feedback Request: "Helpful? 1/2"]
                                   │                                    │
                                   ▼                                    │
                            [Answer Stored]                    [Farmer Replies 1/2]
                                   │                                    │
                                   └────────────────┬───────────────────┘
                                                    ▼
                                         [Feedback Stored in MongoDB]
                                                    │
                        ┌───────────────────────────┼───────────────────────────┐
                        ▼                           ▼                           ▼
                [Dashboard UI]            [Auto-Flag Pipeline]        [Weekly Digest]
                        │                           │                           │
                        ▼                           ▼                           ▼
               View stats/graphs         Low-score entries →         Agri Team Review
                                                 Review Queue
```

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AJRAKASHA FEEDBACK SYSTEM                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────────────┐
│   Frontend      │     │   Backend       │     │   Bots                      │
│   (React+MUI)   │◄───│   (FastAPI)     │◄───│   Telegram + WhatsApp       │
│                 │     │                 │     │                             │
│ • Dashboard     │     │ • Feedback API  │     │ • farmer_chat.py            │
│ • Chat Interface│     │ • Dashboard API │     │ • bot.py                    │
│ • Admin Panel   │     │ • Auto-flag     │     │ • Demo mode support         │
│ • Coverage Gaps │     │ • Gap Detection │     │                             │
└────────┬────────┘     └────────┬────────┘     └──────────────┬──────────────┘
         │                       │                             │
         │              ┌────────▼────────┐                    │
         │              │    MongoDB      │◄───────────────────┘
         │              │                 │
         │              │ • feedback      │
         │              │ • gdb_entries   │
         │              │ • flagged       │
         │              │ • weekly_digest │
         │              │ • disclaimer_logs│
         │              │ • gap_reports   │
         │              └─────────────────┘
         │                       ▲
         │                       │
         └───────────────────────┘
                    REST API
```

### Backend Structure

```
backend/
├── main.py                     # FastAPI entry point + APScheduler
├── routers/                    # API route modules
│   ├── feedback.py             # POST/GET feedback endpoints
│   ├── dashboard.py            # Stats aggregation endpoints
│   ├── flagged.py              # Flagged entries management
│   ├── weekly_digest.py        # Weekly digest retrieval
│   ├── chat.py                 # Chat query + inline feedback
│   ├── admin.py                # Expert review workflow
│   ├── gaps.py                 # Coverage gap detection
│   ├── gdb_entries.py          # GDB entry retrieval
│   └── auth.py                 # JWT authentication
├── cron/                       # Scheduled jobs
│   ├── auto_flag_cron.py       # Daily 2AM: flag low-rated entries
│   ├── weekly_digest_cron.py   # Weekly Mondays 3AM
│   └── cron_runner.py          # Standalone scheduler
├── services/                   # Business logic
│   ├── disclaimer_tracker.py   # Track unanswered queries
│   ├── query_clusterer.py      # Cluster similar queries
│   └── gap_detector.py         # Detect GDB coverage gaps
└── seed_data.py                # Synthetic data generator
```

### Frontend Structure

```
frontend/src/
├── App.js                      # Route configuration
├── index.js                    # Entry + MUI theme
├── pages/                      # Page components
│   ├── Dashboard.js            # Overview with charts
│   ├── ChatBot.js              # Farmer Q&A interface
│   ├── Entries.js              # GDB entries table
│   ├── Flagged.js              # Flagged entries
│   ├── WeeklyDigest.js         # Weekly reports
│   ├── FeedbackDashboard.js    # Feedback analytics
│   ├── AdminPanel.js           # Expert review
│   ├── CoverageGaps.js         # Gap heatmap
│   ├── LandingPage.js          # Public landing
│   └── Login.js                # Admin login
├── components/
│   ├── Layout.js               # Admin layout + sidebar
│   └── ProtectedRoute.js       # Auth guard
├── context/
│   └── AuthContext.js          # Authentication state
└── utils/
    └── api.js                  # API client
```

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB instance (local or Atlas)
- (Optional) Twilio credentials for WhatsApp
- (Optional) Telegram bot token

### 1. Clone and Setup Environment

```bash
# Clone the repository
git clone https://github.com/vicharanashala/ajrasakha
cd ajrasakha

# Copy environment template
cp .env.example .env
# Edit .env with your MongoDB URI and credentials
```

### 2. Configure Environment Variables

```env
# .env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=ajrasakha
DATABASE_NAME=farmer_feedback

# Telegram Bot (optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Twilio WhatsApp (optional)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886

# Feedback Settings
AUTO_FLAG_THRESHOLD=0.60
AUTO_FLAG_MIN_RESPONSES=10
FEEDBACK_EXPIRY_HOURS=48

# AI APIs (for question matcher)
NVIDIA_API_KEY=your_nvidia_api_key
```

### 3. Start Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Start Frontend

```bash
cd frontend
npm install
npm start
```

### 5. (Optional) Start Telegram Bot

```bash
cd telegram-bot
pip install -r requirements.txt
python bot.py
```

### 6. (Optional) Seed Demo Data

```bash
cd backend
python seed_data.py
```

## 📱 WhatsApp Bot Setup

### Twilio Configuration

1. Create a Twilio account at https://www.twilio.com
2. Get your Account SID and Auth Token
3. Enable WhatsApp sandbox or request a business account
4. Set up webhook URL pointing to your deployed app

### Webhook Integration

The WhatsApp bot receives messages via webhook at `/whatsapp-webhook`:

```python
# whatsapp-bot/app.py
@app.route('/whatsapp-webhook', methods=['POST'])
def webhook():
    # Handle incoming WhatsApp messages
    # Route to FeedbackHandler for processing
```

### Demo Mode

Test without Twilio credentials:

```bash
cd whatsapp-bot
python demo.py --interactions 10
```

## 📊 Dashboard Guide

### Overview Page (`/dashboard`)
- Total feedback count
- Helpfulness ratio (pie chart)
- Feedback by domain (bar chart)
- This week's summary

### GDB Entries (`/entries`)
- Sortable table of all entries with feedback stats
- Filter by domain, language, state
- View question/answer details

### Flagged Entries (`/flagged`)
- Entries below 60% helpfulness with 10+ responses
- Priority score for review queue
- Update status: flagged → in_review → resolved

### Weekly Digest (`/weekly-digest`)
- Summary for the week
- Lowest-rated entries
- Breakdown by domain/language/state

### Coverage Gaps (`/gaps`)
- Heatmap of domain × state coverage
- Top 20 priority gaps
- Outreach recommendations

### Admin Panel (`/admin`)
- Expert review workflow
- Approve/reject AI-generated entries
- Review pending entries

## 🔧 API Reference

### Feedback Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/feedback/` | Submit feedback |
| GET | `/api/feedback/{gdb_entry_id}` | Get feedback for entry |
| GET | `/api/feedback/{gdb_entry_id}/stats` | Get entry statistics |

### Dashboard Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/overview` | Overview statistics |
| GET | `/api/dashboard/entries` | All entries with stats |
| GET | `/api/dashboard/breakdown/domain` | By domain |
| GET | `/api/dashboard/breakdown/language` | By language |
| GET | `/api/dashboard/breakdown/state` | By state |

### Flagged Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/flagged/` | List flagged entries |
| GET | `/api/flagged/{gdb_entry_id}` | Get specific entry |
| PATCH | `/api/flagged/{gdb_entry_id}/status` | Update status |
| DELETE | `/api/flagged/{gdb_entry_id}` | Remove from flagged |

### Chat Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat-query` | Ask question, get AI answer |
| POST | `/api/submit-feedback` | Submit inline feedback |

### Gap Detection Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gaps/gap-report/latest` | Latest gap report |
| POST | `/api/gaps/gap-report/generate` | Generate new report |
| GET | `/api/gaps/coverage/heatmap` | Coverage statistics |
| GET | `/api/gaps/disclaimers/recent` | Recent disclaimers |

## ⏰ Scheduled Jobs

| Job | Schedule | Function |
|-----|----------|----------|
| Auto-flag | Daily 2 AM UTC | Flags entries <60% helpful with 10+ responses |
| Weekly Digest | Mondays 3 AM UTC | Creates weekly summary report |
| Gap Report | Mondays 3:30 AM UTC | Detects GDB coverage gaps |

## 🧪 Testing

### Run Demo Mode

```bash
# Simulate farmer interactions
cd whatsapp-bot
python demo.py --interactions 10

# View stats
python demo.py --stats

# Interactive mode
python demo.py --interactive
```

### API Testing

```bash
# Health check
curl http://localhost:8000/health

# Get stats
curl http://localhost:8000/api/stats

# Submit feedback
curl -X POST http://localhost:8000/api/feedback/ \
  -H "Content-Type: application/json" \
  -d '{"gdb_entry_id":"gdb_crop_disease_001","farmer_id":"+919000000001","response":"1"}'
```

## 📁 Project Structure

```
ajrasakha/
├── backend/                    # FastAPI backend
│   ├── main.py                 # App entry + APScheduler
│   ├── routers/                # 9 API route modules
│   ├── cron/                   # 3 scheduled jobs
│   ├── services/               # 3 business logic services
│   └── seed_data.py            # Synthetic data
├── frontend/                   # React dashboard
│   ├── src/
│   │   ├── App.js              # Routes
│   │   ├── index.js            # Entry + MUI theme
│   │   ├── pages/              # 10 pages
│   │   ├── components/         # Layout components
│   │   ├── context/            # AuthContext
│   │   └── utils/              # API client
│   └── package.json
├── telegram-bot/               # Telegram bot
│   ├── bot.py                  # Bot handlers
│   └── services/
│       └── question_matcher.py # AI matching
├── whatsapp-bot/               # WhatsApp integration
│   ├── app.py                  # Flask webhook
│   ├── handlers/
│   │   └── feedback_handler.py # Feedback processing
│   └── services/
│       ├── whatsapp_service.py # Twilio integration
│       ├── message_tracker.py  # Message tracking
│       └── gdb_service.py      # GDB queries
├── shared/                     # Shared utilities
│   ├── utils/config.py         # Configuration
│   └── mongodb/                # Connection + schemas
├── integration/                # Integration layer
├── docker/                     # Docker configs
├── .env.example                # Environment template
├── README.md                   # This file
├── LICENSE                     # MIT License
└── PR_STEP_BY_STEP.md          # PR workflow guide
```

## 🔐 Security

- JWT-based authentication for admin routes
- CORS configured for frontend access
- MongoDB connection with TLS
- Environment variables for secrets (never commit .env)

## 📈 Production Deployment

### Docker Compose (Recommended)

```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    env_file:
      - .env

  telegram-bot:
    build: ./telegram-bot
    env_file:
      - .env
    depends_on:
      - backend

  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
```

### Environment-Specific Settings

For production, update `.env`:
```env
MONGODB_URI=mongodb+srv://prod_user:prod_pass@prod-cluster.mongodb.net
AUTO_FLAG_THRESHOLD=0.65
JWT_SECRET=your_secure_random_string
CORS_ORIGINS=https://yourdomain.com
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

## 👥 Team

Built for AjraSakha - Empowering Indian farmers with AI-powered agricultural knowledge.

## 🙏 Acknowledgments

- NVIDIA NIM API for AI answer generation
- Twilio for WhatsApp integration
- Material UI for component library
- FastAPI for modern Python web framework