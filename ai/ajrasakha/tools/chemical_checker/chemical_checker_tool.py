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
    "ajrasakha-chemical-checker-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "ajrasakha_db")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "banned_chemicals")

db_client = None
if MONGO_URI:
    try:
        db_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        log.info("✅ Global MongoDB Connection Pool Initialized.")
    except Exception as e:
        log.error(f"❌ Failed to initialize MongoDB client: {e}")
else:
    log.error("CRITICAL: MONGO_URI is missing from environment variables.")

_BANNED_CHEMICALS_CACHE: Dict[str, str] = {}

def _load_banned_chemicals_from_db() -> Dict[str, Any]:
    """Helper to fetch the chemical list from MongoDB and cache it using the global pool."""
    global _BANNED_CHEMICALS_CACHE, db_client
    
    if not db_client:
        return {"error": "MongoDB client is not initialized.", "success": False}

    log.info("Fetching chemical data from MongoDB to build cache...")
    
    try:
        db = db_client[DB_NAME]
        collection = db[COLLECTION_NAME]

        cursor = collection.find(
            {}, 
            {"chemical_name": 1, "status": 1, "status_category": 1, "_id": 0}
        )

        _BANNED_CHEMICALS_CACHE.clear()
        count = 0
        
        for doc in cursor:
            chem_name = doc.get("chemical_name")
            status = doc.get("status_category") or doc.get("status") or "Banned"

            if chem_name and isinstance(chem_name, str):
                _BANNED_CHEMICALS_CACHE[chem_name.strip().lower()] = str(status).strip()
                count += 1
                
        log.info(f"✅ Successfully loaded {count} banned chemicals into memory cache.")
        return {"success": True}

    except Exception as e:
        err_msg = f"Unexpected error while loading data from DB: {e}"
        log.error(f"DB Error: {err_msg}", exc_info=True)
        return {"error": err_msg, "success": False}
        
_load_banned_chemicals_from_db()


@mcp.tool()
def check_chemical_ban_status(chemicals: List[str]) -> Dict[str, Any]:
    """
    Checks a list of chemicals against the banned chemicals database.
    Includes fuzzy matching to handle slight spelling mistakes.
    """
    
    result = {}
    known_chemicals = list(_BANNED_CHEMICALS_CACHE.keys())
    
    for chem in chemicals:
        search_term = chem.strip().lower()
        
        if search_term in _BANNED_CHEMICALS_CACHE:
            result[chem] = _BANNED_CHEMICALS_CACHE[search_term]
            continue
            
        close_matches = difflib.get_close_matches(
            search_term, 
            known_chemicals, 
            n=1, 
            cutoff=0.9
        )
        
        if close_matches:
            matched_chem = close_matches[0]
            status = _BANNED_CHEMICALS_CACHE[matched_chem]
            result[chem] = f"{status} (matched with '{matched_chem}')"
        else:
            result[chem] = "not banned/not found"
            
    log.info(f"Processed batch of {len(chemicals)} chemicals.")
    return {
        "success": True, 
        "results": result
    }

if __name__ == "__main__":
    mcp.run(transport="stdio")
