from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.database import Database
import logging
from app.config import settings

logger = logging.getLogger("ajrasakha.db")

client: MongoClient = None
db: Database = None

def get_db() -> Database:
    global client, db
    if db is None:
        client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
        db = client[settings.DATABASE_NAME]
    return db

def init_db():
    try:
        database = get_db()
        # Verify connection
        database.command("ping")
        logger.info(f"Connected to MongoDB database: {settings.DATABASE_NAME}")
        
        # Create indexes
        database["gdb_entries"].create_index([("crop", ASCENDING)])
        database["gdb_entries"].create_index([("domain", ASCENDING)])
        database["gdb_entries"].create_index([("status", ASCENDING)])
        database["gdb_entries"].create_index([("metrics.helpful_ratio", ASCENDING)])
        
        database["farmer_feedback"].create_index([("gdb_id", ASCENDING)])
        database["farmer_feedback"].create_index([("farmer_state", ASCENDING)])
        database["farmer_feedback"].create_index([("language", ASCENDING)])
        database["farmer_feedback"].create_index([("timestamp", DESCENDING)])
        
        database["farmer_sessions"].create_index([("phone_number", ASCENDING)], unique=True)
        database["farmer_sessions"].create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
        
        database["flagged_queue"].create_index([("gdb_id", ASCENDING)], unique=True)
        database["flagged_queue"].create_index([("review_status", ASCENDING)])
        
        logger.info("Database indexes initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing MongoDB: {e}")
        raise e

def close_db():
    global client
    if client is not None:
        client.close()
        logger.info("MongoDB connection closed.")
