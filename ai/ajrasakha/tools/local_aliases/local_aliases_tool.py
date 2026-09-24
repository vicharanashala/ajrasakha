#!/usr/bin/env python3
"""
MCP Server for Local Aliases - helps LLM understand regional/local names for agricultural entities.

LLM calls lookup_local_name() whenever user mentions a local/regional name.
Returns the canonical name of the entity.

Usage:
    - lookup_local_name("vazhuthana") → "Brinjal"
    - lookup_local_name("baigana") → "Brinjal"
    - lookup_local_name("Brinjal") → "Brinjal"
"""

import os
import sys
import logging
import threading
import difflib
import time
from typing import Dict
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

mcp = FastMCP(
    "ajrasakha-local-aliases-mcp",
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    instructions="Look up local/regional names and return the canonical name. For example: vazhuthana → Brinjal",
)

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI", "")
DB_NAME = os.getenv("DB_NAME", "agriai")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "crop_master")
RELOAD_INTERVAL = int(os.getenv("LOCAL_ALIASES_RELOAD_INTERVAL", 3600))

# Fuzzy match settings
FUZZY_CUTOFF = float(os.getenv("LOCAL_ALIASES_FUZZY_CUTOFF", "0.85"))  # Increased from 0.6 to 0.85
MIN_WORD_LENGTH_FOR_FUZZY = int(os.getenv("LOCAL_ALIASES_MIN_FUZZY_LENGTH", "5"))  # Only fuzzy match words 5+ chars

# Just the search mapping - no need for full cache
_SEARCH_INDEX: Dict[str, str] = {}
_INDEX_LOCK = threading.Lock()
_LAST_RELOAD = 0.0


def _load_and_build_index():
    """Load from MongoDB and build simple search index."""
    global _SEARCH_INDEX, _LAST_RELOAD
    
    log.info("🔄 Reloading data from MongoDB...")
    
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        
        # Build simple mapping: lowercase_name → canonical_name
        new_index = {}
        
        for doc in collection.find({}):
            canonical = doc.get("name", "")
            if not canonical:
                continue
            
            # Add canonical name
            canonical_lower = canonical.lower()
            new_index[canonical_lower] = canonical
            
            # Add all aliases
            aliases = doc.get("aliases", [])
            for alias in aliases:
                if isinstance(alias, str) and alias.strip():
                    new_index[alias.strip().lower()] = canonical
                elif isinstance(alias, dict):
                    # Add english representations (may be comma-separated)
                    english = alias.get("english_representation", "")
                    if english:
                        for variant in english.split(","):
                            v = variant.strip().lower()
                            if v:
                                new_index[v] = canonical
                    
                    # Add native representations
                    native = alias.get("native_representation", "")
                    if native:
                        new_index[native.lower()] = canonical
        
        client.close()
        
        with _INDEX_LOCK:
            _SEARCH_INDEX = new_index
            _LAST_RELOAD = time.time()
        
        log.info(f"✅ Loaded {len(new_index)} entries")
        
    except Exception as e:
        log.error(f"❌ Error: {e}")


def _poll_background():
    """Background polling thread."""
    log.info(f"👀 Polling every {RELOAD_INTERVAL}s")
    while True:
        time.sleep(RELOAD_INTERVAL)
        _load_and_build_index()


def _get_canonical(search_term: str) -> str:
    """
    Get canonical name from search index.
    
    Strategy:
    1. Direct match (exact, case-insensitive)
    2. Only for longer words (5+ chars): fuzzy match with HIGH cutoff (0.85)
    3. Return original if nothing found
    """
    term = search_term.strip().lower()
    
    with _INDEX_LOCK:
        # 1. Direct lookup first (always)
        if term in _SEARCH_INDEX:
            log.debug("_get_canonical: direct match for '%s' -> '%s'", term, _SEARCH_INDEX[term])
            return _SEARCH_INDEX[term]
        
        # 2. Only do fuzzy match for longer words to avoid false positives
        if len(term) >= MIN_WORD_LENGTH_FOR_FUZZY and _SEARCH_INDEX:
            similar = difflib.get_close_matches(
                term, 
                _SEARCH_INDEX.keys(), 
                n=1, 
                cutoff=FUZZY_CUTOFF  # Increased from 0.6 to 0.85
            )
            if similar:
                log.debug("_get_canonical: fuzzy match for '%s' -> '%s' (score needed: %.2f)", 
                         term, _SEARCH_INDEX[similar[0]], FUZZY_CUTOFF)
                return _SEARCH_INDEX[similar[0]]
        
        # 3. Not found - return original
        log.debug("_get_canonical: no match for '%s', returning original", term)
        return search_term


# =============================================================================
# MCP TOOL
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


# =============================================================================
# STARTUP
# =============================================================================

_load_and_build_index()
threading.Thread(target=_poll_background, daemon=True).start()


if __name__ == "__main__":
    log.info("🚀 Local Aliases MCP Server started")
    log.info(f"   Fuzzy cutoff: {FUZZY_CUTOFF}")
    log.info(f"   Min word length for fuzzy: {MIN_WORD_LENGTH_FOR_FUZZY}")
    mcp.run()