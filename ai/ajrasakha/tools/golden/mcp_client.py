"""
MCP Client for calling local aliases tool.

The MCP server is deployed at http://100.100.108.44:9103/mcp and exposes:
- lookup_local_name(name: str) -> str

Returns the canonical name for local/regional crop names.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# MCP Server configuration
MCP_SERVER_URL = os.getenv("LOCAL_ALIASES_MCP_URL", "http://100.100.108.43:9103/mcp")
MCP_TIMEOUT_S = float(os.getenv("LOCAL_ALIASES_MCP_TIMEOUT_S", "10"))

# Headers for MCP protocol
MCP_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}

# Session state
_session_id: Optional[str] = None
_initialized: bool = False


def _parse_sse_response(response_text: str) -> dict:
    """Parse SSE format response from MCP server."""
    match = re.search(r'data:\s*(\{.*\})', response_text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return {}


async def _ensure_initialized(client: httpx.AsyncClient) -> Optional[str]:
    """Ensure MCP session is initialized. Returns session_id."""
    global _session_id, _initialized
    
    if _initialized and _session_id:
        return _session_id
    
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "golden-mcp-client", "version": "1.0.0"}
        }
    }
    
    resp = await client.post(MCP_SERVER_URL, json=payload, headers=MCP_HEADERS, timeout=MCP_TIMEOUT_S)
    
    if resp.status_code == 200:
        result = _parse_sse_response(resp.text)
        if "result" in result:
            _session_id = resp.headers.get("Mcp-Session-Id")
            _initialized = True
            logger.debug("MCP initialized with session_id: %s", _session_id)
            
            notif_payload = {
                "jsonrpc": "2.0",
                "id": None,
                "method": "notifications/initialized"
            }
            notif_headers = dict(MCP_HEADERS)
            if _session_id:
                notif_headers["Mcp-Session-Id"] = _session_id
            try:
                await client.post(MCP_SERVER_URL, json=notif_payload, headers=notif_headers, timeout=MCP_TIMEOUT_S)
            except Exception:
                pass
    
    return _session_id


def _parse_sse_response_sync(response_text: str) -> dict:
    """Parse SSE format response from MCP server (sync version)."""
    match = re.search(r'data:\s*(\{.*\})', response_text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return {}


def _ensure_initialized_sync(client: httpx.Client) -> Optional[str]:
    """Ensure MCP session is initialized (sync version)."""
    global _session_id, _initialized
    
    if _initialized and _session_id:
        return _session_id
    
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "golden-mcp-client", "version": "1.0.0"}
        }
    }
    
    resp = client.post(MCP_SERVER_URL, json=payload, headers=MCP_HEADERS, timeout=MCP_TIMEOUT_S)
    
    if resp.status_code == 200:
        result = _parse_sse_response_sync(resp.text)
        if "result" in result:
            _session_id = resp.headers.get("Mcp-Session-Id")
            _initialized = True
            logger.debug("MCP initialized with session_id: %s", _session_id)
            
            notif_payload = {
                "jsonrpc": "2.0",
                "id": None,
                "method": "notifications/initialized"
            }
            notif_headers = dict(MCP_HEADERS)
            if _session_id:
                notif_headers["Mcp-Session-Id"] = _session_id
            try:
                client.post(MCP_SERVER_URL, json=notif_payload, headers=notif_headers, timeout=MCP_TIMEOUT_S)
            except Exception:
                pass
    
    return _session_id


async def lookup_local_name(name: str) -> str:
    """
    Call the MCP server's lookup_local_name tool.
    
    Args:
        name: Local name or regional name of a crop/entity
        
    Returns:
        Canonical name if found, otherwise returns the original name
    """
    if not name or not name.strip():
        return name
    
    name = name.strip()
    
    payload = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "lookup_local_name",
            "arguments": {"name": name}
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            session_id = await _ensure_initialized(client)
            
            headers = dict(MCP_HEADERS)
            if session_id:
                headers["Mcp-Session-Id"] = session_id
            
            response = await client.post(MCP_SERVER_URL, json=payload, headers=headers, timeout=MCP_TIMEOUT_S)
            response.raise_for_status()
            
            result = _parse_sse_response(response.text)
            
            if "result" in result:
                content = result["result"].get("content", [])
                if content and isinstance(content, list):
                    for block in content:
                        if block.get("type") == "text":
                            canonical = block.get("text", "").strip()
                            if canonical:
                                logger.debug(
                                    "lookup_local_name: '%s' -> '%s'",
                                    name,
                                    canonical
                                )
                                return canonical
            
            logger.warning(
                "lookup_local_name: unexpected response format for '%s': %s",
                name,
                result
            )
            return name
            
    except httpx.TimeoutException:
        logger.warning("lookup_local_name: timeout for '%s'", name)
        return name
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "lookup_local_name: HTTP %d for '%s': %s",
            exc.response.status_code,
            name,
            exc
        )
        return name
    except Exception as exc:
        logger.warning(
            "lookup_local_name: error for '%s': %s: %s",
            name,
            type(exc).__name__,
            exc
        )
        return name


def lookup_local_name_sync(name: str) -> str:
    """Synchronous version of lookup_local_name."""
    if not name or not name.strip():
        return name
    
    name = name.strip()
    
    payload = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "lookup_local_name",
            "arguments": {"name": name}
        }
    }
    
    try:
        with httpx.Client() as client:
            session_id = _ensure_initialized_sync(client)
            
            headers = dict(MCP_HEADERS)
            if session_id:
                headers["Mcp-Session-Id"] = session_id
            
            response = client.post(MCP_SERVER_URL, json=payload, headers=headers, timeout=MCP_TIMEOUT_S)
            response.raise_for_status()
            
            result = _parse_sse_response_sync(response.text)
            
            if "result" in result:
                content = result["result"].get("content", [])
                if content and isinstance(content, list):
                    for block in content:
                        if block.get("type") == "text":
                            canonical = block.get("text", "").strip()
                            if canonical:
                                return canonical
            
            return name
            
    except Exception as exc:
        logger.warning(
            "lookup_local_name_sync: error for '%s': %s: %s",
            name,
            type(exc).__name__,
            exc
        )
        return name


def _is_valid_local_name(word: str, canonical: str) -> bool:
    """
    Check if this looks like a valid local name replacement.
    
    We want to avoid replacing common grammar words or short particles
    that might fuzzy-match to crop names.
    
    Rules:
    - Skip if same (no change needed)
    - Skip if original is very short (likely not a crop name)
    - Skip if original is a common Hindi function word
    """
    original_lower = word.lower().strip()
    canonical_lower = canonical.lower().strip()
    
    # Same value - no change
    if original_lower == canonical_lower:
        return False
    
    # Too short to be a meaningful crop name
    if len(word.strip()) < 4:
        logger.debug("_is_valid_local_name: '%s' too short (< 4 chars), skipping", word)
        return False
    
    # Common Hindi function words and common nouns that might fuzzy-match incorrectly
    # These should NOT be replaced as they are generic words
    common_hindi_words = {
        'में', 'को', 'से', 'का', 'की', 'के', 'पर', 'है', 'हैं',
        'और', 'या', 'लिए', 'अपने', 'मैं', 'कि', 'ना', 'नहीं',
        'हाँ', 'तो', 'जब', 'अगर', 'एक', 'क्या', 'क्यों',
        'कहाँ', 'कब', 'कैसे', 'कितना', 'कितने',
        'पत्तियों', 'पत्ता', 'पत्ते', 'रहे', 'रही',
        # Common words that fuzzy-match to crops incorrectly
        'धब्बे', 'धब्बा',  # spots (not Blueberries)
        'क्यों',  # why
        'आ रहे', 'आता', 'आने',  # coming
    }
    
    # Check without trailing diacritics/vowel marks
    clean_word = word.strip()
    # Remove common Hindi vowel marks from end
    for suffix in ['่', 'ो', 'ें', 'ि', 'ी', 'ू', 'ै', 'ा', 'ो', 'ें']:
        if clean_word.endswith(suffix):
            clean_word = clean_word[:-1]
    
    if clean_word.lower() in common_hindi_words:
        logger.debug("_is_valid_local_name: '%s' is common word, skipping", word)
        return False
    
    return True


async def lookup_sentence(sentence: str) -> dict:
    """
    Look up all local/regional terms in a sentence via MCP lookup_sentence tool.
    
    This is more efficient than calling lookup_local_name() for each word,
    and handles multi-word terms like "Gulli Danda" or "Madhya Pradesh".
    
    Args:
        sentence: Full sentence in any language
        
    Returns:
        dict with:
            - found: list of {original_term, canonical_name, english_meaning, start_index, end_index}
            - total_found: count of matches
            - original_sentence: the input sentence
            - raw_response: the raw JSON string from MCP server
    """
    async with httpx.AsyncClient() as client:
        session_id = await _ensure_initialized(client)
        
        if not session_id:
            logger.warning("lookup_sentence: MCP not initialized, returning empty")
            return {"found": [], "total_found": 0, "original_sentence": sentence, "raw_response": "{}\n"}
        
        tool_params = {"sentence": sentence}
        
        payload = {
            "jsonrpc": "2.0",
            "id": 3,  # Fixed ID for lookup_sentence tool calls
            "method": "tools/call",
            "params": {
                "name": "lookup_sentence",
                "arguments": tool_params
            }
        }
        
        headers = dict(MCP_HEADERS)
        headers["Mcp-Session-Id"] = session_id
        
        try:
            resp = await client.post(MCP_SERVER_URL, json=payload, headers=headers, timeout=MCP_TIMEOUT_S)
            
            if resp.status_code == 200:
                raw = resp.text
                result = _parse_sse_response(raw)
                
                # Extract the content from MCP response
                content = ""
                if "result" in result and "content" in result["result"]:
                    for item in result["result"]["content"]:
                        if item.get("type") == "text":
                            content = item.get("text", "")
                            break
                
                # Parse the JSON content returned by lookup_sentence tool
                try:
                    parsed = json.loads(content)
                    return {
                        "found": parsed.get("found", []),
                        "total_found": parsed.get("total_found", 0),
                        "original_sentence": parsed.get("original_sentence", sentence),
                        "raw_response": raw
                    }
                except json.JSONDecodeError:
                    logger.warning("lookup_sentence: failed to parse response content")
                    return {"found": [], "total_found": 0, "original_sentence": sentence, "raw_response": raw}
            else:
                logger.warning("lookup_sentence: HTTP %d - %s", resp.status_code, resp.text[:200])
                return {"found": [], "total_found": 0, "original_sentence": sentence, "raw_response": "{}\n"}
        except httpx.TimeoutException:
            logger.warning("lookup_sentence: timeout calling MCP server")
            return {"found": [], "total_found": 0, "original_sentence": sentence, "raw_response": "{}\n"}
        except Exception as exc:
            logger.warning("lookup_sentence: error - %s: %s", type(exc).__name__, exc)
            return {"found": [], "total_found": 0, "original_sentence": sentence, "raw_response": "{}\n"}


async def resolve_local_names_in_text(text: str) -> tuple[str, list[tuple[str, str]]]:
    """
    Look up local/regional names in text via MCP and return resolved pairs.
    
    IMPORTANT: This does NOT modify/replace the text. Instead, it returns
    pairs of (local_name, canonical_name) that can be used as context
    for the translation prompt. This prevents corrupting the text with
    incorrect fuzzy matches.
    
    Args:
        text: Input text that may contain local/regional names
        
    Returns:
        Tuple of (original_text_unchanged, list of (local_name, canonical_name) pairs)
    """
    if not text:
        return text, []
    
    words = text.split()
    
    logger.info(
        "resolve_local_names_in_text: checking %d words",
        len(words),
    )
    
    resolved_pairs = []
    
    for word in words:
        if not word.strip():
            continue
        
        logger.debug("resolve_local_names_in_text: checking '%s'", word)
        canonical = await lookup_local_name(word)
        
        # Only collect valid local name replacements (don't replace in text)
        if canonical != word and _is_valid_local_name(word, canonical):
            resolved_pairs.append((word, canonical))
            logger.info("resolve_local_names_in_text: '%s' -> '%s' (context for translation)", word, canonical)
    
    return text, resolved_pairs


async def resolve_local_names_batch(text: str) -> tuple[str, list[tuple[str, str, str]]]:
    """
    Look up all local/regional terms in a sentence via MCP lookup_sentence tool.
    
    This uses the sentence-based lookup which:
    - Handles multi-word terms (e.g., "Gulli Danda", "Madhya Pradesh")
    - Makes only ONE API call instead of one per word
    - Returns English meanings for better translation context
    
    IMPORTANT: This REPLACES local names with canonical names in the text!
    So "podduthirugudu mein paise kaise kamaen" becomes "Sunflower mein paise kaise kamaen"
    
    Args:
        text: Input text that may contain local/regional names
        
    Returns:
        Tuple of (resolved_text_with_replacements, list of (local_name, canonical_name, english_meaning) tuples)
    """
    if not text:
        return text, []
    
    logger.info("resolve_local_names_batch: processing sentence (len=%d)", len(text))
    
    result = await lookup_sentence(text)
    
    resolved_tuples = []
    resolved_text = text
    
    # Sort by length descending so we replace longer terms first (e.g., "Madhya Pradesh" before "Madhya")
    found_terms = sorted(result.get("found", []), key=lambda x: -len(x.get("original_term", "")))
    
    for term_info in found_terms:
        original_term = term_info.get("original_term", "")
        canonical_name = term_info.get("canonical_name", "")
        english_meaning = term_info.get("english_meaning", "")
        
        # Skip if no valid data
        if not original_term or not canonical_name:
            continue
        
        # Only include if it's a valid local name (not same, not too short)
        if _is_valid_local_name(original_term, canonical_name):
            # REPLACE in text - this is the key change!
            resolved_text = resolved_text.replace(original_term, canonical_name, 1)
            resolved_tuples.append((original_term, canonical_name, english_meaning))
            logger.info(
                "resolve_local_names_batch: '%s' -> '%s' (meaning: '%s')",
                original_term, canonical_name, english_meaning
            )
    
    logger.info("resolve_local_names_batch: found %d local terms in sentence", len(resolved_tuples))
    
    return resolved_text, resolved_tuples