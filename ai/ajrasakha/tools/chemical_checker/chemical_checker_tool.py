import os
import difflib
import logging
import threading
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
DB_NAME = os.getenv("DB_NAME", "agriai-staging")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "chemical_master")

_BANNED_CHEMICALS_CACHE: Dict[str, str] = {}

def _load_banned_chemicals_initial():
    """Fetches the chemical list ONCE at startup."""
    global _BANNED_CHEMICALS_CACHE
    
    if not MONGO_URI:
        log.error("CRITICAL: MONGO_URI is missing.")
        return

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        cursor = db[COLLECTION_NAME].find({}, {"name": 1, "status": 1, "_id": 0})

        _BANNED_CHEMICALS_CACHE.clear()
        count = 0
        for doc in cursor:
            chem_name = doc.get("name")
            status = doc.get("status") or "Banned"
            if chem_name and isinstance(chem_name, str):
                _BANNED_CHEMICALS_CACHE[chem_name.strip().lower()] = str(status).strip()
                count += 1
                
        log.info(f"✅ Initial Load: {count} chemicals cached.")
        client.close()
    except Exception as e:
        log.error(f"❌ Initial DB Load Error: {e}")

_load_banned_chemicals_initial()


def watch_chemical_changes_background():
    """Runs in a background thread and listens to MongoDB synchronously."""
    log.info("👀 Starting background Thread for MongoDB Change Streams...")
    try:
        watch_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        collection = watch_client[DB_NAME][COLLECTION_NAME]
        
        pipeline = [{"$match": {"operationType": {"$in": ["insert", "update", "delete", "replace"]}}}]
        
        with collection.watch(pipeline, full_document='updateLookup') as stream:
            for change in stream:
                op_type = change.get("operationType")
                
                if op_type in ["insert", "update", "replace"]:
                    doc = change.get("fullDocument", {})
                    chem_name = doc.get("name")
                    status = doc.get("status") or "Banned"
                    
                    if chem_name and isinstance(chem_name, str):
                        clean_name = chem_name.strip().lower()
                        _BANNED_CHEMICALS_CACHE[clean_name] = str(status).strip()
                        log.info(f"🔄 Cache Updated via Stream: '{chem_name}' is now '{status}'")

    except Exception as e:
        log.error(f"❌ Background Watcher Error: {e}")

watcher_thread = threading.Thread(target=watch_chemical_changes_background, daemon=True)
watcher_thread.start()


@mcp.tool()
def check_chemical_ban_status(chemicals: List[str]) -> Dict[str, Any]:
    """Checks chemicals against the real-time banned chemicals database."""
    result = {}
    known_chemicals = list(_BANNED_CHEMICALS_CACHE.keys())
    
    for chem in chemicals:
        search_term = chem.strip().lower()
        
        if search_term in _BANNED_CHEMICALS_CACHE:
            result[chem] = _BANNED_CHEMICALS_CACHE[search_term]
            continue
            
        close_matches = difflib.get_close_matches(search_term, known_chemicals, n=1, cutoff=0.9)
        
        if close_matches:
            matched_chem = close_matches[0]
            status = _BANNED_CHEMICALS_CACHE[matched_chem]
            result[chem] = f"{status} (matched with '{matched_chem}')"
        else:
            result[chem] = "not banned/not found"
            
    return {"success": True, "results": result}
