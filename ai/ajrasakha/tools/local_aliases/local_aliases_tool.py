#!/usr/bin/env python3
"""
MCP Server for Local Aliases - helps LLM understand regional/local names for agricultural entities.

LLM calls lookup_local_name() whenever user mentions a local/regional name.
Returns the canonical name of the entity.

Usage:
    - lookup_local_name("vazhuthana") → "Brinjal"
    - lookup_local_name("baigana") → "Brinjal"
    - lookup_local_name("Brinjal") → "Brinjal"

LLM can also call lookup_sentence() for batch lookup:
    - lookup_sentence("Gulli Danda khel bahut accha hai") → all terms found with English meanings
"""

import os
import sys
import logging
import threading
import difflib
import time
import json
import re
import string
from typing import Dict, List
from dotenv import load_dotenv
from pymongo import MongoClient
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("ajrasakha-local-aliases-mcp")

# Configuration
_MONGO_URI = os.getenv("MONGO_URI", "")
_DB_NAME = os.getenv("DB_NAME", "agriai")
_COLLECTION_NAME = os.getenv("COLLECTION_NAME", "crop_master")
_RELOAD_INTERVAL = int(os.getenv("LOCAL_ALIASES_RELOAD_INTERVAL", 3600))

# Fuzzy match settings
_FUZZY_CUTOFF = float(os.getenv("LOCAL_ALIASES_FUZZY_CUTOFF", "0.85"))
_MIN_WORD_LENGTH_FOR_FUZZY = int(os.getenv("LOCAL_ALIASES_MIN_FUZZY_LENGTH", "5"))

# Multi-word term settings
_MAX_TERM_LENGTH = int(os.getenv("LOCAL_ALIASES_MAX_TERM_LENGTH", "3"))

# Server settings
_MCP_HOST = os.getenv("LOCAL_ALIASES_MCP_HOST", "0.0.0.0").strip()
_MCP_PORT = int(os.getenv("LOCAL_ALIASES_MCP_PORT", "9103"))
_MCP_PATH = os.getenv("LOCAL_ALIASES_MCP_PATH", "/mcp").strip() or "/mcp"

mcp = FastMCP(
    "ajrasakha-local-aliases-mcp",
    host=_MCP_HOST,
    port=_MCP_PORT,
    streamable_http_path=_MCP_PATH,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    ),
)

# Search index: lowercase_term → canonical_name
_SEARCH_INDEX: Dict[str, str] = {}

# English meanings index: canonical_name → english_meaning
_CANONICAL_TO_ENGLISH: Dict[str, str] = {}

# Word to terms index: word → list of full terms containing this word
_WORD_TO_TERMS: Dict[str, List[str]] = {}

_INDEX_LOCK = threading.Lock()
_LAST_RELOAD = 0.0

# Common punctuation to strip from words (but keep hyphens inside words)
_PUNCTUATION_TO_STRIP = '.,!?;:()[]{}"\'।॥゛゜、。「」『』【】〔〕〖〗〈〉《》〈〉‹›«»¿¡''‐‑‒–—―～˙′″\'"'


def _strip_punctuation(word: str) -> str:
    """Strip leading/trailing punctuation from a word."""
    # Use translate for efficiency
    return word.strip(_PUNCTUATION_TO_STRIP)


