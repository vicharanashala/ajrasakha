"""
Translation module using Claude Sonnet model.
Translates input text to English for downstream processing.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

# Default to claude-sonnet-4-6 (same model used in agents/config.py)
DEFAULT_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

# Translation system prompt - instructs Claude to translate to English
TRANSLATION_SYSTEM_PROMPT = """You are a professional agricultural translator. Your task is to translate the input text to English.

Rules:
1. Translate the text accurately to English
2. Preserve agricultural terminology and crop names as they appear
3. Keep technical farming terms in their original form if no direct English equivalent exists
4. Maintain the original meaning and intent of the text
5. If the input is already in English, return it as-is
6. Do not add explanations or notes - only provide the translation
"""

def get_translation_model(
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    timeout: Optional[float] = None,
) -> ChatAnthropic:
    """
    Create a ChatAnthropic instance configured for translation.
    
    Args:
        model: Claude model to use (default: claude-sonnet-4-6)
        api_key: Anthropic API key (reads from ANTHROPIC_API_KEY env var if not provided)
        timeout: Request timeout in seconds (default: 30)
    
    Returns:
        Configured ChatAnthropic instance
    """
    effective_model = model or DEFAULT_MODEL
    effective_api_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
    effective_timeout = timeout or float(os.getenv("ANTHROPIC_TIMEOUT_S", "30"))
    
    return ChatAnthropic(
        model=effective_model,
        api_key=effective_api_key,
        timeout=effective_timeout,
        max_tokens=4096,
        temperature=0.3,  # Low temperature for consistent translations
    )


async def translate_to_english(
    text: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    source_language: Optional[str] = None,
) -> str:
    """
    Translate input text to English using Claude Sonnet.
    
    Args:
        text: The text to translate
        model: Optional Claude model override
        api_key: Optional API key override
        source_language: Optional hint about the source language (e.g., "Hindi", "Bengali")
    
    Returns:
        English translation of the input text
    
    Raises:
        APITimeoutError: If the request times out
        APIConnectionError: If there's a connection issue
        APIStatusError: If the API returns an error status
    """
    if not text or not text.strip():
        return ""
    
    text = text.strip()
    
    llm = get_translation_model(model=model, api_key=api_key)
    
    # Build the human message with optional language hint
    if source_language:
        human_msg = (
            f"Translate the following text from {source_language} to English:\n\n{text}"
        )
    else:
        human_msg = f"Translate the following text to English:\n\n{text}"
    
    messages = [
        SystemMessage(content=TRANSLATION_SYSTEM_PROMPT),
        HumanMessage(content=human_msg),
    ]
    
    try:
        response = await llm.ainvoke(messages)
        translated = response.content.strip() if hasattr(response, 'content') else str(response).strip()
        
        logger.info(
            "translate_to_english: original_len=%d translated_len=%d",
            len(text),
            len(translated),
        )
        
        return translated
        
    except (APITimeoutError, APIConnectionError, APIStatusError):
        logger.warning(
            "translate_to_english: API error - returning original text (len=%d)",
            len(text),
        )
        raise


def translate_to_english_sync(
    text: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    source_language: Optional[str] = None,
) -> str:
    """
    Synchronous version of translate_to_english.
    Use this when you cannot use async/await.
    
    Args:
        text: The text to translate
        model: Optional Claude model override
        api_key: Optional API key override
        source_language: Optional hint about the source language
    
    Returns:
        English translation of the input text
    """
    if not text or not text.strip():
        return ""
    
    text = text.strip()
    
    effective_model = model or DEFAULT_MODEL
    effective_api_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
    effective_timeout = float(os.getenv("ANTHROPIC_TIMEOUT_S", "30"))
    
    llm = ChatAnthropic(
        model=effective_model,
        api_key=effective_api_key,
        timeout=effective_timeout,
        max_tokens=4096,
        temperature=0.3,
    )
    
    # Build the human message with optional language hint
    if source_language:
        human_msg = (
            f"Translate the following text from {source_language} to English:\n\n{text}"
        )
    else:
        human_msg = f"Translate the following text to English:\n\n{text}"
    
    messages = [
        SystemMessage(content=TRANSLATION_SYSTEM_PROMPT),
        HumanMessage(content=human_msg),
    ]
    
    try:
        response = llm.invoke(messages)
        translated = response.content.strip() if hasattr(response, 'content') else str(response).strip()
        
        logger.info(
            "translate_to_english_sync: original_len=%d translated_len=%d",
            len(text),
            len(translated),
        )
        
        return translated
        
    except (APITimeoutError, APIConnectionError, APIStatusError) as exc:
        logger.warning(
            "translate_to_english_sync: API error - returning original text (len=%d): %s",
            len(text),
            exc,
        )
        return text