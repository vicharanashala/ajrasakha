"""
Proxy API for vLLM with multilingual support, intent classification, and vision processing.
"""
import json
import uuid
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from config import logger, TARGET_URL, TIMEOUT, PORT
from utils import safe_parse_json, find_last_user_message, extract_text_from_content
from exceptions import register_exception_handlers, UpstreamConnectionError, UpstreamError
from handlers import (
    process_images_in_messages,
    handle_language_detection,
    handle_translation_to_english,
    handle_intent_routing
)
from multilingual import smart_translate_or_proxy

app = FastAPI()
register_exception_handlers(app)

client = httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT))


async def stream_response(response: httpx.Response) -> AsyncIterator[bytes]:
    """Stream response chunks to the client."""
    async for chunk in response.aiter_text():
        yield chunk.encode("utf-8")
    await response.aclose()


async def process_request_body(parsed_body: dict, request_id: str) -> tuple[bytes, str]:
    """
    Process request body through the pipeline: vision -> language detection -> translation -> intent.
    
    Returns:
        Tuple of (final_body_bytes, detected_language)
    """
    messages = parsed_body.get("messages", [])
    detected_lang = "English"
    
    has_images = any(
        msg.get("role") == "user" and isinstance(msg.get("content"), list) 
        for msg in messages
    )
    if has_images:
        logger.info(f"[{request_id}] Checking for images in messages...")
        messages = await process_images_in_messages(messages)
        parsed_body["messages"] = messages

    user_msg_idx, user_msg_content = find_last_user_message(messages)
    
    if user_msg_content:
        detected_lang = await handle_language_detection(messages, request_id)
        
        if detected_lang.lower() != "english":
            messages = await handle_translation_to_english(
                messages, user_msg_idx, user_msg_content, request_id
            )
            parsed_body["messages"] = messages

    tools = parsed_body.get("tools", [])
    
    if messages and tools:
        messages, pruned_tools = await handle_intent_routing(
            messages, tools, user_msg_idx, request_id
        )
        parsed_body["messages"] = messages
        parsed_body["tools"] = pruned_tools

    return json.dumps(parsed_body).encode("utf-8"), detected_lang


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    """Catch-all proxy route."""
    request_id = str(uuid.uuid4())
    url = f"/{path}"

    body_bytes = await request.body()
    parsed_body = safe_parse_json(body_bytes) if body_bytes else None

    logger.info(f"[{request_id}] {request.method} {TARGET_URL}{url}")
    
    final_body_bytes = body_bytes
    detected_lang = "English"
    is_streaming = False
    
    if parsed_body and isinstance(parsed_body, dict):
        final_body_bytes, detected_lang = await process_request_body(parsed_body, request_id)
        is_streaming = parsed_body.get("stream", False)

    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)

    base = TARGET_URL.rstrip("/")
    full_upstream_url = f"{base}{url}"
    
    logger.info(f"[{request_id}] Forwarding to {full_upstream_url}")

    try:
        upstream_request = client.build_request(
            method=request.method,
            url=full_upstream_url,
            headers=headers,
            content=final_body_bytes
        )
        upstream_response = await client.send(upstream_request, stream=True)
    except httpx.ConnectError:
        logger.error(f"[{request_id}] Upstream connection failed")
        raise UpstreamConnectionError()
    except Exception as e:
        logger.error(f"[{request_id}] Upstream error: {e}")
        raise UpstreamError(str(e))

    logger.info(f"[{request_id}] STATUS {upstream_response.status_code}")

    if detected_lang.lower() != "english":
        return StreamingResponse(
            smart_translate_or_proxy(
                upstream_response, detected_lang, request_id, is_streaming=is_streaming
            ),
            status_code=upstream_response.status_code,
            media_type="text/event-stream" if is_streaming else "application/json"
        )
    
    return StreamingResponse(
        stream_response(upstream_response),
        status_code=upstream_response.status_code,
        headers=dict(upstream_response.headers),
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="info"
    )
