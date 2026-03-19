"""
Translation MCP Server - LLM-based Translation Service

This module provides translation capabilities using a local vLLM server
running the sarvamai/sarvam-translate model.

Features:
- Multi-language translation support
- Powered by Sarvam AI translation model
- OpenAI-compatible API interface
- Automatic retry logic with exponential backoff
- Comprehensive error handling

Author: Ajrasakha MCP Team
Version: 1.0.0
Date: January 21, 2026
"""

from typing import Optional
from fastmcp import FastMCP
import os
import httpx
import logging
import asyncio
from datetime import datetime, timezone

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mcp = FastMCP("Translation MCP")

# Retry configuration
MAX_RETRIES = 3
INITIAL_BACKOFF = 0.5  # seconds
TIMEOUT = 30  # seconds (translation may take longer)

# Default vLLM server endpoint (configurable via VLLM_ENDPOINT env var)
DEFAULT_VLLM_ENDPOINT = os.getenv(
    "VLLM_ENDPOINT", 
    "http://localhost:8012/v1/chat/completions"
)


async def retry_with_backoff(func, *args, max_retries=MAX_RETRIES, **kwargs):
    """
    Retry an async function with exponential backoff.
    
    - Handles transient network errors and rate-limited (429) responses.
    - Retries 5xx server errors (transient server issues).
    - Does NOT retry other 4xx client errors (401, 404, 422, etc.).
    
    Args:
        func: Async function to retry
        max_retries: Maximum number of retry attempts
        *args, **kwargs: Arguments to pass to func
    
    Returns:
        Result from func if successful
    
    Raises:
        Last exception if all retries fail
    """
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            return await func(*args, **kwargs)
        except httpx.HTTPStatusError as e:
            status = e.response.status_code if e.response is not None else None
            
            # Retry only for 429 (rate limit)
            if status == 429:
                last_exception = e
                if attempt < max_retries - 1:
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    logger.warning(f"Rate limited (429). Retry {attempt+1}/{max_retries} after {backoff}s")
                    await asyncio.sleep(backoff)
                    continue
                else:
                    logger.error("Rate limit retries exhausted")
                    break
            
            # Retry 5xx server errors (transient server issues)
            if status and 500 <= status < 600:
                last_exception = e
                if attempt < max_retries - 1:
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    logger.warning(f"Server error {status}. Retry {attempt+1}/{max_retries} after {backoff}s")
                    await asyncio.sleep(backoff)
                    continue
                else:
                    logger.error(f"Server error {status} retries exhausted")
                    break
            
            # Other HTTP errors (4xx non-429) shouldn't be retried - surface immediately
            logger.warning(f"HTTP {status} error, not retrying: {e.response.text[:100] if e.response else 'N/A'}")
            raise
            
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout, 
                httpx.TimeoutException, httpx.RemoteProtocolError, httpx.RequestError) as e:
            last_exception = e
            if attempt < max_retries - 1:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                logger.warning(f"Network error, retry {attempt + 1}/{max_retries} after {backoff}s: {e}")
                await asyncio.sleep(backoff)
                continue
            else:
                logger.error(f"All {max_retries} retries exhausted for {getattr(func, '__name__', repr(func))}")
                break
                
        except Exception as e:
            logger.error(f"Unexpected error in {getattr(func, '__name__', repr(func))}: {e}")
            raise
    
    if last_exception:
        raise last_exception
    
    raise RuntimeError("retry_with_backoff: exhausted retries without capturing exception")


@mcp.tool()
async def translate_text(
    text: str,
    target_language: str,

) -> dict:
    """
    Translate text from one language to another using a local vLLM server.
    
    Args:
        text: The text to translate (required)
        target_language: The target language to translate to (e.g., "Hindi", "English", "Tamil"
    
    Returns:
        Dictionary containing:
        - success: Boolean indicating if translation was successful
        - translated_text: The translated text
        - target_language: Target language
        - model: Model used for translation
        - timestamp: ISO 8601 timestamp of translation
        
    Raises:
        ValueError: If required parameters are missing or invalid
    
    Example:
        >>> await translate_text("How are you today?", "Hindi")
        {
            "success": True,
            "translated_text": "आपका कैसे है?",
        }
    """
    
    # Input validation
    if not text or not text.strip():
        raise ValueError("Text to translate cannot be empty")
    
    if not target_language or not target_language.strip():
        raise ValueError("Target language must be specified")
    
    # Use default endpoint if not provided
    endpoint = DEFAULT_VLLM_ENDPOINT
    logger.info(f"Using vLLM endpoint: {endpoint}")
    
    system_prompt = f"Translate the text below to {target_language}"
    user_prompt = text
    
    # Prepare the request payload
    payload = {
        "model": "sarvamai/sarvam-translate",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,  # Low temperature for more deterministic translations

    }
    
    # Make the request
    async def make_request():
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=TIMEOUT
            )
            resp.raise_for_status()
            return resp
    
    try:
        logger.info(f"Translating text to {target_language}")
        resp = await retry_with_backoff(make_request)
        data = resp.json()
        
        # Extract the translated text from the response
        translated_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        
        if not translated_text:
            logger.error("No translation returned from the model")
            return {
                "success": False,
                "error": "No translation returned",
                "detail": "The model did not return any translated text",
                "raw_response": data
            }
        
        # Return successful response
        result = {
            "success": True,
            "translated_text": translated_text.strip(),
            "target_language": target_language,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "usage": data.get("usage", {}),
            "raw_response": data
        }
        
        logger.info(f"Translation successful: '{text[:50]}...' -> '{translated_text[:50]}...'")
        return result
        
    except httpx.HTTPStatusError as e:
        error_data = {
            "success": False,
            "error": "api_error",
            "status_code": e.response.status_code
        }
        try:
            error_data["message"] = e.response.json()
        except:
            error_data["message"] = e.response.text
        
        logger.error(f"Translation API error {e.response.status_code}: {error_data.get('message', '')[:100]}")
        return error_data
        
    except Exception as e:
        logger.error(f"Translation request failed: {e}")
        logger.error(f"Failed endpoint was: {endpoint}")
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(e),
            "endpoint": endpoint
        }


if __name__ == "__main__":
    logger.info(f"Starting Translation MCP Server on 0.0.0.0:9009")
    logger.info(f"Configured vLLM endpoint: {DEFAULT_VLLM_ENDPOINT}")
    logger.info(f"VLLM_ENDPOINT env var: {os.getenv('VLLM_ENDPOINT', 'NOT SET')}")
    mcp.run(transport='streamable-http', host='0.0.0.0', port=9009)