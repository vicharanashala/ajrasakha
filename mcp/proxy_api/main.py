import json
import uuid
import logging
import os
from datetime import datetime
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv

from intent import classify_intent, prune_tools
from market_values import state_ids
from multilingual import detect_language, translate_text, translate_stream, smart_translate_or_proxy

# -------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------

load_dotenv()

TARGET_URL = os.getenv("TARGET_URL")
TIMEOUT = 60.0

REQUEST_LOG_FILE = "requests.log.json"
RESPONSE_LOG_FILE = "responses.log.json"
STREAM_LOG_FILE = "stream_chunks.log.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)
logger = logging.getLogger("vllm-proxy")

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

SEPARATOR = "\n" + ("=" * 80) + "\n"


def log_pretty_json(filename: str, payload: dict) -> None:
    """
    Append a pretty-printed JSON object with a clear separator.
    Safe for humans, not intended for strict JSON parsing.
    """
    with open(filename, "a", encoding="utf-8") as f:
        f.write(SEPARATOR)
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def safe_parse_json(data: bytes):
    try:
        return json.loads(data)
    except Exception:
        # return data.decode("utf-8", errors="ignore")
        return None  # Return None if it's not valid JSON, to handle gracefully


# -------------------------------------------------------------------
# App & HTTP client
# -------------------------------------------------------------------

app = FastAPI()

client = httpx.AsyncClient(
    timeout=httpx.Timeout(TIMEOUT),
)

# -------------------------------------------------------------------
# Streaming handler
# -------------------------------------------------------------------

async def stream_and_log_response(
    response: httpx.Response,
    request_id: str
) -> AsyncIterator[bytes]:
    """
    Stream response chunks to the client and log them safely.
    """
    collected_chunks = []

    async for chunk in response.aiter_text():
        collected_chunks.append(chunk)

        # Log each streamed chunk (useful for tool calls / SSE)
        log_pretty_json(STREAM_LOG_FILE, {
            "timestamp": datetime.utcnow().isoformat(),
            "request_id": request_id,
            "type": "stream_chunk",
            "chunk": chunk
        })

        yield chunk.encode("utf-8")

    # Final assembled response (best-effort)
    log_pretty_json(RESPONSE_LOG_FILE, {
        "timestamp": datetime.utcnow().isoformat(),
        "request_id": request_id,
        "status_code": response.status_code,
        "full_response": "".join(collected_chunks)
    })

    await response.aclose()


