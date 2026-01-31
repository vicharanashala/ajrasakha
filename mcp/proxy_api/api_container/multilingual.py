
import httpx
import logging
import json
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("vllm-proxy")

LANG_DETECTION_MODEL_URL = os.getenv("LANG_DETECTION_MODEL_URL", "http://localhost:8013/v1/chat/completions")
LANG_DETECTION_MODEL_NAME = os.getenv("LANG_DETECTION_MODEL_NAME", "google/gemma-3-12b-it")

TRANSLATOR_URL = os.getenv("TRANSLATOR_URL", "http://localhost:8012/v1/chat/completions")
TRANSLATOR_MODEL_NAME = os.getenv("TRANSLATOR_MODEL_NAME", "sarvamai/sarvam-translate")

async def detect_language(text: str) -> str:
    """
    Detects the language of the input text using Sarvam LLM.
    Returns the language name (e.g., 'English', 'Hindi', 'Marathi').
    """

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                LANG_DETECTION_MODEL_URL,
                json={
                    "model": LANG_DETECTION_MODEL_NAME,
                    "messages": [
                        {"role": "system", "content": """Detect the language of the following sentence.Dont assume language base on geograhical location\n\n"
                        "answer in one word only which language is this"""},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.0,
                    "max_tokens": 3
                },
                timeout=10.0
            )
            response.raise_for_status()
            result = response.json()
            language = result["choices"][0]["message"]["content"].strip()
            logger.info(f"Detected language: {language}")
            return language
    except Exception as e:
        logger.error(f"Error detecting language: {e}")
        return "English" # Default to English on error

async def translate_text(text: str, target_lang: str) -> str:
    """
    Translates the text to the target language using Sarvam LLM.
    """
    try:
        if not text:
            return ""
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                TRANSLATOR_URL,
                json={
                    "model": TRANSLATOR_MODEL_NAME,
                    "messages": [
                        {"role": "system", "content": f"Translate the text below to fluent farmer friendly {target_lang}."},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.1
                },
                timeout=30.0
            )
            response.raise_for_status()
            result = response.json()
            translated_text = result["choices"][0]["message"]["content"].strip()
            logger.info(f"Translated text to {target_lang}: {translated_text[:50]}...")
            return translated_text
    except Exception as e:
        logger.error(f"Error translating text: {e}")
        return text # Return original text on error

async def translate_stream(text: str, target_lang: str):
    """
    Translates the text to the target language and yields the response as a stream.
    Proxies the SSE stream from Sarvam directly.
    """
    logger.info(f"[translate_stream] Starting translation to {target_lang}, text len: {len(text)}")
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                TRANSLATOR_URL,
                json={
                    "model": TRANSLATOR_MODEL_NAME,
                    "messages": [
                        {"role": "system", "content": f"Translate the text below to fluent farmer friendly {target_lang}."},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.1,
                    "stream": True,
                    "max_tokens": 4096
                },
                timeout=60.0
            ) as response:
                response.raise_for_status()
                chunk_count = 0
                async for chunk in response.aiter_bytes():
                    chunk_count += 1
                    if chunk_count <= 3:
                        logger.info(f"[translate_stream] Chunk {chunk_count}: {chunk[:100]}")
                    yield chunk
                logger.info(f"[translate_stream] Finished. Total chunks: {chunk_count}")
    except Exception as e:
        logger.error(f"Error in translate stream: {e}")
        # If error, yield an SSE error or just text? 
        # Fallback simplistic SSE
        error_msg = json.dumps({"choices": [{"delta": {"content": f" [Translation Error: {e}]"}}]})
        yield f"data: {error_msg}\n\n".encode("utf-8")

