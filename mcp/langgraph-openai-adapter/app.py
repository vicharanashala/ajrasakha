import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sse_starlette.sse import EventSourceResponse

from config import (
    LANGGRAPH_ASSISTANT_ID,
    LANGGRAPH_BASE_URL,
    MONGO_URI,
)
from langgraph_bridge import complete_openai_from_langgraph, stream_openai_from_langgraph
from mongo_user import get_user_context_headers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [langgraph-openai-adapter] %(message)s",
)
logger = logging.getLogger("langgraph-openai-adapter")

app = FastAPI(title="LangGraph OpenAI adapter")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FORWARD_REQUEST_HEADERS = (
    "x-conversation-id",
    "x-message-id",
    "x-parent-message-id",
    "x-user-id",
    "x-user-email",
    "x-user-name",
)


def _pick_forward_headers(request: Request) -> dict[str, str]:
    picked: dict[str, str] = {}
    for name in FORWARD_REQUEST_HEADERS:
        value = request.headers.get(name)
        if value:
            picked[name] = value
    return picked


def _log_request(path: str, payload: dict | list | None, extra: dict | None = None) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "path": path,
        "payload": payload,
    }
    if extra:
        entry.update(extra)
    logger.info("incoming request: %s", json.dumps(entry, ensure_ascii=False, default=str))


async def _user_context_headers(request: Request) -> dict[str, str]:
    user_id = request.headers.get("x-user-id")
    if not user_id:
        return {}
    return await asyncio.to_thread(get_user_context_headers, user_id)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "langgraph": LANGGRAPH_BASE_URL,
        "langgraph_assistant": LANGGRAPH_ASSISTANT_ID,
        "mongo_configured": bool(MONGO_URI),
    }


async def _stream_ajrasakha_response(body: dict, request: Request):
    context_headers = await _user_context_headers(request)
    try:
        async for line in stream_openai_from_langgraph(
            body,
            request_headers=dict(request.headers),
            context_headers=context_headers,
        ):
            if line.startswith("data: "):
                yield {"data": line[6:].rstrip("\n")}
            else:
                yield {"data": line}
    except httpx.HTTPStatusError as exc:
        error_body = exc.response.content.decode("utf-8", errors="replace")
        logger.error("langgraph stream error: %s", error_body)
        yield {"event": "error", "data": error_body}
    except Exception as exc:
        logger.exception("langgraph bridge error")
        yield {"event": "error", "data": json.dumps({"error": str(exc)})}


@app.api_route("/v1/ajrasakha/models", methods=["GET", "POST"])
async def ajrasakha_models(request: Request):
    """OpenAI models list for LibreChat custom endpoint discovery."""
    body = {
        "object": "list",
        "data": [
            {
                "id": LANGGRAPH_ASSISTANT_ID,
                "object": "model",
                "created": int(datetime.now(timezone.utc).timestamp()),
                "owned_by": "ajrasakha",
            }
        ],
    }
    _log_request("/v1/ajrasakha/models", None, {"method": request.method})
    return JSONResponse(body)


@app.post("/v1/ajrasakha/chat/completions")
async def ajrasakha_chat_completions(request: Request):
    """
    OpenAI-compatible bridge to the AjraSakha LangGraph agent.

    Requires LangGraph running (e.g. ``uv run langgraph dev`` in ``ajrasakha/ai``).
    Uses ``x-conversation-id`` (or body ``thread_id``) for multi-turn checkpointing.
    Parses live GPS from the LibreChat system prompt (``promptPrefix``), falls back to
    ``body.location`` latitude/longitude then Mongo ``farmerProfile.location`` (via ``x-user-id``).
    Only ``latitude`` and ``longitude`` are sent to LangGraph in ``run_input["location"]`` (no
    state or district from profile). Optionally syncs live coordinates back to Mongo when
    ``LOCATION_SYNC_TO_DB`` is enabled.
    """
    body = await request.json()
    incoming = _pick_forward_headers(request)
    context_headers = await _user_context_headers(request)
    _log_request(
        "/v1/ajrasakha/chat/completions",
        body,
        {"forwarded_headers": {**incoming, **context_headers}, "bridge": "langgraph"},
    )

    if body.get("stream", True):
        return EventSourceResponse(_stream_ajrasakha_response(body, request))

    try:
        result = await complete_openai_from_langgraph(
            body,
            request_headers=dict(request.headers),
            context_headers=context_headers,
        )
        return JSONResponse(result)
    except httpx.HTTPStatusError as exc:
        return Response(
            content=exc.response.content,
            status_code=exc.response.status_code,
            media_type=exc.response.headers.get("content-type"),
        )
    except ValueError as exc:
        return JSONResponse({"error": {"message": str(exc), "type": "invalid_request"}}, status_code=400)
    except Exception as exc:
        logger.exception("langgraph bridge error")
        return JSONResponse({"error": {"message": str(exc), "type": "server_error"}}, status_code=502)


@app.get("/")
async def root():
    return JSONResponse(
        {
            "service": "langgraph-openai-adapter",
            "langgraph": LANGGRAPH_BASE_URL,
            "assistant_id": LANGGRAPH_ASSISTANT_ID,
            "endpoints": [
                "/v1/ajrasakha/chat/completions",
                "/v1/ajrasakha/models",
                "/health",
            ],
        }
    )