# -------------------------------------------------------------------
# Catch-all proxy route
# -------------------------------------------------------------------

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    request_id = str(uuid.uuid4())
    url = f"/{path}"

    body_bytes = await request.body()
    parsed_body = safe_parse_json(body_bytes) if body_bytes else None

    logger.info(f"[{request_id}] {request.method} {TARGET_URL}{url}")
    
    # ---------------------------------------------------------------
    # INTENT CLASSIFICASTION & TOOL PRUNING
    # ---------------------------------------------------------------
    
    final_body_bytes = body_bytes
    detected_lang = "English" # Default
    
    if parsed_body and isinstance(parsed_body, dict):
        messages = parsed_body.get("messages", [])
        
        # 1. LANGUAGE DETECTION & TRANSLATION
        user_msg_idx = -1
        user_msg_content = None
        
        # Find the last user message
        for i in range(len(messages)-1, -1, -1):
            if messages[i].get("role") == "user":
                user_msg_content = messages[i].get("content")
                user_msg_idx = i
                break
        
        if user_msg_content:
            # Collect last user message and last non-null assistant message for language detection
            messages_for_detection = []
            
            # Add last user message
            messages_for_detection.append(user_msg_content)
            
            # Find and add last non-null assistant message
            for i in range(len(messages)-1, -1, -1):
                if messages[i].get("role") == "assistant":
                    assistant_content = messages[i].get("content")
                    if assistant_content and isinstance(assistant_content, str) and assistant_content.strip():
                        messages_for_detection.append(assistant_content)
                        break
            
            combined_content = " ".join(messages_for_detection)
            
            # Log the content being used for language detection
            logger.info(f"[{request_id}] Language detection content: {combined_content[:1000]}...")
            
            # Check language using these 2 messages
            detected_lang = await detect_language(combined_content)
            logger.info(f"[{request_id}] Detected Language (from {len(messages_for_detection)} messages): {detected_lang}")
            
            if detected_lang.lower() != "english":
                logger.info(f"[{request_id}] Translating user request to English...")
                english_text = await translate_text(user_msg_content, "English")
                
                # Update the message in place
                messages[user_msg_idx]["content"] = english_text
                parsed_body["messages"] = messages
                
                # Re-serialize immediately so intent classification sees English
                final_body_bytes = json.dumps(parsed_body).encode("utf-8")
        
        # Reload messages potentially updated
        tools = parsed_body.get("tools", [])
        
        if messages and tools:
            logger.info(f"[{request_id}] Analyzing intent...")
            intent = await classify_intent(messages)
            logger.info(f"[{request_id}] Intent classified as: {intent}")
            
            pruned_tools = prune_tools(tools, intent)
            parsed_body["tools"] = pruned_tools
            
            # Inject Custom System Prompt
            if intent == "MARKET":
                current_date = datetime.now().strftime("%Y-%m-%d")
                # Format state_ids tuple of dicts into a readable string/json
                market_context = f"""
                You are a market expert.
                Always reply in English.
                to tell about market price of any commodity confirm the state name and apmc name.
                if apmc name is not available then give user available apmc name.
                only those apmc name will work which is present in get_apmc_list_from_enam_mcp_market tool.

                Get APMC list name using get_apmc_list_from_enam_mcp_market tool.
                
                Get commodity list name using get_commodity_list_from_enam_mcp_market tool.
                
                Get trade data list using get_trade_data_list tool.
                
                to get commodity list first call get_apmc_list_from_enam_mcp_market tool.

                to get trade data list first call get_commodity_list_from_enam_mcp_market tool.

                if it throw error then try previous dates. check previous date one by one upto three dates.
                
                Today's Date: {current_date}\n\nAvailable State IDs for ENAM:\n{json.dumps(state_ids, indent=2)}"""
                
                system_msg = {
                    "role": "system",
                    "content": market_context
                }
                
                # Insert at request
                if messages and messages[0].get("role") == "system":
                    # Append or Replace? User said "put this details in system prompt". 
                    # Usually better to append to not lose existing instructions.
                    existing_content = messages[0].get("content", "")
                    messages[0]["content"] = existing_content + "\n\n" + market_context
                else:
                    messages.insert(0, system_msg)
                
                parsed_body["messages"] = messages
            
            elif intent == "AGRICULTURE":
                # Override system prompt for agriculture
                agriculture_context = """You are an expert agricultural advisor for Indian farmers.
                Always reply in English.
                Mention source of information like links and name of agriculture experts. 
always ask state and crop name from user. and then call get_agricultural_context_mcp_golden tool with state and crop name."""
                
                # Override system prompt
                if messages and messages[0].get("role") == "system":
                    messages[0]["content"] = agriculture_context
                else:
                    messages.insert(0, {"role": "system", "content": agriculture_context})
                
                # Add additional guidance to the last user message
                if user_msg_idx >= 0:
                    original_user_content = messages[user_msg_idx].get("content", "")
                    additional_guidance = "\n\n(Please call mcp tool  get_agricultural_context_mcp_golden with my query to get context)"
                    messages[user_msg_idx]["content"] = original_user_content + additional_guidance
                
                parsed_body["messages"] = messages

            # Re-serialize body
            final_body_bytes = json.dumps(parsed_body).encode("utf-8")

    # ---------------------------------------------------------------
    # Log request (pretty, readable)
    # ---------------------------------------------------------------

    log_pretty_json(REQUEST_LOG_FILE, {
        "timestamp": datetime.utcnow().isoformat(),
        "request_id": request_id,
        "method": request.method,
        "url": f"{TARGET_URL}{url}",
        "headers": dict(request.headers),
        "body": parsed_body # Logs the modified body
    })

    # ---------------------------------------------------------------
    # Prepare upstream request
    # ---------------------------------------------------------------

    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)

    try:
        # Build full URL properly
        # The TARGET_URL might already have a path, so we join carefully or just strip
        base = TARGET_URL.rstrip("/")
        full_upstream_url = f"{base}{url}"
        
        logger.info(f"[{request_id}] Forwarding to {full_upstream_url}")

        upstream_request = client.build_request(
            method=request.method,
            url=full_upstream_url,
            headers=headers,
            content=final_body_bytes
        )
        upstream_response = await client.send(
            upstream_request,
            stream=True
        )
    except httpx.ConnectError:
        logger.error(f"[{request_id}] Upstream connection failed")
        return {"error": "Upstream connection failed"}
    except Exception as e:
        logger.error(f"[{request_id}] Upstream error: {e}")
        return {"error": f"Upstream error: {str(e)}"}

    logger.info(f"[{request_id}] STATUS {upstream_response.status_code}")

    # ---------------------------------------------------------------
    # Stream response back to client (with optional translation)
    # ---------------------------------------------------------------

    # Detect if user requested streaming
    is_streaming = False
    if parsed_body and isinstance(parsed_body, dict):
        is_streaming = parsed_body.get("stream", False)

    if detected_lang.lower() != "english":
        return StreamingResponse(
            smart_translate_or_proxy(upstream_response, detected_lang, request_id, is_streaming=is_streaming),
            status_code=upstream_response.status_code,
            media_type="text/event-stream" if is_streaming else "application/json"
        )
    else:
        # Standard English streaming
        return StreamingResponse(
            stream_and_log_response(upstream_response, request_id),
            status_code=upstream_response.status_code,
            headers=dict(upstream_response.headers),
        )


# -------------------------------------------------------------------
# Entrypoint
# -------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 9012))

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
