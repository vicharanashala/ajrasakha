import os
from pymongo import MongoClient

# Use the environment variable if available, else fallback to the hardcoded URI for development
MONGO_URI = os.getenv(
    "MONGO_URL",
    "mongodb+srv://lpulga167_db_user:UUXFvuymiWUfMeT3@hackathon.ibfnza4.mongodb.net/?appName=hackathon"
)

# Connect to MongoDB cluster
client = MongoClient(MONGO_URI)
db = client.get_database("hackathon")

def get_disclaimer_triggered_queries():
    """
    Fetch queries from the database that triggered a disclaimer.
    In the real schema, we assume there's a collection 'queries' 
    where 'has_disclaimer' is True, or it failed to be answered.
    """
    # Assuming 'queries' is the collection name
    # We look for queries that couldn't be answered by GDB
    collection = db.get_collection("queries")
    
    # Query structure is an assumption; we can adjust based on exact DB introspect
    cursor = collection.find({
        "status": "disclaimer_triggered"
    }, {
        "_id": 1,
        "text": 1,
        "crop": 1,
        "state": 1,
        "domain": 1,
        "timestamp": 1
    })
    
    return list(cursor)

if __name__ == "__main__":
    # Test connection
    queries = get_disclaimer_triggered_queries()
    print(f"Fetched {len(queries)} disclaimer-triggered queries.")
