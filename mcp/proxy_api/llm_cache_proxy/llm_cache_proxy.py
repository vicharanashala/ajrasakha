"""
Chat Completion Proxy with LLM Final Response Caching.

Sits between the client (LibreChat) and the LLM (vLLM / existing proxy).

Flow:
  CACHE WRITE (response phase — text answer detected):
    - After forwarding to LLM, if the response is a text answer (not tool_calls),
      check if the preceding messages contain tool results for our cacheable tool.
    - If yes, extract original query params and cache the LLM's final text response.

  CACHE READ (response phase — tool_calls detected):
    - When the LLM responds with tool_calls for our cacheable tool,
      check the cache for a matching final response.
    - HIT  → return cached final response directly (no LLM call, no tool execution)
    - MISS → forward tool_calls to client as-is (client executes tool normally)

Only caches: get_context_from_reviewer_dataset
Cache key: embedding similarity (query) + case-insensitive exact (state, crop)
"""
import json
import time
import uuid
import asyncio
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response, StreamingResponse

from config import logger, TARGET_URL, PORT, TIMEOUT
from embedding_client import get_embedding
from cache_store import (
    build_bucket_key,
    get_cached_result,
    store_result,
    close_redis,
)
from language_utils import get_user_query_language, ALLOWED_LANGUAGES

CACHEABLE_TOOL_PREFIXES = (
    "get_context_from_reviewer_dataset",
    "get_context_from_golden_dataset",
    "upload_question_to_reviewer_system",
)


def _is_cacheable_tool(name: str) -> bool:
    """Check if a tool name matches any of our cacheable tools (with any MCP suffix)."""
    return any(name.startswith(prefix) for prefix in CACHEABLE_TOOL_PREFIXES)


# -------------------------------------------------------------------
# App setup
# -------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Cache Proxy starting — Target LLM: {TARGET_URL}")
    yield
    logger.info("Cache Proxy shutting down")
    await close_redis()


app = FastAPI(lifespan=lifespan)
http_client = httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT))


# -------------------------------------------------------------------
# Helpers: Extract tool call params from messages
# -------------------------------------------------------------------

def _extract_query(args: dict) -> str:
    return args.get("query") or args.get("question") or ""

def _extract_state(args: dict) -> str:
    val = args.get("state_code") or args.get("state_name") or args.get("state")
    if val: return str(val)
    details = args.get("details")
    if isinstance(details, dict):
        val = details.get("state_code") or details.get("state_name") or details.get("state")
        if val: return str(val)
    return ""

def _extract_crop(args: dict) -> str:
    val = args.get("crop")
    if val: return str(val)
    details = args.get("details")
    if isinstance(details, dict):
        val = details.get("crop")
        if val: return str(val)
    return ""


def _extract_cacheable_params(messages: list):
    """
    Look backwards through messages to find the most recent assistant
    tool_call for our cacheable tool. Return (query, state, crop) or None.
    """
    for i in range(len(messages) - 1, -1, -1):
        msg = messages[i]
        if msg.get("role") != "assistant":
            continue
        for tc in msg.get("tool_calls", []):
            func = tc.get("function", {})
            if not _is_cacheable_tool(func.get("name", "")):
                continue
            try:
                args = json.loads(func.get("arguments", "{}"))
            except json.JSONDecodeError:
                continue
            
            query = _extract_query(args)
            state = _extract_state(args)
            crop = _extract_crop(args)
            
            if query and state and crop:
                logger.info(f"[EXTRACT_PARAMS] Found cacheable params: query='{query[:60]}', state={state}, crop={crop}")
                return query, state, crop
    logger.info("[EXTRACT_PARAMS] No cacheable tool_call params found in messages")
    return None


