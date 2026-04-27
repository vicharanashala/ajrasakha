import os
import difflib
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure
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

_BANNED_CHEMICALS_CACHE: Dict[str, str] = {}

def _load_banned_chemicals_from_db() -> Dict[str, Any]:
    """Helper to fetch the chemical list from MongoDB and cache it."""
    global _BANNED_CHEMICALS_CACHE
    
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DB_NAME", "ajrasakha_db")
    collection_name = os.getenv("COLLECTION_NAME", "banned_chemicals")

    if not mongo_uri:
        err_msg = "MONGO_URI is missing from environment variables."
        log.error(f"DB Error: {err_msg}")
        return {"error": err_msg, "success": False}

    log.info("Connecting to MongoDB to load chemical cache...")
    
    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        
        db = client[db_name]
        collection = db[collection_name]

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
                
        log.info(f"Successfully loaded {count} banned chemicals into memory cache.")
        return {"success": True}

    except ConnectionFailure as e:
        err_msg = f"Failed to connect to MongoDB: {e}"
        log.error(f"DB Error: {err_msg}")
        return {"error": err_msg, "success": False}
    except OperationFailure as e:
        err_msg = f"Authentication or access error with MongoDB: {e}"
        log.error(f"DB Error: {err_msg}")
        return {"error": err_msg, "success": False}
    except Exception as e:
        err_msg = f"Unexpected error while loading data from DB: {e}"
        log.error(f"DB Error: {err_msg}", exc_info=True)
        return {"error": err_msg, "success": False}
    finally:
        if 'client' in locals():
            client.close()

@mcp.tool()
def check_chemical_ban_status(chemicals: List[str]) -> Dict[str, Any]:
    """
    Checks a list of chemicals against the banned chemicals database.
    Includes fuzzy matching to handle slight spelling mistakes.
    """

    if not _BANNED_CHEMICALS_CACHE:
        log.warning("Cache is empty during tool call. Attempting to load from DB...")
        db_response = _load_banned_chemicals_from_db()
        
        if not db_response.get("success") or not _BANNED_CHEMICALS_CACHE:
            error_details = db_response.get("error", "Unknown DB issue.")
            log.error("Cache is still empty. Returning error response.")
            return {"success": False, "error": f"System Error: Unable to verify chemical status. Details: {error_details}"}
    
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
    _load_banned_chemicals_from_db()
    mcp.run(transport="stdio")