async def smart_translate_or_proxy(upstream_response: httpx.Response, target_lang: str, request_id: str, is_streaming: bool = True):
    """
    Inspects the upstream stream to decide whether to translate or pass-through.
    - If 'tool_calls' are detected, it switches to pass-through mode (replaying buffered chunks).
    - If valid text content is collected without tool calls, it translates the content.
    - If no content or only reasoning, it replays the original stream.
    """
    buffered_lines = []
    collected_content = []
    mode = "buffering" # or "streaming" (pass-through)
    
    # Keep track of the last JSON structure to reuse as template if needed
    last_json_template = None
    
    logger.info(f"[{request_id}] smart_translate_or_proxy: is_streaming={is_streaming}, target_lang={target_lang}")
    
    # Iterate through the upstream lines
    async for line in upstream_response.aiter_lines():
        if mode == "streaming":
            # Pass-through mode: just yield the line encoded with newline
            yield (line + "\n").encode("utf-8")
            continue
            
        # Buffering mode: store line
        buffered_lines.append(line)
        
        # Analyze line for tool_calls or content
        found_tool_call = False
        line_strip = line.strip()
        
        logger.debug(f"[{request_id}] Line: {line_strip[:80]}...")

        if line_strip.startswith("data: "):
            data_str = line_strip[6:]
            if data_str == "[DONE]":
                pass
            else:
                try:
                    data = json.loads(data_str)
                    choices = data.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        finish_reason = choices[0].get("finish_reason")
                        
                        tool_calls = delta.get("tool_calls")
                        if tool_calls or finish_reason == "tool_calls":
                            found_tool_call = True
                        
                        content = delta.get("content", "")
                        if content:
                            collected_content.append(content)
                except json.JSONDecodeError:
                    pass

        elif line_strip.startswith("{"):
            # Handle standard JSON response (non-streaming)
            try:
                data = json.loads(line_strip)
                last_json_template = data
                choices = data.get("choices", [])
                if choices:
                    message = choices[0].get("message", {})
                    finish_reason = choices[0].get("finish_reason")

                    tool_calls = message.get("tool_calls")
                    if tool_calls or finish_reason == "tool_calls":
                        found_tool_call = True
                        logger.info(f"[{request_id}] Tool calls detected: {tool_calls}")

                    content = message.get("content", "")
                    if content:
                        collected_content.append(content)
                        logger.info(f"[{request_id}] Collected content: {content[:50]}...")
            except json.JSONDecodeError:
                pass
        
        if found_tool_call:
            logger.info(f"[{request_id}] Tool call detected. Skipping translation and streaming original.")
            mode = "streaming"
            # Flush buffer with newlines
            for l in buffered_lines:
                yield (l + "\n").encode("utf-8")
            buffered_lines = []
            
    # Stream completed. 
    logger.info(f"[{request_id}] Stream completed. Mode={mode}, collected_content_len={len(collected_content)}, buffered_lines={len(buffered_lines)}")
    
    if mode == "buffering":
        # We never switched to streaming, so we have the full response buffered.
        full_text = "".join(collected_content)
        
        logger.info(f"[{request_id}] Full text length: {len(full_text)}")
        print(full_text[:100])
        if full_text:
            logger.info(f"[{request_id}] Content found. Translating to {target_lang}...")
            
            if is_streaming:
                # Output SSE stream
                async for chunk in translate_stream(full_text, target_lang):
                    yield chunk
            else:
                # Output JSON response
            
                translated_text = await translate_text(full_text, target_lang)
                logger.info(f"[{request_id}] Translated text length: {len(translated_text)}")
                
                if last_json_template and translated_text:
                    # Inject translated text
                    try:
                        last_json_template["choices"][0]["message"]["content"] = f"Translation: {translated_text}"
                        result = json.dumps(last_json_template)
                        logger.info(f"[{request_id}] Yielding JSON response: {len(result)} bytes")
                        yield result.encode("utf-8")
                    except Exception as e:
                        logger.error(f"[{request_id}] Error constructing JSON: {e}")
                        # Fallback: yield original
                        for l in buffered_lines:
                            yield (l + "\n").encode("utf-8")
                elif translated_text:
                    # Fallback construct simple JSON
                    fallback = {
                        "id": "trans_" + request_id, 
                        "object": "chat.completion",
                        "choices": [{"index": 0, "message": {"role": "assistant", "content": f"Translation: {translated_text}"}, "finish_reason": "stop"}]
                    }
                    result = json.dumps(fallback)
                    logger.info(f"[{request_id}] Yielding fallback JSON: {len(result)} bytes")
                    yield result.encode("utf-8")
                else:
                    logger.warning(f"[{request_id}] Translation returned empty! Replaying original.")
                    for l in buffered_lines:
                        yield (l + "\n").encode("utf-8")

        else:
            # No content found (e.g. only reasoning, or empty response). Replay original.
            logger.info(f"[{request_id}] No translatable content found. Replaying original ({len(buffered_lines)} lines).")
            for l in buffered_lines:
                yield (l + "\n").encode("utf-8")
