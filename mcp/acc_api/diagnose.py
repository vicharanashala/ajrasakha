from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()
client = MongoClient(os.getenv("MONGO_URI"))
db = client["agriai"]
col = db["questions"]

print("Total docs:", col.count_documents({}))

doc = col.find_one({}, {"embedding": 1, "_id": 0})
if doc:
    emb = doc.get("embedding")
    if emb:
        print("Embedding type:", type(emb))
        print("Embedding length:", len(emb))
    else:
        print("No 'embedding' field found in sample doc")
else:
    print("No documents found")

try:
    indexes = list(col.list_search_indexes())
    if indexes:
        for idx in indexes:
            print("Search index:", idx.get("name"), "| status:", idx.get("status"))
    else:
        print("No Atlas Search indexes found on this collection")
except Exception as e:
    print("Error listing search indexes:", e)