def _has_tool_result_for_cacheable(messages: list) -> bool:
    """Check if messages contain a role:'tool' result for our cacheable tool."""
    for i, msg in enumerate(messages):
        if msg.get("role") != "tool":
            continue
        tool_call_id = msg.get("tool_call_id")
        if not tool_call_id:
            continue
        # Find the matching assistant tool_call
        for j in range(i - 1, -1, -1):
            m = messages[j]
            if m.get("role") != "assistant":
                continue
            for tc in m.get("tool_calls", []):
                if tc.get("id") == tool_call_id:
                    if _is_cacheable_tool(tc.get("function", {}).get("name", "")):
                        logger.info(f"[HAS_TOOL_RESULT] Found tool result for cacheable tool (tool_call_id={tool_call_id})")
                        return True
    logger.info(f"[HAS_TOOL_RESULT] No tool result found for cacheable tool")
    return False


def _log_message_roles(messages: list):
    """Log the role sequence of all messages for debugging."""
    roles = []
    for msg in messages:
        role = msg.get("role", "?")
        extra = ""
        if role == "assistant" and msg.get("tool_calls"):
            tc_names = [tc.get("function", {}).get("name", "?") for tc in msg.get("tool_calls", [])]
            extra = f"(tool_calls: {tc_names})"
        elif role == "tool":
            extra = f"(tool_call_id: {msg.get('tool_call_id', '?')[:20]})"
        roles.append(f"{role}{extra}")
    logger.info(f"[MSG_ROLES] Message sequence ({len(messages)} msgs): {' → '.join(roles)}")


# -------------------------------------------------------------------
# Cache WRITE: Store LLM final response after tool execution
# -------------------------------------------------------------------

from typing import Optional

async def _maybe_cache_final_response(messages: list, final_text: str, lang: Optional[str] = "english"):
    """
    If the conversation includes tool results for our cacheable tool,
    cache the LLM's final text response keyed by the original query params + language.
    """
    if not lang:
        logger.info("[CACHE_WRITE] SKIP — Unsupported language detected, not caching")
        return

    logger.info(f"[CACHE_WRITE] Checking if we should cache. final_text length={len(final_text)}, lang={lang}")
    _log_message_roles(messages)

    if not final_text:
        logger.info("[CACHE_WRITE] SKIP — empty final_text")
        return

    # Only cache when the LLM response directly follows a tool result.
    # If the last message is "user" (follow-up question), skip caching
    # to avoid overwriting the original cached response.
    last_msg_role = messages[-1].get("role") if messages else None
    if last_msg_role != "tool":
        logger.info(f"[CACHE_WRITE] SKIP — last message role is '{last_msg_role}', not 'tool' (follow-up turn)")
        return

    has_tool_result = _has_tool_result_for_cacheable(messages)
    if not has_tool_result:
        logger.info("[CACHE_WRITE] SKIP — no tool result for cacheable tool in messages")
        return

    params = _extract_cacheable_params(messages)
    if params is None:
        logger.info("[CACHE_WRITE] SKIP — could not extract cacheable params")
        return

    query, state, crop = params
    try:
        logger.info(f"[CACHE_WRITE] STORING: query='{query[:60]}', state={state}, crop={crop}, lang={lang}, response_len={len(final_text)}")
        embedding = await get_embedding(query)
        bucket_key = build_bucket_key(state, crop, lang)
        await store_result(bucket_key, embedding, final_text)
        logger.info(f"[CACHE_WRITE] SUCCESS — stored in bucket={bucket_key}")
    except Exception as e:
        logger.error(f"[CACHE_WRITE] FAILED: {e}")

async def _store_translated_cache(query: str, state: str, crop: str, target_lang: str, full_text: str):
    logger.info(f"[CACHE_WRITE] Saving translated text to cache ({state}, {crop}, {target_lang})")
    try:
        embedding = await get_embedding(query)
        bucket_key = build_bucket_key(state, crop, target_lang)
        await store_result(bucket_key, embedding, full_text)
        logger.info(f"[CACHE_WRITE] Translation successfully cached in {bucket_key}")
    except Exception as e:
        logger.error(f"[CACHE_WRITE] Failed to store translation: {e}")


