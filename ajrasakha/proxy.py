import os
import logging
from typing import AsyncIterator, Dict, Iterable
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse, JSONResponse
import httpx

TARGET = os.getenv("OLLAMA_TARGET", "http://100.100.108.13:11434")
PORT = int(os.getenv("PORT", "8000"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("proxy")

app = FastAPI()

# Reuse a single async client with HTTP/1.1 kept-alive
client = httpx.AsyncClient(base_url=TARGET, timeout=None, follow_redirects=False)

# Headers we should not forward as-is
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",  # we’ll let httpx compute it
    "host",            # base_url sets this
}

def _out_headers(src: Iterable[tuple[str, str]]) -> Dict[str, str]:
    return {k: v for (k, v) in src if k.lower() not in HOP_BY_HOP}

@app.middleware("http")
async def log_request(request: Request, call_next):
    log.info(">>> %s %s HTTP/%s", request.method, request.url.path + ("?" + str(request.url.query) if request.url.query else ""), request.scope.get("http_version", "1.1"))
    log.info(">>> Request headers: %s", dict(request.headers))
    # We do NOT consume the body here (to keep streaming safe)
    return await call_next(request)

async def _stream_request_body(req: Request) -> AsyncIterator[bytes]:
    async for chunk in req.stream():
        yield chunk

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy(path: str, request: Request) -> Response:
    # Forward method, path, query, headers, and body as a stream
    upstream_url = request.url.path
    if request.url.query:
        upstream_url += f"?{request.url.query}"

    try:
        # Build outgoing request
        method = request.method
        headers = _out_headers(request.headers.items())

        # For methods with body, provide an async iterator; otherwise None
        content = _stream_request_body(request) if method in {"POST", "PUT", "PATCH"} else None

        upstream_resp = await client.request(
            method,
            upstream_url,
            headers=headers,
            content=content,   # async iterator keeps streaming
        )

        # Log upstream response metadata
        log.info("<<< %s %s -> %s", method, upstream_url, upstream_resp.status_code)
        log.info("<<< Response headers: %s", dict(upstream_resp.headers))

        # Build response to client as a streaming response
        resp_headers = _out_headers(upstream_resp.headers.items())
        return StreamingResponse(
            upstream_resp.aiter_bytes(),  # stream bytes as they arrive
            status_code=upstream_resp.status_code,
            headers=resp_headers,
            media_type=upstream_resp.headers.get("content-type"),
        )

    except httpx.RequestError as e:
        log.error("Proxy httpx error: %s", e)
        return JSONResponse({"error": "Bad gateway (proxy)", "detail": str(e)}, status_code=502)
    except Exception as e:
        log.exception("Proxy unexpected error")
        return JSONResponse({"error": "Proxy error", "detail": str(e)}, status_code=500)
