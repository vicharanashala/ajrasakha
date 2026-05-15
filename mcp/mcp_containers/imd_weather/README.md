# IMD India weather (FastAPI + FastMCP)

REST and MCP access to the IMD mirror: forecast, nearest AWS station, district/subdivision warnings and rainfall, or a bundled payload.

## Ports

| Service   | Default port | Env override   |
|-----------|--------------|----------------|
| FastAPI   | 9004         | `IMD_API_PORT` |
| FastMCP   | 9005         | `IMD_MCP_PORT` |

Base URLs for upstream IMD mirror APIs (optional overrides):

- `IMD_CITY_BASE` — city / geocode APIs
- `IMD_MAUSAM_BASE` — mausam APIs

## Run locally

```bash
./run.sh
```

## Docker Compose

From this directory:

```bash
docker compose up --build
```

Then use the curls below against `localhost:9004` (or set `IMD_PUBLISH_API_PORT` / `IMD_PUBLISH_MCP_PORT` before `docker compose up` to publish different host ports).

## Quick `curl` checks (FastAPI)

Health:

```bash
curl -sS "http://127.0.0.1:9004/health"
```

Forecast by lat/lon (GET):

```bash
curl -sS "http://127.0.0.1:9004/imd/weather?latitude=28.6139&longitude=77.2090&data_type=forecast"
```

Same request as POST (JSON body):

```bash
curl -sS -X POST "http://127.0.0.1:9004/imd/weather" \
  -H "Content-Type: application/json" \
  -d '{"latitude":28.6139,"longitude":77.2090,"data_type":"bundle"}'
```

`data_type` values include: `forecast`, `current_aws`, `district_warnings`, `district_rainfall`, `district`, `subdivision_warnings`, `subdivision_rainfall`, `bundle` (plus aliases documented in the MCP tool).

## MCP (streamable HTTP)

MCP listens on port **9005** by default, path **`/mcp`** (`IMD_MCP_PATH`). Use an MCP client rather than raw `curl` for full protocol traffic.
