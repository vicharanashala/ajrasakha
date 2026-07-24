import os
from pymongo import MongoClient

MONGO_URI = os.getenv("MONGO_URL")
if not MONGO_URI:
    raise ValueError("MONGO_URL environment variable is required")

# Connect to MongoDB cluster
client = MongoClient(MONGO_URI)
db = client.get_database("hackathon")

def get_disclaimer_triggered_queries():
    """
    Fetch queries from the database that triggered a disclaimer.
    In the real schema, we assume there's a collection 'queries' 
    where 'has_disclaimer' is True, or it failed to be answered.
    """
    collection = db.get_collection("questions")
    
    # We fetch all queries for now and map them to the expected format
    cursor = collection.find({})
    
    mapped_queries = []
    for doc in cursor:
        details = doc.get("details", {})
        
        # Safely extract domain (it might be a list)
        domain = "Unknown"
        raw_domain = details.get("domain")
        if isinstance(raw_domain, list) and len(raw_domain) > 0:
            domain = raw_domain[0]
        elif isinstance(raw_domain, str):
            domain = raw_domain
            
        mapped_queries.append({
            "_id": str(doc.get("_id")),
            "text": doc.get("question", doc.get("text", "")),
            "crop": details.get("crop", "Unknown"),
            "state": details.get("state", "Unknown"),
            "domain": domain,
            "timestamp": doc.get("createdAt").isoformat() if doc.get("createdAt") else ""
        })
        
    return mapped_queries

if __name__ == "__main__":
    # Test connection
    queries = get_disclaimer_triggered_queries()
    print(f"Fetched {len(queries)} disclaimer-triggered queries.")
