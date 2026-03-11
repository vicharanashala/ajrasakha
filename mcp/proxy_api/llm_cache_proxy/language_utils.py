"""
Language detection utilities for the LLM Cache Proxy.

Uses Gemma model to detect the language of user queries so the cache
can be partitioned by language (preventing cross-language cache hits).

Adapted from: proxy_api/api_container/multilingual.py
"""
import httpx
import logging

from config import LANG_DETECTION_MODEL_URL, LANG_DETECTION_MODEL_NAME

logger = logging.getLogger("mcp-cache-proxy")

from typing import Optional

ALLOWED_LANGUAGES = {
    "hindi", "bengali", "marathi", "telugu", "tamil", "gujarati",
    "urdu", "kannada", "odia", "malayalam", "punjabi", "assamese",
    "english",
}


async def detect_language(text: str) -> Optional[str]:
    """
    Detect the language of the input text using Gemma LLM.
    Returns a lowercased language name constrained to ALLOWED_LANGUAGES.
    Returns None on error or if the model returns an unexpected value.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                LANG_DETECTION_MODEL_URL,
                json={
                    "model": LANG_DETECTION_MODEL_NAME,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Detect the language of the following sentence. "
                                "Don't assume language based on geographical location.\n\n"
                                "Answer in one word only which language is this. "
                                "Choose from: hindi, bengali, marathi, telugu, tamil, "
                                "gujarati, urdu, kannada, odia, malayalam, punjabi, "
                                "assamese, english."
                            ),
                        },
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0.0,
                    "max_tokens": 3,
                },
                timeout=10.0,
            )
            response.raise_for_status()
            result = response.json()
            raw = result["choices"][0]["message"]["content"].strip().lower()
            
            if raw in ALLOWED_LANGUAGES:
                logger.info(f"[LANG] Detected language: '{raw}' for text: '{text[:60]}'")
                return raw
            else:
                logger.warning(f"[LANG] Model returned '{raw}', not in allowed list — skipping caching")
                return None
    except Exception as e:
        logger.error(f"[LANG] Error detecting language: {e} — skipping caching")
        return None


async def get_user_query_language(messages: list) -> Optional[str]:
    """
    Extract the last user message from the conversation and detect its language.
    Returns a lowercased language name, or None if detection fails/is unsupported.
    """
    # Walk backwards to find the most recent user message
    for i in range(len(messages) - 1, -1, -1):
        msg = messages[i]
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                # Handle multimodal messages (list of content parts)
                text_parts = [
                    p.get("text", "") for p in content
                    if isinstance(p, dict) and p.get("type") == "text"
                ]
                content = " ".join(text_parts)
            if content and content.strip():
                return await detect_language(content.strip())

    logger.info("[LANG] No user message found, skipping cache")
    return None