# -------------------------------------------------------------------
# Cache READ: Return cached final response directly
# -------------------------------------------------------------------

async def try_resolve_from_cache(tool_calls: list, lang: Optional[str] = "english"):
    """
    Check if any cacheable tool_call has a cache hit.
    Non-cacheable tools are skipped (not treated as a miss).
    Returns (cached_text, similarity_score, resolved_lang, query, state, crop) on hit, None on miss.
    Language is included in the cache key.
    """
    if not lang:
        logger.info("[CACHE_READ] SKIP — Unsupported language detected, bypassing cache")
        return None

    logger.info(f"[CACHE_READ] Checking {len(tool_calls)} tool_calls against cache (lang={lang})")

    # Filter to only cacheable tools — skip non-cacheable ones
    cacheable_tcs = []
    for tc in tool_calls:
        tc_name = tc.get("function", {}).get("name", "?")
        logger.info(f"[CACHE_READ] tool_call: name={tc_name}, id={tc.get('id', '?')}")
        if _is_cacheable_tool(tc_name):
            cacheable_tcs.append(tc)
        else:
            logger.info(f"[CACHE_READ] SKIP — non-cacheable tool: {tc_name}")

    if not cacheable_tcs:
        logger.info("[CACHE_READ] No cacheable tool_calls found — MISS")
        return None

    for tc in cacheable_tcs:
        try:
            args = json.loads(tc["function"].get("arguments", "{}"))
        except json.JSONDecodeError:
            logger.error("[CACHE_READ] SKIP — failed to parse tool_call arguments")
            continue

        query = _extract_query(args)
        state = _extract_state(args)
        crop = _extract_crop(args)

        if not query or not state or not crop:
            logger.info(f"[CACHE_READ] SKIP — missing required keys (query={bool(query)}, state={bool(state)}, crop={bool(crop)})")
            return None

        logger.info(f"[CACHE_READ] Looking up: query='{query[:60]}', state={state}, crop={crop}, lang={lang}")

        try:
            embedding = await get_embedding(query)
        except Exception as e:
            logger.error(f"[CACHE_READ] SKIP — embedding failed: {e}")
            return None

        # Check exact language match
        bucket_key = build_bucket_key(state, crop, lang)
        cached = await get_cached_result(bucket_key, embedding)

        if cached is not None:
            cached_text, score = cached
            logger.info(f"[CACHE_READ] HIT! similarity={score:.4f}, lang={lang}")
            return cached_text, score, lang, query, state, crop
        
        # Check cross-language fallback
        if lang in ALLOWED_LANGUAGES:
            logger.info(f"[CACHE_READ] MISS on target '{lang}', checking cross-language fallback...")
            for cross_lang in ALLOWED_LANGUAGES:
                if cross_lang == lang:
                    continue
                cross_bucket = build_bucket_key(state, crop, cross_lang)
                cross_cached = await get_cached_result(cross_bucket, embedding)
                if cross_cached is not None:
                    cached_text, score = cross_cached
                    logger.info(f"[CACHE_READ] CROSS-LANGUAGE HIT! similarity={score:.4f}, source_lang={cross_lang}, target={lang}")
                    return cached_text, score, cross_lang, query, state, crop

        logger.info(f"[CACHE_READ] MISS — no match in bucket={bucket_key}")
        return None

    return None


# -------------------------------------------------------------------
# Synthesize responses from cached text
# -------------------------------------------------------------------

def _build_non_streaming_response(cached_text: str) -> Response:
    """Build an OpenAI-compatible non-streaming chat completion response."""
    resp = {
        "id": f"chatcmpl-cache-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "cache-proxy",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": cached_text,
            },
            "finish_reason": "stop",
        }],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
    return Response(
        content=json.dumps(resp).encode("utf-8"),
        status_code=200,
        media_type="application/json",
    )


# -------------------------------------------------------------------
# HTTP forwarding helpers
# -------------------------------------------------------------------

