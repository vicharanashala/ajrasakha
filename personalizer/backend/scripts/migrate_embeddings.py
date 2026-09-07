import os
from pymongo import MongoClient
from google import genai
import time
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

def migrate_embeddings():
    print("Connecting to MongoDB Atlas...")
    mongo_uri = os.getenv('MONGODB_URI')
    client_mongo = MongoClient(mongo_uri)
    db = client_mongo[os.getenv('DB_NAME', 'ajrasakha')]
    collection = db[os.getenv('POP_COLLECTION', 'pop_v2')]
    gemini_client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

    # Find docs that haven't been migrated yet
    documents = list(collection.find({"migrated_to_gemini": {"$ne": True}}))
    print(f"Found {len(documents)} documents to migrate.")

    if not documents:
        print("All documents already migrated!")
        return

    success_count = 0
    for doc in documents:
        text = doc.get("text")
        if not text:
            continue

        retries = 3
        while retries > 0:
            try:
                # Rate limit protection (Gemini free tier allows 100/min. To be safe, wait 0.6s)
                time.sleep(0.6)
                
                response = gemini_client.models.embed_content(
                    model='gemini-embedding-2', 
                    contents=text,
                    config={'output_dimensionality': 768}
                )
                new_embedding = response.embeddings[0].values
                
                collection.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"embedding": new_embedding, "migrated_to_gemini": True}}
                )
                success_count += 1
                if success_count % 10 == 0:
                    print(f"Migrated {success_count}/{len(documents)} documents...")
                break # Success, exit retry loop
            except Exception as e:
                if '429' in str(e) or 'RESOURCE_EXHAUSTED' in str(e):
                    print(f"Rate limited. Waiting 10 seconds... ({retries} retries left)")
                    time.sleep(10)
                    retries -= 1
                else:
                    print(f"Error processing doc {doc['_id']}: {e}")
                    break # Not a rate limit error, skip

    print(f"Successfully migrated {success_count} documents to Gemini embeddings!")

if __name__ == "__main__":
    migrate_embeddings()