def _load_and_build_index():
    """Load from MongoDB and build search indices."""
    global _SEARCH_INDEX, _CANONICAL_TO_ENGLISH, _WORD_TO_TERMS, _LAST_RELOAD
    
    log.info("🔄 Reloading data from MongoDB...")
    
    try:
        client = MongoClient(_MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[_DB_NAME]
        collection = db[_COLLECTION_NAME]
        
        # Build indices
        new_index = {}
        new_english = {}
        new_word_terms: Dict[str, List[str]] = {}
        
        for doc in collection.find({}):
            canonical = doc.get("name", "")
            if not canonical:
                continue
            
            # Add canonical name
            canonical_lower = canonical.lower()
            new_index[canonical_lower] = canonical
            
            # Store first english meaning found for this canonical
            if canonical not in new_english:
                new_english[canonical] = ""
            
            # Build word-to-terms index for multi-word support
            canonical_words = canonical.lower().split()
            if len(canonical_words) <= _MAX_TERM_LENGTH:
                for word in canonical_words:
                    if word not in new_word_terms:
                        new_word_terms[word] = []
                    if canonical not in new_word_terms[word]:
                        new_word_terms[word].append(canonical)
            
            # Add all aliases
            aliases = doc.get("aliases", [])
            for alias in aliases:
                if isinstance(alias, str) and alias.strip():
                    alias_lower = alias.strip().lower()
                    new_index[alias_lower] = canonical
                    
                    # Build word index for aliases too
                    alias_words = alias_lower.split()
                    if len(alias_words) <= _MAX_TERM_LENGTH:
                        for word in alias_words:
                            if word not in new_word_terms:
                                new_word_terms[word] = []
                            if canonical not in new_word_terms[word]:
                                new_word_terms[word].append(canonical)
                                
                elif isinstance(alias, dict):
                    # Get english representation
                    english = alias.get("english_representation", "")
                    if english:
                        # Store first english meaning
                        if not new_english.get(canonical):
                            new_english[canonical] = english.strip()
                        
                        for variant in english.split(","):
                            v = variant.strip().lower()
                            if v:
                                new_index[v] = canonical
                                # Build word index for english variants
                                for word in v.split():
                                    if word not in new_word_terms:
                                        new_word_terms[word] = []
                                    if canonical not in new_word_terms[word]:
                                        new_word_terms[word].append(canonical)
                    
                    # Get native representation
                    native = alias.get("native_representation", "")
                    if native:
                        native_lower = native.lower()
                        new_index[native_lower] = canonical
                        
                        # Build word index for native representations
                        native_words = native_lower.split()
                        if len(native_words) <= _MAX_TERM_LENGTH:
                            for word in native_words:
                                if word not in new_word_terms:
                                    new_word_terms[word] = []
                                if canonical not in new_word_terms[word]:
                                    new_word_terms[word].append(canonical)
        
        client.close()
        
        with _INDEX_LOCK:
            _SEARCH_INDEX = new_index
            _CANONICAL_TO_ENGLISH = new_english
            _WORD_TO_TERMS = new_word_terms
            _LAST_RELOAD = time.time()
        
        log.info(f"✅ Loaded {len(new_index)} terms, {len(new_english)} english meanings, {len(new_word_terms)} words in index")
        
    except Exception as e:
        log.error(f"❌ Error: {e}")


def _poll_background():
    """Background polling thread."""
    log.info(f"👀 Polling every {_RELOAD_INTERVAL}s")
    while True:
        time.sleep(_RELOAD_INTERVAL)
        _load_and_build_index()


def _get_canonical(search_term: str) -> str:
    """
    Get canonical name from search index.
    
    Strategy:
    1. Direct match (exact, case-insensitive)
    2. Only for longer words (5+ chars): fuzzy match with HIGH cutoff (0.85)
    3. Return original if nothing found
    """
    term = _strip_punctuation(search_term.strip().lower())
    
    with _INDEX_LOCK:
        # 1. Direct lookup first (always)
        if term in _SEARCH_INDEX:
            log.debug("_get_canonical: direct match for '%s' -> '%s'", term, _SEARCH_INDEX[term])
            return _SEARCH_INDEX[term]
        
        # 2. Only do fuzzy match for longer words to avoid false positives
        if len(term) >= _MIN_WORD_LENGTH_FOR_FUZZY and _SEARCH_INDEX:
            similar = difflib.get_close_matches(
                term, 
                _SEARCH_INDEX.keys(), 
                n=1, 
                cutoff=_FUZZY_CUTOFF
            )
            if similar:
                log.debug("_get_canonical: fuzzy match for '%s' -> '%s' (score needed: %.2f)", 
                         term, _SEARCH_INDEX[similar[0]], _FUZZY_CUTOFF)
                return _SEARCH_INDEX[similar[0]]
        
        # 3. Not found - return original
        log.debug("_get_canonical: no match for '%s', returning original", term)
        return search_term


def _get_english_meaning(canonical: str) -> str:
    """Get English meaning for a canonical name."""
    with _INDEX_LOCK:
        return _CANONICAL_TO_ENGLISH.get(canonical, "")


def _find_terms_in_sentence(sentence: str) -> List[dict]:
    """
    Find all local/regional terms in a sentence using sliding window algorithm.
    
    Strategy:
    1. Tokenize sentence into words
    2. Strip punctuation from each word
    3. For each position, try matching 1, 2, and 3-word combinations
    4. Prefer longer matches (e.g., "Gulli Danda" over just "Gulli")
    5. Return all found terms with their positions and English meanings
    
    Args:
        sentence: Input sentence in any language
        
    Returns:
        List of dicts with original_term, canonical_name, english_meaning, start_index, end_index
    """
    if not sentence or not sentence.strip():
        return []
    
    # Tokenize: split on whitespace
    words = sentence.split()
    if not words:
        return []
    
    # Strip punctuation from each word for matching, but keep original words too
    clean_words = [_strip_punctuation(w) for w in words]
    
    found_terms = []
    skip_indices = set()
    
    with _INDEX_LOCK:
        index = _SEARCH_INDEX.copy()
        english_map = _CANONICAL_TO_ENGLISH.copy()
    
    n = len(words)
    
    i = 0
    while i < n:
        # Skip if this position is part of a previously matched multi-word term
        if i in skip_indices:
            i += 1
            continue
        
        matched = False
        
        # Try matching from longest (3 words) to shortest (1 word)
        # This ensures we prefer "Gulli Danda" over just "Gulli"
        for term_len in range(min(_MAX_TERM_LENGTH, n - i), 0, -1):
            # Build the candidate phrase from clean_words[i] to clean_words[i + term_len - 1]
            candidate_words = clean_words[i:i + term_len]
            candidate_phrase = " ".join(candidate_words).lower()
            
            # Check if this exact phrase is in our index
            if candidate_phrase in index:
                canonical = index[candidate_phrase]
                english = english_map.get(canonical, "")
                
                # Use original words for the matched term (with punctuation)
                original_matched = " ".join(words[i:i + term_len])
                
                found_terms.append({
                    "original_term": original_matched,
                    "canonical_name": canonical,
                    "english_meaning": english,
                    "start_index": i,
                    "end_index": i + term_len - 1
                })
                
                # Mark all indices of this term as skipped
                for j in range(i, i + term_len):
                    skip_indices.add(j)
                
                matched = True
                break  # Move to next position after this match
        
        if not matched:
            # Also check if the single word itself is in index
            single_word = clean_words[i].lower()
            if single_word in index:
                canonical = index[single_word]
                english = english_map.get(canonical, "")
                
                found_terms.append({
                    "original_term": words[i],  # Keep original with punctuation
                    "canonical_name": canonical,
                    "english_meaning": english,
                    "start_index": i,
                    "end_index": i
                })
                
                skip_indices.add(i)
        
        i += 1
    
    return found_terms


# =============================================================================
# MCP TOOLS
# =============================================================================

@mcp.tool()
def lookup_local_name(name: str) -> str:
    """
    Look up a local/regional name and return the canonical name.
    
    Args:
        name: Local name or canonical name (e.g., "vazhuthana", "Brinjal")
    
    Returns:
        Canonical name if found, otherwise returns the original term
    """
    return _get_canonical(name)


@mcp.tool()
def lookup_sentence(sentence: str) -> str:
    """
    Look up all local/regional terms in a sentence and return matches with English meanings.
    
    This is more efficient than calling lookup_local_name() for each word individually,
    as it processes the entire sentence in one request and handles multi-word terms
    like "Gulli Danda" or "Madhya Pradesh".
    
    Args:
        sentence: Full sentence in any language (e.g., "Gulli Danda bahut accha khel hai")
    
    Returns:
        JSON string containing all found terms with their canonical names and English meanings:
        {
            "found": [
                {
                    "original_term": "Gulli Danda",
                    "canonical_name": "Gulli Danda",
                    "english_meaning": "Traditional stick-and-ball game",
                    "start_index": 0,
                    "end_index": 1
                },
                ...
            ],
            "total_found": 2,
            "original_sentence": "Gulli Danda bahut accha khel hai"
        }
        
        If no matches found:
        {
            "found": [],
            "total_found": 0,
            "original_sentence": "This is a normal English sentence"
        }
    """
    found = _find_terms_in_sentence(sentence)
    
    result = {
        "found": found,
        "total_found": len(found),
        "original_sentence": sentence
    }
    
    return json.dumps(result, indent=2, ensure_ascii=False)


# =============================================================================
# STARTUP
# =============================================================================

_load_and_build_index()
threading.Thread(target=_poll_background, daemon=True).start()


if __name__ == "__main__":
    log.info("🚀 Local Aliases MCP Server starting...")
    log.info(f"   Server: http://{_MCP_HOST}:{_MCP_PORT}{_MCP_PATH}")
    log.info(f"   Fuzzy cutoff: {_FUZZY_CUTOFF}")
    log.info(f"   Min word length for fuzzy: {_MIN_WORD_LENGTH_FOR_FUZZY}")
    log.info(f"   Max term length: {_MAX_TERM_LENGTH} words")
    mcp.run(transport="streamable-http")