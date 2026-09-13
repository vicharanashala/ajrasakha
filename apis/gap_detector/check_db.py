import os
from pymongo import MongoClient

MONGO_URI = os.getenv('MONGO_URL', "mongodb+srv://lpulga167_db_user:UUXFvuymiWUfMeT3@hackathon.ibfnza4.mongodb.net/?appName=hackathon")
print("Connecting...")
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client.get_database('hackathon')

collections = db.list_collection_names()
print(f"Collections found: {collections}")

errors = []
for coll_name in collections:
    print(f"\n--- Checking collection: {coll_name} ---")
    coll = db.get_collection(coll_name)
    count = coll.count_documents({})
    print(f"Total documents: {count}")
    
    # Just fetch a small sample to verify it's readable
    sample = list(coll.find({}).limit(5))
    if sample:
        print(f"Sample document keys: {list(sample[0].keys())}")
    else:
        print("Collection is empty.")
    
    # Find any obvious errors (e.g. docs without _id)
    bad_docs = list(coll.find({"_id": {"$exists": False}}).limit(1))
    if bad_docs:
        errors.append(f"Found documents without _id in {coll_name}")

if 'questions' in collections:
    # Our specific gap detector checks
    queries = list(db.questions.find({}))
    for idx, q in enumerate(queries):
        missing_fields = []
        for field in ['question', 'details', 'createdAt']:
            if field not in q:
                missing_fields.append(field)
        if missing_fields:
            errors.append(f"Question {q.get('_id', idx)} is missing fields: {missing_fields}")

