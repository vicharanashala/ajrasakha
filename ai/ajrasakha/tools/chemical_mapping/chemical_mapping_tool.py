import os
import difflib
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv
from pymongo import MongoClient
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

mcp = FastMCP(
    "ajrasakha-chemical-mapping-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "ajrasakha_db")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "chemical_aliases")

db_client = None
if MONGO_URI:
    try:
        db_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        log.info("✅ Global MongoDB Connection Pool Initialized.")
    except Exception as e:
        log.error(f"❌ Failed to initialize MongoDB client: {e}")
else:
    log.error("CRITICAL: MONGO_URI is missing from environment variables.")

_ALIAS_TO_CHEM_CACHE: Dict[str, str] = {}
_CHEM_TO_ALIASES_CACHE: Dict[str, List[str]] = {}

def _load_mappings_from_db() -> Dict[str, Any]:
    """Helper to fetch the mapping list from MongoDB and cache it using the global pool."""
    global _ALIAS_TO_CHEM_CACHE, _CHEM_TO_ALIASES_CACHE, db_client
    
    if not db_client:
        return {"error": "MongoDB client is not initialized.", "success": False}

    log.info("Fetching mapping data from MongoDB to build cache...")

    try:
        db = db_client[DB_NAME]
        collection = db[COLLECTION_NAME]

        cursor = collection.find({}, {"chemical_name": 1, "aliases": 1, "_id": 0})
        
        _ALIAS_TO_CHEM_CACHE.clear()
        _CHEM_TO_ALIASES_CACHE.clear()

        for doc in cursor:
            official_name = doc.get("chemical_name")
            aliases = doc.get("aliases", [])

            if official_name:
                lower_official = official_name.strip().lower()
                _CHEM_TO_ALIASES_CACHE[lower_official] = aliases
                
                for alias in aliases:
                    _ALIAS_TO_CHEM_CACHE[alias.strip().lower()] = official_name
                    
        log.info(f"✅ Loaded {len(_CHEM_TO_ALIASES_CACHE)} chemicals and {len(_ALIAS_TO_CHEM_CACHE)} alias mappings.")
        return {"success": True}
        
    except Exception as e:
        err_msg = f"Unexpected DB Load Error: {e}"
        log.error(f"❌ {err_msg}")
        return {"error": err_msg, "success": False}

_load_mappings_from_db()


@mcp.tool()
def get_chemical_by_alias(alias_name: str) -> Dict[str, Any]:
    """
    Takes a local/common name of a chemical and returns the official chemical name.
    Useful when farmers use trade names like 'Lasso' instead of 'Alachlor'.
    """
    
    search_term = alias_name.strip().lower()
    
    if search_term in _ALIAS_TO_CHEM_CACHE:
        return {"success": True, "chemical_name": _ALIAS_TO_CHEM_CACHE[search_term], "match_type": "exact"}
    
    known_aliases = list(_ALIAS_TO_CHEM_CACHE.keys())
    matches = difflib.get_close_matches(search_term, known_aliases, n=1, cutoff=0.9)
    
    if matches:
        best_match = matches[0]
        return {
            "success": True, 
            "chemical_name": _ALIAS_TO_CHEM_CACHE[best_match], 
            "match_found_for": best_match,
            "match_type": "fuzzy"
        }
    
    return {"success": False, "error": "No matching chemical found for this alias."}


@mcp.tool()
def get_aliases_by_chemical(chemical_name: str) -> Dict[str, Any]:
    """
    Takes an official chemical name and returns all its known aliases/common names.
    """
    
    search_term = chemical_name.strip().lower()
    
    if search_term in _CHEM_TO_ALIASES_CACHE:
        return {"success": True, "aliases": _CHEM_TO_ALIASES_CACHE[search_term], "match_type": "exact"}
    
    known_chems = list(_CHEM_TO_ALIASES_CACHE.keys())
    matches = difflib.get_close_matches(search_term, known_chems, n=1, cutoff=0.9)
    
    if matches:
        best_match = matches[0]
        return {
            "success": True, 
            "aliases": _CHEM_TO_ALIASES_CACHE[best_match], 
            "chemical_found": best_match,
            "match_type": "fuzzy"
        }

    return {"success": False, "error": "Chemical name not found in database."}


if __name__ == "__main__":
    mcp.run(transport="stdio")
