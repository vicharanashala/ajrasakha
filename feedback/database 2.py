import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

# Original cluster - READ ONLY
ORIGINAL_DB_URL = os.getenv("ORIGINAL_DB_URL")
ORIGINAL_DB_NAME = os.getenv("ORIGINAL_DB_NAME", "agriai")  

# Your own cluster - READ + WRITE
OWN_DB_URL = os.getenv("OWN_DB_URL")
OWN_DB_NAME = os.getenv("OWN_DB_NAME", "feedback")  

# Clients
original_client = AsyncIOMotorClient(ORIGINAL_DB_URL)
own_client = AsyncIOMotorClient(OWN_DB_URL)

# Databases
original_db = original_client[ORIGINAL_DB_NAME]
own_db = own_client[OWN_DB_NAME]

# Collections we READ from original cluster
questions_collection = original_db["questions"]
answers_collection = original_db["answers"]
users_collection = original_db["users"]

# Collections we WRITE to our own cluster
feedback_collection = own_db["feedback"]
