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


async def detect_language(text: str) -> str:
    """
    Detect the language of the input text using Gemma LLM.
    Returns a lowercased language name (e.g., 'english', 'punjabi', 'hindi').
    Defaults to 'english' on error.
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
                                "Answer in one word only which language is this."
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
            language = result["choices"][0]["message"]["content"].strip().lower()
            logger.info(f"[LANG] Detected language: '{language}' for text: '{text[:60]}'")
            return language
    except Exception as e:
        logger.error(f"[LANG] Error detecting language: {e}")
        return "english"


async def get_user_query_language(messages: list) -> str:
    """
    Extract the last user message from the conversation and detect its language.
    Returns a lowercased language name.
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

    logger.info("[LANG] No user message found, defaulting to 'english'")
    return "english"