def _sanitize_headers(upstream_headers) -> dict:
    """Remove hop-by-hop and encoding headers before returning to client."""
    cleaned = dict(upstream_headers)
    cleaned.pop("content-encoding", None)
    cleaned.pop("content-length", None)
    cleaned.pop("transfer-encoding", None)
    cleaned.pop("connection", None)
    return cleaned

def _build_translation_payload(cached_text: str, target_lang: str, parsed: dict) -> bytes:
    """Builds a new JSON payload forcing the LLM to translate the cached text."""
    new_parsed = dict(parsed)
    new_parsed["messages"] = [
        {"role": "system", "content": "You are a precise translation engine. Do not explain or modify content."},
        {"role": "user", "content": f"Translate the following text into {target_lang}.\nPreserve meaning exactly. Do not add, remove, or interpret anything.\n\n<BEGIN_TEXT>\n{cached_text}\n<END_TEXT>"}
    ]
    new_parsed.pop("tools", None)
    new_parsed.pop("tool_choice", None)
    return json.dumps(new_parsed).encode("utf-8")

async def _forward_simple(path, body_bytes, orig_headers):
    """Forward to LLM and return the non-streaming response directly."""
    url = f"{TARGET_URL.rstrip('/')}/{path}" if path else TARGET_URL
    headers = dict(orig_headers)
    headers.pop("host", None)
    headers.pop("content-length", None)
    
    try:
        req = http_client.build_request(
            method="POST", url=url, headers=headers, content=body_bytes,
        )
        resp = await http_client.send(req)
        return Response(content=resp.content, status_code=resp.status_code, headers=_sanitize_headers(resp.headers))
    except Exception as e:
        logger.error(f"LLM error: {e}")
        return Response(content=json.dumps({"error": str(e)}).encode(), status_code=502)

async def _forward_translation_simple(path, body_bytes, orig_headers, query, state, crop, target_lang):
    """Forward translation and background-cache the parsed response"""
    url = f"{TARGET_URL.rstrip('/')}/{path}" if path else TARGET_URL
    headers = dict(orig_headers)
    headers.pop("host", None)
    headers.pop("content-length", None)
    
    try:
        req = http_client.build_request(
            method="POST", url=url, headers=headers, content=body_bytes,
        )
        resp = await http_client.send(req)
        
        if resp.status_code == 200:
            try:
                resp_data = json.loads(resp.content)
                content = resp_data["choices"][0]["message"].get("content", "")
                if content:
                    asyncio.create_task(_store_translated_cache(query, state, crop, target_lang, content))
            except Exception as e:
                logger.error(f"Failed to buffer translation cache: {e}")
                
        return Response(content=resp.content, status_code=resp.status_code, headers=_sanitize_headers(resp.headers))
    except Exception as e:
        logger.error(f"LLM error: {e}")
        return Response(content=json.dumps({"error": str(e)}).encode(), status_code=502)

async def _forward_streaming(path, body_bytes, orig_headers):
    """Forward to LLM and stream the response back."""
    url = f"{TARGET_URL.rstrip('/')}/{path}" if path else TARGET_URL

    headers = dict(orig_headers)
    headers.pop("host", None)
    headers.pop("content-length", None)

    try:
        req = http_client.build_request(
            method="POST", url=url, headers=headers, content=body_bytes,
        )
        resp = await http_client.send(req, stream=True)
    except Exception as e:
        logger.error(f"LLM error: {e}")
        return Response(content=json.dumps({"error": str(e)}).encode(), status_code=502)

    async def stream():
        async for chunk in resp.aiter_bytes():
            yield chunk
        await resp.aclose()

    return StreamingResponse(
        stream(), status_code=resp.status_code, headers=_sanitize_headers(resp.headers),
    )

