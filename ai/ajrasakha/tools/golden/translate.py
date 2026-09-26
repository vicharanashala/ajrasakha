"""
Translation module using Claude Sonnet model.
Translates input text to English for downstream processing.
Uses MCP local aliases tool to resolve local/regional crop names before translation.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

# Flag to enable/disable MCP local aliases resolution
ENABLE_LOCAL_ALIASES = os.getenv("ENABLE_LOCAL_ALIASES", "true").lower() == "true"

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
7. If you recognize local/regional crop names (e.g., vazhuthana, baigana), translate them to their canonical English names (e.g., Brinjal, Brinjal).
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


async def _resolve_local_names(text: str) -> tuple[str, list[tuple[str, str]]]:
    """
    Resolve local/regional names in text to canonical names using MCP.
    
    Returns:
        Tuple of (resolved_text, list of (original, canonical) pairs found)
    """
    if not ENABLE_LOCAL_ALIASES:
        return text, []
    
    try:
        # Import here to avoid circular imports and allow graceful degradation
        from mcp_client import resolve_local_names_in_text
        return await resolve_local_names_in_text(text)
    except ImportError:
        logger.debug("mcp_client not available, skipping local name resolution")
        return text, []
    except Exception as exc:
        logger.warning("_resolve_local_names: error - %s: %s", type(exc).__name__, exc)
        return text, []


async def _resolve_local_names_batch(text: str) -> tuple[str, list[tuple[str, str, str]]]:
    """
    Resolve local/regional names in text using sentence-based MCP lookup.
    
    This uses the batch lookup_sentence tool which:
    - Handles multi-word terms (e.g., "Gulli Danda", "Madhya Pradesh")
    - Returns English meanings for better translation context
    - Makes only ONE API call instead of one per word
    
    Returns:
        Tuple of (original_text, list of (original, canonical, english_meaning) tuples found)
    """
    if not ENABLE_LOCAL_ALIASES:
        return text, []
    
    try:
        # Import here to avoid circular imports and allow graceful degradation
        from mcp_client import resolve_local_names_batch
        return await resolve_local_names_batch(text)
    except ImportError:
        logger.debug("mcp_client not available, skipping local name resolution")
        return text, []
    except Exception as exc:
        logger.warning("_resolve_local_names_batch: error - %s: %s", type(exc).__name__, exc)
        return text, []


async def translate_to_english(
    text: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    source_language: Optional[str] = None,
    resolve_local_names: bool = True,
) -> str:
    """
    Translate input text to English using Claude Sonnet.
    
    Args:
        text: The text to translate
        model: Optional Claude model override
        api_key: Optional API key override
        source_language: Optional hint about the source language (e.g., "Hindi", "Bengali")
        resolve_local_names: Whether to resolve local/regional names via MCP (default: True)
    
    Returns:
        English translation of the input text
    
    Raises:
        APITimeoutError: If the request times out
        APIConnectionError: If there's a connection issue
        APIStatusError: If the API returns an error status
    """
    if not text or not text.strip():
        return ""
    
    original_text = text.strip()
    text = original_text
    
    # Step 1: Resolve local/regional names to canonical names via MCP (batch/sentence-based)
    resolved_pairs: list[tuple[str, str, str]] = []  # (original, canonical, english_meaning)
    if resolve_local_names:
        text, resolved_pairs = await _resolve_local_names_batch(text)
        if resolved_pairs:
            logger.info(
                "translate_to_english: resolved %d local names: %s",
                len(resolved_pairs),
                resolved_pairs,
            )
    
    llm = get_translation_model(model=model, api_key=api_key)
    
    # Build the human message with optional language hint
    if source_language:
        human_msg = (
            f"Translate the following text from {source_language} to English:\n\n{text}"
        )
    else:
        human_msg = f"Translate the following text to English:\n\n{text}"
    
    # Add context about resolved local names with English meanings for better translation
    if resolved_pairs:
        context = "\n\nNote: The following local/regional terms were identified. Please translate them using their canonical English equivalents:\n"
        for original, canonical, english_meaning in resolved_pairs:
            if english_meaning:
                context += f"- \"{original}\" = {canonical} ({english_meaning})\n"
            else:
                context += f"- \"{original}\" = {canonical}\n"
        human_msg += context
    
    messages = [
        SystemMessage(content=TRANSLATION_SYSTEM_PROMPT),
        HumanMessage(content=human_msg),
    ]
    
    try:
        response = await llm.ainvoke(messages)
        translated = response.content.strip() if hasattr(response, 'content') else str(response).strip()
        
        logger.info(
            "translate_to_english: original_len=%d translated_len=%d local_names_resolved=%d",
            len(original_text),
            len(translated),
            len(resolved_pairs),
        )
        
        return translated
        
    except (APITimeoutError, APIConnectionError, APIStatusError):
        logger.warning(
            "translate_to_english: API error - returning original text (len=%d)",
            len(original_text),
        )
        raise


def translate_to_english_sync(
    text: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    source_language: Optional[str] = None,
    resolve_local_names: bool = True,
) -> str:
    """
    Synchronous version of translate_to_english.
    Use this when you cannot use async/await.
    
    Args:
        text: The text to translate
        model: Optional Claude model override
        api_key: Optional API key override
        source_language: Optional hint about the source language
        resolve_local_names: Whether to resolve local/regional names via MCP (default: True)
    
    Returns:
        English translation of the input text
    """
    if not text or not text.strip():
        return ""
    
    original_text = text.strip()
    text = original_text
    
    # Step 1: Resolve local/regional names to canonical names via MCP (sync version)
    resolved_pairs: list[tuple[str, str]] = []
    if resolve_local_names and ENABLE_LOCAL_ALIASES:
        try:
            from mcp_client import lookup_local_name_sync
            
            # Simple approach: split on whitespace - works for any language
            words = text.split()
            
            for word in words:
                if not word.strip():
                    continue
                    
                canonical = lookup_local_name_sync(word)
                if canonical != word:
                    resolved_pairs.append((word, canonical))
                    text = text.replace(word, canonical, 1)
            
            if resolved_pairs:
                logger.info(
                    "translate_to_english_sync: resolved %d local names: %s",
                    len(resolved_pairs),
                    resolved_pairs,
                )
        except ImportError:
            logger.debug("mcp_client not available, skipping local name resolution")
        except Exception as exc:
            logger.warning(
                "translate_to_english_sync: local name resolution error - %s: %s",
                type(exc).__name__,
                exc,
            )
    
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
    
    # Add context about resolved local names if any
    if resolved_pairs:
        context = "\n\nNote: The following local names were identified and should be translated to their canonical English equivalents:\n"
        for original, canonical in resolved_pairs:
            context += f"- {original} → {canonical}\n"
        human_msg += context
    
    messages = [
        SystemMessage(content=TRANSLATION_SYSTEM_PROMPT),
        HumanMessage(content=human_msg),
    ]
    
    try:
        response = llm.invoke(messages)
        translated = response.content.strip() if hasattr(response, 'content') else str(response).strip()
        
        logger.info(
            "translate_to_english_sync: original_len=%d translated_len=%d local_names_resolved=%d",
            len(original_text),
            len(translated),
            len(resolved_pairs),
        )
        
        return translated
        
    except (APITimeoutError, APIConnectionError, APIStatusError) as exc:
        logger.warning(
            "translate_to_english_sync: API error - returning original text (len=%d): %s",
            len(original_text),
            exc,
        )
        return original_text