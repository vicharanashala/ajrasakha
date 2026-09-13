import asyncio
from dotenv import load_dotenv
import os
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

ORIGINAL_DB_URL = os.getenv("ORIGINAL_DB_URL")
ORIGINAL_DB_NAME = os.getenv("ORIGINAL_DB_NAME")
OWN_DB_URL = os.getenv("OWN_DB_URL")
OWN_DB_NAME = os.getenv("OWN_DB_NAME")

async def test():
    # Test original cluster
    original_client = AsyncIOMotorClient(ORIGINAL_DB_URL)
    original_db = original_client[ORIGINAL_DB_NAME]
    count = await original_db["questions"].count_documents({})
    print(f"✅ Original DB ({ORIGINAL_DB_NAME}) connected — {count} questions found")

    # Test own cluster
    own_client = AsyncIOMotorClient(OWN_DB_URL)
    own_db = own_client[OWN_DB_NAME]
    result = await own_db["feedback"].insert_one({"test": True})
    await own_db["feedback"].delete_one({"_id": result.inserted_id})
    print(f"✅ Own DB ({OWN_DB_NAME}) connected — write test passed")

asyncio.run(test())
