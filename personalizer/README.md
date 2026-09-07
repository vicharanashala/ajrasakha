# AjraSakha Personalizer

The `personalizer` folder contains the context-aware AI engine for AjraSakha. It bridges the gap between generic AI responses and highly contextual, farm-specific agronomic advice.

By combining real-time satellite imagery, precise local weather forecasts, textbook agricultural practices, and expert-verified historical answers, the Personalizer ensures that the AI's recommendations are uniquely tailored to each farmer's exact location and situation.

## Key Features

### Google Earth Engine (GEE) Satellite Fetch
- **Context Injection:** When a farmer asks a question, their GPS coordinates are used to fetch real-time and historical satellite data via Google Earth Engine.
- **Metrics Collected:** 
  - **NDVI** (Normalized Difference Vegetation Index) for crop health.
  - **NDWI** (Normalized Difference Water Index) for water stress.
  - **Soil Moisture** and **Land Surface Temperature (LST)**.
  - Historical rainfall averages.
- **Benefit:** The AI knows the exact physical conditions of the farm without the farmer needing to explain them.

### OpenWeather Fetch
- **Live Forecasts:** Retrieves the 5-day weather forecast for the farmer's precise coordinates.
- **Agronomic Planning:** Allows the AI to tailor advice (e.g., "Do not spray pesticide today because heavy rain is expected tomorrow").

###  Personalized Responses & Follow-up Enabled Chat
- **RAG Architecture:** Uses Retrieval-Augmented Generation (RAG) to combine the farmer's query with the fetched context (Satellite + Weather + Localized Package of Practices).
- **Conversational Memory:** Maintains a continuous chat session, remembering the last 3 turns of conversation so the farmer can ask follow-up questions naturally without repeating context.
- **Multilingual Support:** Queries are automatically translated from the farmer's language to English for processing, and the AI's response is translated back using the Sarvam API.

### Smart Escalations
- **Safety First:** The AI is instructed via a strict system prompt to recognize severe agricultural emergencies or highly specialized technical queries.
- **Auto-Escalation:** If the AI determines a query is too complex or risky, it replies with `I_DONT_KNOW_ESCALATE`.
- **Admin Handoff:** The system automatically forwards the question, along with all the injected satellite and weather context, to the human expert Admin Dashboard (`/api/questions/escalate-from-personalizer`).

### Vectorization and Reuse of Expert Answers
- **Knowledge Loop:** When a human expert answers an escalated question in the Admin Dashboard, a background worker (`ingest_expert_answers` in `main.py`) detects it.
- **Gemini Embeddings:** The worker combines the original Question and the Expert's Answer, generates a high-dimensional vector embedding using `gemini-embedding-2`, and pushes it to the `pop_v2` knowledge base collection in MongoDB.
- **Continuous Learning:** The AI now has this expert-verified scenario in its vector space, meaning future farmers asking similar questions will instantly receive the expert's advice via vector similarity search.

---

## Folder Structure

```text
personalizer/
├── backend/                  # FastAPI Python Backend
│   ├── main.py               # Entry point, API routes, and background workers
│   ├── services/
│   │   ├── gee_service.py    # Google Earth Engine integration
│   │   ├── weather_service.py# OpenWeather integration
│   │   ├── llm_router.py     # AI routing, RAG assembly, and escalation logic
│   │   └── sarvam_service.py # Translation services
│   └── scripts/              # Data ingestion and migration scripts
├── frontend/                 # React Frontend
│   └── (UI components for the chat interface)
├── .env                      # Environment configuration
└── README.md                 # This file
```

---

## Environment Variables (`.env`)

To run the Personalizer, ensure your `.env` file is configured with the following structure:

```env
# Google Earth Engine Credentials
GEE_SERVICE_ACCOUNT=your-service-account@project.iam.gserviceaccount.com
GEE_PRIVATE_KEY_PATH=path-to-your-service-account-key.json
GEE_PROJECT_ID=your-gcp-project-id

# OpenWeather API
OPENWEATHER_API_KEY=your-openweather-api-key

# MongoDB (For Admin Review Queue & PoP Search)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=ajrasakha
POP_COLLECTION=pop_v2
REVIEW_COLLECTION=ajrasakha_faq

# LLM Config (Local/Fallback)
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=qwen2.5

# Ports
PORT=8000
FRONTEND_PORT=3145

# API Keys
GEMINI_API_KEY=your-gemini-api-key
LGD_API_KEY=your-lgd-api-key
SARVAM_API_KEY=your-sarvam-api-key
```
