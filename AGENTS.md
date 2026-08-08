# Ajrasakha - Project Context

## Overview
Ajrasakha is a multilingual agricultural AI assistant for Indian farmers. It answers farming queries (crops, weather, market prices, soil, government schemes) in regional Indian languages using an AI agent with supervisor+subagent architecture.

## Architecture
Monorepo with independently deployable microservices:

| Service | Tech | Purpose |
|---|---|---|
| `frontend/` | React 19, Vite 6, TanStack Router, Tailwind CSS 4, shadcn/ui | Expert review web UI |
| `backend/` | Node.js 22, Express 5, TypeScript, Inversify DI, MongoDB 6 | Core API (Q&A, auth, users, WhatsApp, voice) |
| `ai/` | Python 3.12, LangChain, LangGraph, FastAPI, Claude Sonnet/Haiku | AI agent with supervisor+subagents |
| `mcp/` | Python, FastMCP 3 | MCP tool servers (golden dataset, weather, market, soil, schemes, FAQ) |
| `apis/` | Python, FastAPI | Proxy API, OpenAI adapter, answer generation |

## AI Agent Architecture
- **Planner** (Claude Sonnet) classifies query, extracts entities, determines tools
- **Subagents**: GDB (golden dataset), Weather, Market, Soil, Schemes, Chemical Checker
- Each subagent connects to its own MCP server over HTTP
- Three-tier answer: Golden Dataset (expert verified) -> PoP (guidelines) -> AI-generated fallback
- Translation via Sarvam AI API (multilingual Indian languages)

## Databases
- **MongoDB Atlas** — primary store (questions, answers, golden dataset, analytics)
- **PostgreSQL 18 + pgvector** — LangGraph state checkpointing
- **Redis 7** — LangGraph job queue

## Key Commands
```bash
# Full stack
docker compose -f docker-compose.app.yml up --build

# Frontend
cd frontend && pnpm dev          # port 5173

# Backend
cd backend && pnpm dev           # port 4000

# AI Agent
cd ai && aegra dev               # port 2026

# MCP Servers
cd mcp/mcp_containers && docker compose up --build
```

## Code Conventions
- Backend: GTS (Google TypeScript Style), Prettier, ESM modules, decorator-based routing (routing-controllers)
- Frontend: strict TypeScript, `@/` path alias to `src/`, file-based routing (TanStack Router)
- Python: PEP conventions, ruff formatting
- Backend modules: `src/modules/{name}/` with `{name}ModuleControllers`, `{name}ModuleValidators`, `{name}ContainerModules`
- Frontend features: `src/features/{featureName}/`
- AI agents: `ai/ajrasakha/agents/{name}_agent.py` with `graph` export
- MCP servers: `mcp/mcp_containers/{name}/` with independent Dockerfile

## Environment
- MongoDB: `DB_URL`, `DB_NAME=agriai`
- Firebase: `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_PROJECT_ID`
- AI: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL=claude-sonnet-4-6`, `SARVAM_API_KEY`
- Backend port: 4000, Frontend port: 8080, AI port: 2026

## Deployment
- Frontend: Firebase Hosting
- Backend: Google Cloud Run (asia-south2)
- AI + MCP: Self-hosted VM via Docker + Tailscale
- Docker Hub: `vicharanashala/*`
- All workflows in `.github/workflows/` are manually triggered

## Testing
- Backend: Vitest + Supertest + mongodb-memory-server
- Frontend: Vitest + Testing Library + MSW
- AI: pytest (42+ test files)
