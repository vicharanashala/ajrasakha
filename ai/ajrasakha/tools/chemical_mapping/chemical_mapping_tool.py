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

_ALIAS_TO_CHEM_CACHE: Dict[str, str] = {}
_CHEM_TO_ALIASES_CACHE: Dict[str, List[str]] = {}

def _load_mappings_from_db():
    global _ALIAS_TO_CHEM_CACHE, _CHEM_TO_ALIASES_CACHE
    
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DB_NAME", "ajrasakha_db")
    collection_name = os.getenv("COLLECTION_NAME", "chemical_aliases")

    if not mongo_uri:
        log.error("MONGO_URI missing!")
        return

    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        db = client[db_name]
        collection = db[collection_name]

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
    except Exception as e:
        log.error(f"❌ DB Load Error: {e}")
    finally:
        if 'client' in locals(): client.close()

@mcp.tool()
def get_chemical_by_alias(alias_name: str) -> Dict[str, Any]:
    """
    Takes a local/common name of a chemical and returns the official chemical name.
    Useful when farmers use trade names like 'Lasso' instead of 'Alachlor'.
    """
    if not _ALIAS_TO_CHEM_CACHE: _load_mappings_from_db()
    
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
    if not _CHEM_TO_ALIASES_CACHE: _load_mappings_from_db()
    
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
    _load_mappings_from_db()
    mcp.run(transport="stdio")