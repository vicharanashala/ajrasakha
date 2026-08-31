# Annam Call Center (ACC) Application Documentation

Annam Call Center (ACC) is a dedicated real-time agricultural call center microservice within the **Ajrasakha** ecosystem. It provides live voice-based agricultural advisory support to farmers across India by integrating Plivo telephony, dual-track Speech-to-Text (STT) and translation via Sarvam AI, human-in-the-loop (HITL) AI query synthesis via LangGraph, cloud audio storage pipelines, Fast2SMS advisory dispatches, and role-based agent dashboards.

---

## Table of Contents

1. [High-Level System Architecture](#1-high-level-system-architecture)
2. [Codebase & Directory Structure](#2-codebase--directory-structure)
3. [Deep Code Flow & Call Lifecycle](#3-deep-code-flow--call-lifecycle)
   - [Phase 1: Agent Online Status & Dynamic SIP Allocation](#phase-1-agent-online-status--dynamic-sip-allocation)
   - [Phase 2: Inbound Call Reception & Plivo Webhook Routing](#phase-2-inbound-call-reception--plivo-webhook-routing)
   - [Phase 3: Real-Time Dual-Track Audio Streaming & Sarvam AI STT](#phase-3-real-time-dual-track-audio-streaming--sarvam-ai-stt)
   - [Phase 4: Live In-Call Workspace (Farmer CRM, Live Chat & SMS)](#phase-4-live-in-call-workspace-farmer-crm-live-chat--sms)
   - [Phase 5: Call Termination & MongoDB Persistence](#phase-5-call-termination--mongodb-persistence)
   - [Phase 6: LangGraph Human-in-the-Loop (HITL) AI Pipeline](#phase-6-langgraph-human-in-the-loop-hitl-ai-pipeline)
4. [Call Audio Recording & Playback Subsystem](#4-call-audio-recording--playback-subsystem)
   - [Zero-Memory Streaming Ingestion](#zero-memory-streaming-ingestion)
   - [Role-Based Signed Playback URLs](#role-based-signed-playback-urls)
   - [Interactive Waveform Audio Player](#interactive-waveform-audio-player)
   - [Automated 30-Day Plivo Cost Optimization Job](#automated-30-day-plivo-cost-optimization-job)
5. [Environment Variables Reference](#5-environment-variables-reference)
   - [Backend Environment Variables (`acc-backend/.env`)](#backend-environment-variables-acc-backendenv)
   - [Frontend Environment Variables (`acc-frontend/.env`)](#frontend-environment-variables-acc-frontendenv)
6. [Backend Module & Service Architecture](#6-backend-module--service-architecture)
7. [Frontend Component & Service Architecture](#7-frontend-component--service-architecture)
8. [Local Development & Setup](#8-local-development--setup)

---

## 1. High-Level System Architecture

```mermaid
graph TD
    Farmer["🌾 Farmer (Mobile Phone / PSTN)"] -->|Voice Call| Plivo["📞 Plivo Telephony Platform"]
    
    subgraph ACC_Backend ["⚙️ ACC Backend (Node.js 20 + Express v5 + InversifyJS)"]
        PlivoWebhook["POST /api/plivo/answer"]
        PlivoRecordHook["POST /api/plivo/webhook/record"]
        WSServer["WebSocket Server (/plivo-stream)"]
        PlivoService["PlivoService & AgentAssignmentService"]
        StorageService["StorageService (Audio Stream Pipeline)"]
        AccAgentService["AccAgentService (LangGraph Client)"]
        CronJobs["node-cron (Heartbeat + Plivo Cleanup)"]
    end

    subgraph ACC_Frontend ["🖥️ ACC Frontend (React 19 + Vite + TanStack Router)"]
        WebRTC["Plivo Browser SDK (WebRTC Softphone)"]
        AgentUI["CallInterface (Live Bilingual Chat Bubbles)"]
        HITLForm["HITL Review Form & Answer Generator"]
        AudioPlayerComponent["AudioPlayer (Signed URLs + Scrubber)"]
    end

    subgraph External_Services ["🌐 External Cloud & AI Services"]
        SarvamSTT["🗣️ Sarvam AI STT & Translation (4× WS saaras:v3)"]
        AjrasakhaAI["🤖 Ajrasakha AI Engine (LangGraph Python API)"]
        CloudStorage["🪣 Cloud Storage (Call Recordings)"]
        Firebase["🔐 Firebase Authentication"]
        MongoDB[("🗄️ MongoDB Atlas (call_details, call_queries, call_farmers)")]
        Fast2SMS["📱 Fast2SMS Gateway (Quick SMS Bulk API)"]
        ZohoMail["📧 Zoho SMTP"]
    end

    Plivo -->|HTTP POST Webhook| PlivoWebhook
    Plivo <-->|L16 PCM Audio (both tracks)| WSServer
    Plivo -->|SIP WebRTC Ringing| WebRTC
    PlivoRecordHook -->|Stream MP3| StorageService
    StorageService -->|Pipe Stream| CloudStorage
    
    WSServer <-->|4× WebSocket Audio Streams| SarvamSTT
    WSServer -->|Targeted Chat Events| AgentUI
    AgentUI -->|Auth & Token| Firebase
    AgentUI -->|Review / Edit Extracted Fields| HITLForm
    HITLForm <-->|REST API| AccAgentService
    AccAgentService <-->|REST API| AjrasakhaAI
    
    PlivoService -->|Save Records & Transcripts| MongoDB
    StorageService -->|Signed Playback URL (15 mins)| AudioPlayerComponent
    PlivoService -->|SMS Advisory| Fast2SMS
```

---

## 2. Codebase & Directory Structure

```
ajrasakha/acc/
├── README.md                      # ACC Application documentation
├── CALL_FLOW_DETAILED.md          # Sequence-level call workflow details
├── gcp-cors.json                  # Storage CORS configuration policy
├── storage.rules                  # Storage security rules
├── firebase.json                  # Firebase Emulator configuration
├── .firebaserc                    # Firebase project definition
│
├── acc-backend/                   # ACC Backend Microservice (Port 4001)
│   ├── src/
│   │   ├── index.ts               # Server entry point, Scalar API docs, routing-controllers
│   │   ├── container.ts           # Root InversifyJS Dependency Injection container
│   │   ├── config/
│   │   │   ├── app.ts             # Central app configuration loaded from env
│   │   │   └── firebaseAdmin.ts   # Firebase Admin SDK & Storage initialization
│   │   ├── bootstrap/
│   │   │   ├── loadModules.ts     # Dynamic module loader & DI binder
│   │   │   ├── websocket.ts       # WebSocket server for /plivo-stream
│   │   │   └── jobs/
│   │   │       ├── agentStatusCleanupJob.ts    # 1-min cron: frees inactive agents (>75s)
│   │   │       └── plivoRecordingCleanupJob.ts  # 2 AM cron: purges Plivo recordings >30 days
│   │   ├── modules/
│   │   │   ├── acc-agent/         # LangGraph AI client (threads, extract, update-state, resume)
│   │   │   ├── auth/              # Firebase token verification & user profile sync
│   │   │   ├── context/           # Context notes & Sarvam REST translation (22+ languages)
│   │   │   ├── plivo/             # Telephony webhooks, agent assignment, Sarvam WS streaming
│   │   │   ├── storage/           # StorageService (Audio streaming upload, signed playback URLs)
│   │   │   └── user/              # Agent status toggle, heartbeat watchdog, user CRUD
│   │   ├── shared/
│   │   │   ├── database/          # Mongoose models & repository classes
│   │   │   │   ├── interfaces/    # ICallDetailsRepository, IFarmerRepository, etc.
│   │   │   │   └── providers/     # MongoCallDetailsRepository, MongoUserRepository, etc.
│   │   │   ├── middleware/        # Logging, HTTP error handling, role authorization
│   │   │   └── functions/         # OpenAPI spec generation, token checkers
│   │   └── utils/                 # Env parser, logger, crypto helpers
│   ├── .env.example               # Backend environment variables template
│   ├── Dockerfile                 # Container definition
│   └── package.json / pnpm-lock.yaml
│
└── acc-frontend/                  # ACC Frontend Client (Vite + React 19)
    ├── src/
    │   ├── main.tsx               # Client entry point
    │   ├── config/
    │   │   ├── env.ts             # Type-safe client env getters
    │   │   ├── firebase.ts        # Client Firebase SDK initialization
    │   │   └── runtime-env.ts     # Dynamic window.__ENV__ & import.meta.env resolver
    │   ├── routes/                # TanStack File-based Router
    │   │   ├── __root.tsx         # Root layout with navbar & providers
    │   │   ├── index.tsx          # Home redirection logic
    │   │   ├── auth/              # Login / Register pages
    │   │   ├── call-agent-dashboard/ # Main agent workstation & analytics
    │   │   └── profile/           # User profile & credentials settings
    │   ├── components/
    │   │   ├── CallInterface.tsx  # Main 3-column in-call workspace (CRM + Chat + HITL AI)
    │   │   ├── IncomingCallBox.tsx # WebRTC incoming call ringing notification
    │   │   ├── CallHistory.tsx    # Call history browser with Excel/CSV export & AudioPlayer
    │   │   ├── CallLog.tsx        # Admin call log view
    │   │   ├── ACCAnalyticsDashboard.tsx # System metrics, domain breakdown, trends
    │   │   ├── FarmerDetails.tsx  # Farmer profile viewer/editor
    │   │   ├── ManageCallAgents.tsx # Agent status monitoring & SIP management
    │   │   ├── PlivoEndpointsModal.tsx # CRUD modal for SIP endpoints
    │   │   ├── WeatherWidget.tsx  # Live district-level IMD weather card
    │   │   └── atoms/
    │   │       ├── AudioPlayer.tsx # Waveform audio player with signed URL streaming
    │   │       └── button.tsx     # Reusable UI primitives
    │   ├── hooks/
    │   │   └── api/               # API clients (Plivo, AccAgent, Farmer, User, Auth)
    │   └── stores/
    │       └── auth-store.ts      # Zustand auth state with persistent localStorage sync
    ├── .env.example               # Frontend environment variables template
    ├── vite.config.ts             # Vite configuration
    └── package.json / pnpm-lock.yaml
```

---

## 3. Deep Code Flow & Call Lifecycle

### Phase 1: Agent Online Status & Dynamic SIP Allocation

1. **Authentication**: Agent signs into the ACC Frontend dashboard using Firebase Authentication.
2. **Going Online**: Agent clicks the **Online** toggle in the UI:
   - Frontend invokes `POST /api/user/toggle-agent-status` (`UserService.toggleAgentStatus(true)`).
   - Backend `AgentAssignmentService.assignAgentNumber(userId)` dynamically assigns the lowest available agent identity (e.g. `agent_1`, `agent_2`).
   - MongoDB updates the user document: `isCallAgentActive = true`, `isBusy = false`, `agent = "agent_1"`.
3. **Plivo WebRTC Registration**:
   - Frontend fetches assigned SIP credentials via `GET /api/plivo/agent-credentials`.
   - `Plivo` Browser SDK initiates in-browser SIP registration via `client.login(username, password)`.
4. **Heartbeat & Inactivity Watchdog**:
   - Frontend dispatches `POST /api/user/heartbeat` every 30 seconds.
   - `agentStatusCleanupJob` runs every 60 seconds on the backend. If an agent has not sent a heartbeat in 75 seconds, they are automatically marked offline and their `agent_N` slot is released.

---

### Phase 2: Inbound Call Reception & Plivo Webhook Routing

1. **Farmer Inbound Call**: A farmer dials the ACC helpline number (`+918000123456`).
2. **Webhook Trigger**: Plivo issues an HTTP POST to `POST /api/plivo/answer` (`PlivoController.answer`).
3. **Atomic Agent Allocation**:
   - `AgentAssignmentService.findAndMarkAvailableAgent(callUuid)` finds the lowest numbered available agent (`isCallAgentActive: true`, `isBusy: false`).
   - Atomically updates the agent status to `isBusy: true` and sets `currentCallUuid: callUuid`.
4. **Plivo XML Response**:
   - The backend responds with XML instructing Plivo to:
     1. Stream raw audio packets to `wss://<BACKEND>/plivo-stream` via `<Stream contentType="audio/x-l16;rate=16000" audioTrack="both">`.
     2. Record the conversation via `<Record action="https://<BACKEND>/api/plivo/webhook/record" fileFormat="mp3" />`.
     3. Bridge the call to the agent's WebRTC softphone: `<Dial><User>sip:agent_1@phone.plivo.com</User></Dial>`.

---

### Phase 3: Real-Time Dual-Track Audio Streaming & Sarvam AI STT

```
  Plivo Telephony
       │ (Base64 L16 PCM 16kHz audio chunks via WebSocket /plivo-stream)
       ▼
  ACC Backend (PlivoService)
       │
       ├── Track 1: "inbound" (Farmer Audio)
       │     ├── Sarvam WS #1 (mode=transcribe) ──► Native Language Text (e.g. Marathi)
       │     └── Sarvam WS #2 (mode=translate)  ──► English Translation
       │
       └── Track 2: "outbound" (Agent Audio)
             ├── Sarvam WS #3 (mode=transcribe) ──► Native Language Text
             └── Sarvam WS #4 (mode=translate)  ──► English Translation
                     │
                     ▼ (1-Second Debounce Aggregator)
       Targeted Broadcast via WebSocket to Assigned Agent
                     │
                     ▼
       Live Chat Bubbles in React CallInterface.tsx
```

1. **WebSocket Handshake (`event: "start"`)**: Plivo connects to `/plivo-stream` with `callId`.
2. **Sarvam AI Multiplexing**: `PlivoService.initializeStreams(callId)` connects **4 simultaneous streaming WebSockets** to Sarvam AI (`wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3`).
3. **Streaming Audio Packets (`event: "media"`)**: Plivo streams 16kHz L16 PCM audio chunks. Backend routes them by track (`inbound` / `outbound`) into the Sarvam WebSockets.
4. **Debouncing & Targeted UI Push**: Partial STT outputs are aggregated with a 1-second debounce buffer and emitted over WebSockets (`type: "transcript"`) exclusively to the assigned agent and moderators.
5. **UI Rendering**: `CallInterface.tsx` renders dynamic green chat bubbles for the farmer (regional language + English) and blue chat bubbles for the agent.

---

### Phase 4: Live In-Call Workspace (Farmer CRM, Live Chat & SMS)

- **Farmer Profile Pane (Left)**: Pre-loads farmer details via `GET /api/farmer/:phoneNo`. Any edits save directly to `call_farmers` in MongoDB.
- **Voice Advice & Translation**: The agent can dictate an advisory using voice input or type in English, click **Translate** (Sarvam REST API `/api/context/translate`), and review the translated message.
- **SMS Delivery**: Clicking **Send SMS** calls `POST /api/plivo/send-message`, which uses Fast2SMS Quick SMS Bulk API to deliver the text advisory directly to the farmer's mobile phone.

---

### Phase 5: Call Termination & MongoDB Persistence

1. **Hangup**: When either party hangs up, Plivo fires `event: "stop"` on the WebSocket stream and `onCallTerminated` in WebRTC.
2. **Stream Flush**: Backend flushes all 4 Sarvam WebSockets and compiles the total conversation transcript.
3. **Database Write**: `PlivoService.saveCallDetails()` writes call metadata, duration, transcripts, and translations into MongoDB `call_details`.
4. **Agent Release**: `UserService.markAgentAsAvailable(agentUserId)` resets `isBusy = false`.

---

### Phase 6: LangGraph Human-in-the-Loop (HITL) AI Pipeline

```
 [Compiled Full Call Transcript]
        │
        ▼ 1. POST /api/questions/acc-agent/thread (Creates LangGraph Thread)
 [Thread ID: th_xxx]
        │
        ▼ 2. POST /api/questions/acc-agent/extract (Runs AI entity extraction)
 [Extracted Entities: Crop, State, District, Domain, Season]
        │
        ▼ (LangGraph Checkpoints & Pauses at node 'extract')
 ╔═════════════════════════════════════════════════════════════════════════╗
 ║ 👤 Human-in-the-Loop Review Form (Agent inspects & edits fields)       ║
 ╚═════════════════════════════════════════════════════════════════════════╝
        │
        ▼ 3. POST /api/questions/acc-agent/update-state (Updates checkpoint state)
        │
        ▼ 4. POST /api/questions/acc-agent/resume (Resumes LangGraph graph)
        │
        ├──► Queries Model Context Protocol (MCP) Servers
        ├──► Queries Agricultural Vector Database
        └──► Fetches Live IMD Weather Data for Farmer's District
        │
        ▼ 5. Final Answer Synthesis
 [Markdown Advisory with Citations + Weather Cards] ──► Saved in `call_queries`
```

1. **Thread Creation**: Agent clicks **"Extract and Verify"** -> `POST /api/questions/acc-agent/thread`.
2. **Entity Extraction**: `POST /api/questions/acc-agent/extract` passes the transcript to LangGraph to identify `extracted_crop`, `extracted_state`, `extracted_district`, `standardized_domains`, and `extracted_season`.
3. **Human Review**: Agent reviews and adjusts any misidentified entities in the draft form.
4. **State Update**: If edited, `POST /api/questions/acc-agent/update-state` writes the corrected data directly into the LangGraph checkpoint (`POST /threads/{id}/state` as node `extract`).
5. **Resume & Answer**: `POST /api/questions/acc-agent/resume` triggers LangGraph to query MCP tools, vector databases, and live weather APIs to produce a verified agricultural response stored in `call_queries`.

---

## 4. Call Audio Recording & Playback Subsystem

The ACC application includes a complete, self-contained call recording, storage, and playback subsystem:

### Zero-Memory Streaming Ingestion
- **Webhook**: `POST /api/plivo/webhook/record` receives recording completion callbacks from Plivo.
- **Pipeline (`StorageService.uploadStreamFromUrl`)**: Uses Node.js `stream/promises` pipeline to stream the MP3 directly from Plivo's media URL into the storage bucket without loading the entire audio file into server memory.
- **Retries**: Retries 3 times with 10-second intervals to allow Plivo's transcoding service to finalize the file.
- **Path Structure**: Files are stored under `${GCP_RECORDINGS_PATH_PREFIX}/${YYYY}/${MM}/${callUuid}_${recordingId}.mp3`.

### Role-Based Signed Playback URLs
- **Endpoint**: `GET /api/plivo/recordings/:callUuid/url` (`PlivoController.getRecordingPlaybackUrl`).
- **Access Control**: Validates caller's Firebase JWT token:
  - **Admins & Moderators**: Authorized for all recordings.
  - **Call Agents**: Authorized only for calls assigned to them.
- **Time-Limited URL**: Generates a secure 15-minute V4 signed URL (`StorageService.getSignedPlaybackUrl`).
- **Emulator Support**: When running locally with `FIREBASE_STORAGE_EMULATOR_HOST`, returns direct emulator URLs.

### Interactive Waveform Audio Player
- **Component**: [`AudioPlayer.tsx`](file:///c:/Users/FD/Desktop/ajrasakha/acc/acc-frontend/src/components/atoms/AudioPlayer.tsx).
- **Features**:
  - Full timeline scrubbing with range request seeking.
  - Playback speed multiplier (`0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`).
  - Volume slider and mute toggle.
  - Automatic URL refresh on token expiration.
  - Direct MP3 download button.

### Automated 30-Day Plivo Cost Optimization Job
- **Cron Job**: [`plivoRecordingCleanupJob.ts`](file:///c:/Users/FD/Desktop/ajrasakha/acc/acc-backend/src/bootstrap/jobs/plivoRecordingCleanupJob.ts).
- **Schedule**: Runs daily at 2:00 AM (`0 2 * * *`).
- **Operation**: Identifies call records with recordings older than 30 days, deletes the recording from Plivo via Plivo API to eliminate recurring storage fees, and updates MongoDB `plivoDeleted: true`. The audio remains permanently preserved in the cloud storage bucket.

---

## 5. Environment Variables Reference

### Backend Environment Variables (`acc-backend/.env`)

| Variable | Type | Required? | Example Value | Description |
| :--- | :--- | :---: | :--- | :--- |
| `NODE_ENV` | String | No | `development` / `production` | Runtime environment mode |
| `APP_PORT` / `PORT` | Number | No | `4001` | Server listening port (default: 4001) |
| `APP_URL` | String | Yes | `https://api.acc.annam.org` | Public backend base URL |
| `APP_ORIGINS` | String | Yes | `http://localhost:5173,https://acc.annam.org` | Comma-separated CORS allowed origins |
| `APP_ROUTE_PREFIX` | String | No | `/api` | API prefix (default: `/api`) |
| `DB_URL` | String | **Yes** | `mongodb://localhost:27017` or Atlas URI | MongoDB connection string |
| `DB_NAME` | String | **Yes** | `agriai` | MongoDB database name |
| `FIREBASE_PROJECT_ID` | String | **Yes** | `annam-call-center` | Firebase/GCP Project ID |
| `FIREBASE_CLIENT_EMAIL` | String | **Yes** | `firebase-adminsdk-xxx@proj.iam.gserviceaccount.com` | Service account email |
| `FIREBASE_PRIVATE_KEY` | String | **Yes** | `"-----BEGIN PRIVATE KEY-----\nMIIE...-----END PRIVATE KEY-----"` | Service account private RSA key |
| `FIREBASE_STORAGE_BUCKET` | String | **Yes** | `annam-call-recordings` | Target storage bucket name |
| `GCP_RECORDINGS_PATH_PREFIX` | String | No | `call-recordings` | Directory path prefix in bucket |
| `FIREBASE_STORAGE_EMULATOR_HOST` | String | Local Only | `127.0.0.1:9199` | Connects backend to local Firebase Storage emulator |
| `PLIVO_AUTH_ID` | String | **Yes** | `MAMZXXXXXXXXXXXXXXXX` | Plivo Account Auth ID |
| `PLIVO_AUTH_TOKEN` | String | **Yes** | `ZmNmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` | Plivo Auth Token |
| `PLIVO_NUMBER` | String | **Yes** | `+918000123456` | Plivo Caller ID phone number |
| `PLIVO_STREAM_URL` | String | **Yes** | `wss://api.acc.annam.org/plivo-stream` | Public WebSocket endpoint for Plivo audio stream |
| `PLIVO_RECORD_CALLBACK_URL` | String | **Yes** | `https://api.acc.annam.org/api/plivo/webhook/record` | Recording completion webhook URL |
| `SARVAM_API_KEY` | String | **Yes** | `sarvam_api_key_xxxxxxxx` | Sarvam AI API Key for STT & Translation |
| `FAST2SMS_API_KEY` | String | **Yes** | `fast2sms_key_xxxxxxxx` | Fast2SMS Quick SMS API Key |
| `ACC_AGENT_BASE_URL` | String | **Yes** | `http://localhost:9017` | LangGraph Python AI service base URL |
| `ACC_AGENT_ASSISTANT_ID` | String | **Yes** | `acc_agent` | LangGraph assistant identifier |
| `EMAIL_USER` / `EMAIL_PASS` | String | No | `support@annam.org` | Zoho Mail SMTP credentials |

---

### Frontend Environment Variables (`acc-frontend/.env`)

| Variable | Type | Required? | Example Value | Description |
| :--- | :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | String | **Yes** | `http://localhost:4001/api` | Base URL for ACC backend API |
| `VITE_FIREBASE_API_KEY` | String | **Yes** | `AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxx` | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | String | **Yes** | `annam-call-center.firebaseapp.com` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | String | **Yes** | `annam-call-center` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | String | **Yes** | `annam-call-recordings` | Firebase storage bucket name |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | String | **Yes** | `123456789012` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | String | **Yes** | `1:123456789012:web:abcdef123456` | Firebase web app ID |
| `VITE_PLIVO_STREAM_URL` | String | **Yes** | `wss://api.acc.annam.org/plivo-stream` | WebSocket URL for transcript streaming |
| `VITE_SARVAM_API_KEY` | String | No | `sarvam_api_key_xxxxxxxx` | Sarvam API key for client-side tools |
| `VITE_PLIVO_AGENT_1_USERNAME` | String | No | `sip:agent_1@phone.plivo.com` | Fallback SIP endpoint if not in DB |
| `VITE_PLIVO_AGENT_1_PASSWORD` | String | No | `agent_secret_password` | Fallback SIP password |

---

## 6. Backend Module & Service Architecture

| Module | Service / Class | Controller / Endpoint | Description |
| :--- | :--- | :--- | :--- |
| `storage` | `StorageService` | — | Zero-memory audio streaming upload, V4 signed URL generation, file existence and deletion checks. |
| `plivo` | `PlivoService` | `PlivoController` | Telephony interface, Sarvam STT WebSocket multiplexer, Fast2SMS endpoint, signed playback URL endpoint, call history & CSV exports. |
| `plivo` | `AgentAssignmentService` | — | Dynamic SIP endpoint assignment (`agent_1`, `agent_2`), availability state machine, SIP credential retrieval. |
| `plivo` | `FarmerService` | `FarmerController` | CRUD operations for farmer profiles indexed by phone number in `call_farmers`. |
| `acc-agent` | `AccAgentService` | `AccAgentController` | LangGraph Python API connector: thread management, entity extraction, state updates, checkpoint resumption, Q&A synthesis. |
| `context` | `ContextService` | `ContextController` | Context persistence and Sarvam REST text translation (22+ Indian languages with chunking). |
| `auth` | `FirebaseAuthService` | `AuthController` | Firebase Admin token verification and user profile sync. |
| `user` | `UserService` | `UserController` | Agent online/offline toggling, heartbeat watchdog, availability status queries. |
| `jobs` | `agentStatusCleanupJob` | `node-cron` (`*/1 * * * *`) | Marks agents offline if heartbeat is missing for >75s. |
| `jobs` | `plivoRecordingCleanupJob` | `node-cron` (`0 2 * * *`) | Daily purge of Plivo cloud recordings >30 days. |

---

## 7. Frontend Component & Service Architecture

| Component | Path | Description |
| :--- | :--- | :--- |
| `CallInterface` | `src/components/CallInterface.tsx` | Primary 3-column in-call workspace: Farmer CRM (left), Live bilingual chat (center), LangGraph HITL review (right). |
| `IncomingCallBox` | `src/components/IncomingCallBox.tsx` | WebRTC incoming call alert banner with farmer name pre-lookup and accept/reject controls. |
| `AudioPlayer` | `src/components/atoms/AudioPlayer.tsx` | Custom audio player with signed URL playback, timeline scrubber, playback speeds (0.75x–2.0x), volume/mute, and MP3 download. |
| `CallHistory` | `src/components/CallHistory.tsx` | Paginated call history browser with audio playback, domain filters, date pickers, and Excel/CSV download. |
| `CallLog` | `src/components/CallLog.tsx` | Administrative call log view with agent performance metrics. |
| `ACCAnalyticsDashboard` | `src/components/ACCAnalyticsDashboard.tsx` | Analytics dashboard displaying call volume trends, domain distributions, and agent statistics. |
| `ManageCallAgents` | `src/components/ManageCallAgents.tsx` | Call Center Manager interface for monitoring agent availability and status. |
| `PlivoEndpointsModal` | `src/components/PlivoEndpointsModal.tsx` | Modal for creating, viewing, editing, and deleting Plivo SIP endpoints. |
| `FarmerDetails` | `src/components/FarmerDetails.tsx` | Interactive farmer profile editor (crop, village, district, state, land size, KCC). |
| `WeatherWidget` | `src/components/WeatherWidget.tsx` | Real-time district-level IMD weather card displaying temperature, rainfall, humidity, and forecasts. |

---

## 8. Local Development & Setup

### Prerequisites
- **Node.js**: v20.x or higher
- **pnpm**: v9.x or v10.x (`npm install -g pnpm`)
- **MongoDB**: Local instance running on port `27017` or a MongoDB Atlas URI
- **Ajrasakha AI Engine**: LangGraph Python service running on port `9017`

---

### Step 1: Configure and Start ACC Backend

```bash
cd ajrasakha/acc/acc-backend

# 1. Install dependencies
pnpm install

# 2. Configure environment variables
cp .env.example .env
# Fill in your MongoDB, Firebase, Plivo, and Sarvam credentials

# 3. Start Backend in Development Mode
pnpm run dev
```
> ACC Backend will run at: `http://localhost:4001`  
> Interactive Scalar API Documentation: `http://localhost:4001/api/reference`

---

### Step 2: Configure and Start ACC Frontend

```bash
cd ajrasakha/acc/acc-frontend

# 1. Install dependencies
pnpm install

# 2. Configure environment variables
cp .env.example .env
# Fill in your Firebase Client SDK keys and Backend API URL

# 3. Start Frontend in Development Mode
pnpm run dev
```
> ACC Frontend will run at: `http://localhost:5173`

---

### Step 3: Local Storage Emulator Testing (Optional)

To test audio recording uploads and playback locally with the Firebase Storage Emulator:

```bash
cd ajrasakha/acc
firebase emulators:start --only storage
```

Set the emulator host in `acc/acc-backend/.env`:
```env
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```

---

*Documentation maintained by the Annam Call Center (ACC) Core Engineering Team.*