async def _forward_translation_streaming(path, body_bytes, orig_headers, query, state, crop, target_lang):
    """Forward translation, yield chunks, and gather string to cache it."""
    url = f"{TARGET_URL.rstrip('/')}/{path}" if path else TARGET_URL
    headers = dict(orig_headers)
    headers.pop("host", None)
    headers.pop("content-length", None)

    try:
        req = http_client.build_request(
            method="POST", url=url, headers=headers, content=body_bytes,
        )
        resp = await http_client.send(req, stream=True)
    except Exception as e:
        logger.error(f"LLM error: {e}")
        return Response(content=json.dumps({"error": str(e)}).encode(), status_code=502)

    async def stream_and_collect():
        collected_text = []
        async for line in resp.aiter_lines():
            yield (line + "\n").encode("utf-8")
            line_strip = line.strip()
            if line_strip.startswith("data: "):
                data_str = line_strip[6:]
                if data_str != "[DONE]":
                    try:
                        delta = json.loads(data_str)["choices"][0]["delta"]
                        c = delta.get("content", "")
                        if c: collected_text.append(c)
                    except Exception:
                        pass
        await resp.aclose()
        full_text = "".join(collected_text)
        if full_text:
            asyncio.create_task(_store_translated_cache(query, state, crop, target_lang, full_text))

    return StreamingResponse(
        stream_and_collect(), status_code=resp.status_code, headers=_sanitize_headers(resp.headers),
    )


# -------------------------------------------------------------------
# Main proxy route
# -------------------------------------------------------------------

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    body_bytes = await request.body()

    # Only intercept chat completion POSTs
    if request.method != "POST" or "chat/completions" not in path:
        logger.info(f"[PROXY] Non-chat request: {request.method} /{path} — forwarding")
        return await _forward_streaming(path, body_bytes, request.headers)

    try:
        parsed = json.loads(body_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError):
        logger.info("[PROXY] Failed to parse request body — forwarding as-is")
        return await _forward_streaming(path, body_bytes, request.headers)

    is_streaming = parsed.get("stream", False)
    messages = parsed.get("messages", [])

    logger.info(f"[PROXY] === Chat completion request: streaming={is_streaming}, {len(messages)} messages ===")
    _log_message_roles(messages)

    # Detect user query language for language-aware caching
    detected_lang = await get_user_query_language(messages)
    logger.info(f"[PROXY] Detected user language: '{detected_lang}'")

    # Forward to LLM
    url = f"{TARGET_URL.rstrip('/')}/{path}" if path else TARGET_URL
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)

    try:
        req = http_client.build_request(
            method="POST", url=url, headers=headers, content=body_bytes,
        )
        upstream = await http_client.send(req, stream=True)
    except Exception as e:
        logger.error(f"LLM error: {e}")
        return Response(content=json.dumps({"error": str(e)}).encode(), status_code=502)

    logger.info(f"[PROXY] LLM responded with status={upstream.status_code}")

    if is_streaming:
        return await _handle_streaming(upstream, parsed, request, path, detected_lang)
    else:
        return await _handle_non_streaming(upstream, parsed, request, path, detected_lang)


