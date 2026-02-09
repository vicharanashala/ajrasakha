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

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)
logger = logging.getLogger("vllm-proxy")

TARGET_URL = os.getenv("TARGET_URL")
VISION_API_URL = os.getenv("VISION_API_URL") # Default to internal docker alias
TIMEOUT = 60.0

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

def safe_parse_json(data: bytes):
    try:
        return json.loads(data)
    except Exception:
        return None

    except Exception:
        return None

def extract_text_from_content(content) -> str:
    """
    Extracts text from message content which can be a string or a list of blocks.
    """
    if isinstance(content, str):
        return content
    elif isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text_parts.append(block.get("text", ""))
        return " ".join(text_parts)
    return ""

app = FastAPI()

client = httpx.AsyncClient(
    timeout=httpx.Timeout(TIMEOUT),
)


async def stream_response(response: httpx.Response) -> AsyncIterator[bytes]:
    """
    Stream response chunks to the client.
    """
    async for chunk in response.aiter_text():
        yield chunk.encode("utf-8")

    await response.aclose()


async def process_images_in_messages(messages: list):
    """
    Scans messages for image_url content.
    If found, calls the Vision API to get a prediction.
    Replaces the image_url block with a text block containing the prediction.
    """
    if not VISION_API_URL:
        logger.warning("VISION_API_URL is not set. Skipping image processing.")
        return messages

    for msg in messages:
        if msg.get("role") == "user" and isinstance(msg.get("content"), list):
            new_content = []
            for block in msg["content"]:
                if isinstance(block, dict) and block.get("type") == "image_url":
                    image_url_data = block.get("image_url", {})
                    url = image_url_data.get("url")
                    
                    if url:
                        logger.info(f"Intercepted image URL. Sending to Vision API: {VISION_API_URL}")
                        try:
                            # Call Vision API
                            async with httpx.AsyncClient(timeout=30.0) as vision_client:
                                resp = await vision_client.post(
                                    VISION_API_URL,
                                    json={"url": url}
                                )
                                if resp.status_code == 200:
                                    prediction_data = resp.json()
                                    class_name = prediction_data.get("class_name", "Unknown")
                                    confidence = prediction_data.get("confidence", 0.0)
                                    
                                    # Create prediction text
                                    prediction_text = (
                                        f"User has provided an image. "
                                        f"The vision model predicts: {class_name} "
                                        f"with confidence {confidence:.2%}. "
                                        f"(This text replaced the actual image)."
                                    )
                                    
                                    logger.info(f"Vision API Prediction: {class_name} ({confidence:.2%})")
                                    
                                    # Replace image block with text prediction
                                    new_content.append({
                                        "type": "text",
                                        "text": prediction_text
                                    })
                                else:
                                    logger.error(f"Vision API Error: {resp.status_code} - {resp.text}")
                                    # Keep the image block if we failed? Or remove it?
                                    # Request says: "pass Prediction test to llm"
                                    # It implies we should probably just fail gracefully or keep it.
                                    # For now, let's keep it if vision fails, or maybe convert to error text?
                                    # Let's keep existing block if failure, but log error.
                                    new_content.append(block)
                        except Exception as e:
                            logger.error(f"Failed to call Vision API: {e}")
                            new_content.append(block)
                    else:
                        new_content.append(block)
                else:
                    new_content.append(block)
            
            # Update the message content with processed blocks
            msg["content"] = new_content
    
    return messages


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
        
        # 0. IMAGE INTERCEPTION & PROCESSING (NEW)
        # We do this FIRST so that language detection and intent classification 
        # run on the *text* representation of the image if needed (though usually they look at text).
        # But mostly to ensure the predicting logic happens before we do anything else.
        if any(msg.get("role") == "user" and isinstance(msg.get("content"), list) for msg in messages):
            logger.info(f"[{request_id}] Checking for images in messages...")
            messages = await process_images_in_messages(messages)
            parsed_body["messages"] = messages
            # Reserialize immediately to update body_bytes if we modified it
            final_body_bytes = json.dumps(parsed_body).encode("utf-8")

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
            messages_for_detection.append(extract_text_from_content(user_msg_content))
            
            # Find and add last non-null assistant message
            for i in range(len(messages)-1, -1, -1):
                if messages[i].get("role") == "assistant":
                    assistant_content = messages[i].get("content")
                    if assistant_content:
                        text_content = extract_text_from_content(assistant_content)
                        if text_content.strip():
                            messages_for_detection.append(text_content)
                            break
            
            combined_content = " ".join(messages_for_detection)
            
            # Log the content being used for language detection
            logger.info(f"[{request_id}] Language detection content: {combined_content[:1000]}...")
            
            # Check language using these 2 messages
            detected_lang = await detect_language(combined_content)
            logger.info(f"[{request_id}] Detected Language (from {len(messages_for_detection)} messages): {detected_lang}")
            
            if detected_lang.lower() != "english":
                logger.info(f"[{request_id}] Translating user request to English...")
                text_to_translate = extract_text_from_content(user_msg_content)
                english_text = await translate_text(text_to_translate, "English")
                
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
                    additional_guidance = "\n\n(Please call mcp tool if available with my query to get context, also provide all sources which you get from tool like names, links, etc in table format)"
                    messages[user_msg_idx]["content"] = original_user_content + additional_guidance
                
                parsed_body["messages"] = messages

            # Re-serialize body
            final_body_bytes = json.dumps(parsed_body).encode("utf-8")

    # ---------------------------------------------------------------
    # Log request (pretty, readable)
    # ---------------------------------------------------------------

    # ---------------------------------------------------------------
    # Log request (standard logger)
    # ---------------------------------------------------------------
    logger.info(f"[{request_id}] {request.method} {TARGET_URL}{url}")

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
            stream_response(upstream_response),
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
