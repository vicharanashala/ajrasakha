# AjraSakha AI Agent

## Prerequisites

- Docker + Docker Compose
- `uv` (Python package manager)

## Setup

1. Copy the env file:
   ```
   cp .env.example .env
   ```
   Fill in all required values in `.env`.

2. Install dependencies:
   ```
   uv sync
   uv pip install aegra-cli
   ```

## Running with Docker

Start all services (Postgres, Redis, API):
```
aegra up
```

Stop all services:
```
aegra down
```

View logs:
```
docker compose -f docker-compose.yml logs -f
```

## Running in Development (hot reload)

Make sure Docker is running, then:
```
aegra dev
```

Server starts at `http://127.0.0.1:2026` by default.

Options:
```
aegra dev --port 8000          # custom port
aegra dev --no-db-check        # skip auto Postgres check
aegra dev -e /path/to/.env     # use specific env file
```

## Project Structure

```
ajrasakha/      # agent source code
docker-compose.yml
aegra.json      # aegra config
pyproject.toml
```

## Services

| Service    | Description              |
|------------|--------------------------|
| ai-api     | LangGraph agent FastAPI  |
| ai-postgres | PostgreSQL (checkpointer) |
| ai-redis   | Redis                    |