async def _handle_non_streaming(upstream, parsed, request, path, lang: Optional[str] = "english"):
    """Read full JSON response, check for tool_calls or cache final text."""
    resp_bytes = await upstream.aread()
    await upstream.aclose()

    try:
        resp_data = json.loads(resp_bytes)
    except json.JSONDecodeError:
        logger.info("[NON_STREAM] Failed to parse LLM response JSON — forwarding raw")
        return Response(content=resp_bytes, status_code=upstream.status_code,
                        headers=_sanitize_headers(upstream.headers))

    choices = resp_data.get("choices", [])
    if choices:
        message = choices[0].get("message", {})
        tool_calls = message.get("tool_calls", [])
        content = message.get("content", "")
        finish_reason = choices[0].get("finish_reason", "")

        logger.info(f"[NON_STREAM] LLM response: finish_reason={finish_reason}, has_tool_calls={bool(tool_calls)}, content_len={len(content or '')}, lang={lang}")

        if tool_calls:
            logger.info(f"[NON_STREAM] LLM wants tool calls — checking cache (lang={lang})")
            cached = await try_resolve_from_cache(tool_calls, lang)
            if cached is not None:
                cached_text, score, source_lang, c_query, c_state, c_crop = cached
                if source_lang == lang:
                    logger.info(f"[NON_STREAM] Returning CACHED response (sim={score:.4f}, lang={lang})")
                    return _build_non_streaming_response(cached_text)
                else:
                    logger.info(f"[NON_STREAM] Cross-language hit ({source_lang}->{lang}), translating and caching...")
                    body_bytes = _build_translation_payload(cached_text, lang, parsed)
                    return await _forward_translation_simple(path, body_bytes, request.headers, c_query, c_state, c_crop, lang)
            else:
                logger.info("[NON_STREAM] Cache miss — forwarding tool_calls to client")
        elif content:
            logger.info(f"[NON_STREAM] LLM returned text answer (len={len(content)}) — checking if cacheable")
            messages = parsed.get("messages", [])
            await _maybe_cache_final_response(messages, content, lang)
        else:
            logger.info("[NON_STREAM] LLM response has no tool_calls and no content")
    else:
        logger.info("[NON_STREAM] LLM response has no choices")

    return Response(content=resp_bytes, status_code=upstream.status_code,
                    headers=_sanitize_headers(upstream.headers))


async def _handle_streaming(upstream, parsed, request, path, lang: Optional[str] = "english"):
    """
    Buffer the ENTIRE SSE stream first, then decide:
    - If any tool_calls were seen → check cache → return cached or replay
    - If content only → replay all lines to client + cache the text

    We must buffer everything because thinking models (Qwen3) send
    delta.content (thinking tokens) BEFORE delta.tool_calls in the same response.
    """
    buffered_lines = []
    has_tool_calls = False
    has_content = False
    collected_text = []
    line_count = 0

    logger.info(f"[STREAM] Buffering entire SSE stream from LLM... (lang={lang})")

    async for line in upstream.aiter_lines():
        line_count += 1
        buffered_lines.append(line + "\n")

        line_strip = line.strip()
        if line_strip.startswith("data: "):
            data_str = line_strip[6:]
            if data_str != "[DONE]":
                try:
                    delta = json.loads(data_str)["choices"][0]["delta"]
                    if delta.get("tool_calls"):
                        has_tool_calls = True
                    c = delta.get("content", "")
                    if c:
                        has_content = True
                        collected_text.append(c)
                except (json.JSONDecodeError, IndexError, KeyError):
                    pass

    logger.info(
        f"[STREAM] Buffer complete: {line_count} lines, "
        f"has_tool_calls={has_tool_calls}, has_content={has_content}, "
        f"collected_text_len={len(''.join(collected_text))}"
    )

    # --- DECISION ---

    if has_tool_calls:
        # LLM wants to call tools (possibly after thinking tokens)
        tool_calls = _reconstruct_tool_calls_from_lines(buffered_lines)
        logger.info(f"[STREAM] Reconstructed {len(tool_calls)} tool_calls: "
                     f"{[tc.get('function', {}).get('name', '?') for tc in tool_calls]}")

        if tool_calls:
            cached = await try_resolve_from_cache(tool_calls, lang)
            if cached is not None:
                cached_text, score, source_lang, c_query, c_state, c_crop = cached
                if source_lang == lang:
                    logger.info(f"[STREAM] CACHE HIT! Returning cached response "
                                 f"(sim={score:.4f}, len={len(cached_text)}, lang={lang})")

                    # Return synthetic SSE stream with cached response
                    async def cached_stream():
                        completion_id = f"chatcmpl-cache-{uuid.uuid4().hex[:12]}"
                        created = int(time.time())

                        chunk1 = {"id": completion_id, "object": "chat.completion.chunk",
                                  "created": created, "model": "cache-proxy",
                                  "choices": [{"index": 0, "delta": {"role": "assistant", "content": ""},
                                               "finish_reason": None}]}
                        yield f"data: {json.dumps(chunk1)}\n\n".encode("utf-8")

                        chunk2 = {"id": completion_id, "object": "chat.completion.chunk",
                                  "created": created, "model": "cache-proxy",
                                  "choices": [{"index": 0, "delta": {"content": cached_text},
                                               "finish_reason": None}]}
                        yield f"data: {json.dumps(chunk2)}\n\n".encode("utf-8")

                        chunk3 = {"id": completion_id, "object": "chat.completion.chunk",
                                  "created": created, "model": "cache-proxy",
                                  "choices": [{"index": 0, "delta": {},
                                               "finish_reason": "stop"}]}
                        yield f"data: {json.dumps(chunk3)}\n\n".encode("utf-8")
                        yield b"data: [DONE]\n\n"

                    return StreamingResponse(cached_stream(), status_code=200,
                                             media_type="text/event-stream")
                else:
                    logger.info(f"[STREAM] Cross-language hit ({source_lang}->{lang}), translating stream and caching...")
                    body_bytes = _build_translation_payload(cached_text, lang, parsed)
                    return await _forward_translation_streaming(path, body_bytes, request.headers, c_query, c_state, c_crop, lang)
            else:
                logger.info("[STREAM] CACHE MISS — replaying buffered tool_call lines to client")
        else:
            logger.info("[STREAM] No tool_calls reconstructed — replaying buffer")

        # Cache miss or no tool_calls: replay buffered lines
        async def replay_tool():
            for b_line in buffered_lines:
                yield b_line.encode("utf-8")
        return StreamingResponse(replay_tool(), status_code=200,
                                 media_type="text/event-stream")

    else:
        # Content-only response — replay all buffered lines + trigger cache write
        logger.info(f"[STREAM] Content-only response. Replaying {len(buffered_lines)} lines to client.")

        full_text = "".join(collected_text)
        if full_text:
            logger.info(f"[STREAM] Text len={len(full_text)}. Triggering cache write (lang={lang})...")
            messages = parsed.get("messages", [])
            # Fire-and-forget background cache task
            asyncio.create_task(_maybe_cache_final_response(messages, full_text, lang))
        else:
            logger.info("[STREAM] No text content collected — nothing to cache")

        async def replay_content():
            for b_line in buffered_lines:
                yield b_line.encode("utf-8")
        return StreamingResponse(replay_content(), status_code=200,
                                 media_type="text/event-stream")


def _extract_text_and_collect(line: str, collected: list):
    line_strip = line.strip()
    if line_strip.startswith("data: "):
        data_str = line_strip[6:]
        if data_str != "[DONE]":
            try:
                delta = json.loads(data_str)["choices"][0]["delta"]
                c = delta.get("content", "")
                if c:
                    collected.append(c)
            except (json.JSONDecodeError, IndexError, KeyError):
                pass


def _reconstruct_tool_calls_from_lines(lines: list) -> list:
    accumulated = {}
    for line in lines:
        line_strip = line.strip()
        if not line_strip.startswith("data: "):
            continue
        data_str = line_strip[6:]
        if data_str == "[DONE]":
            continue
        try:
            delta = json.loads(data_str)["choices"][0]["delta"]
            for tc_delta in delta.get("tool_calls", []):
                idx = tc_delta.get("index", 0)
                if idx not in accumulated:
                    accumulated[idx] = {"id": "", "name": "", "arguments": ""}
                if "id" in tc_delta:
                    accumulated[idx]["id"] = tc_delta["id"]
                func = tc_delta.get("function", {})
                if "name" in func:
                    accumulated[idx]["name"] = func["name"]
                if "arguments" in func:
                    accumulated[idx]["arguments"] += func["arguments"]
        except (json.JSONDecodeError, IndexError, KeyError):
            continue

    return [
        {
            "id": accumulated[idx]["id"],
            "type": "function",
            "function": {
                "name": accumulated[idx]["name"],
                "arguments": accumulated[idx]["arguments"],
            },
        }
        for idx in sorted(accumulated.keys())
    ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
