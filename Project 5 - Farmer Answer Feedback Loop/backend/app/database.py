from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase = None

db_instance = Database()


async def connect_db():
    """Create database connection on app startup."""
    logger.info(f"Connecting to MongoDB: {settings.mongodb_uri}")
    db_instance.client = AsyncIOMotorClient(settings.mongodb_uri)
    db_instance.db = db_instance.client[settings.mongodb_db_name]
    # Verify connection
    await db_instance.client.admin.command("ping")
    logger.info(f"Connected to MongoDB database: {settings.mongodb_db_name}")

    # Create indexes
    await _create_indexes()


async def disconnect_db():
    """Close database connection on app shutdown."""
    if db_instance.client:
        db_instance.client.close()
        logger.info("Disconnected from MongoDB")


async def _create_indexes():
    """Create required indexes for performance."""
    db = db_instance.db

    # feedback collection indexes
    await db.feedback.create_index("gdb_entry_id")
    await db.feedback.create_index("farmer_id")
    await db.feedback.create_index("timestamp")
    await db.feedback.create_index([("gdb_entry_id", 1), ("timestamp", -1)])

    # gdb_entries collection indexes
    await db.gdb_entries.create_index("domain")
    await db.gdb_entries.create_index("language")
    await db.gdb_entries.create_index("state")
    await db.gdb_entries.create_index("helpfulness_score")
    await db.gdb_entries.create_index("is_flagged")

    # flagged_entries indexes
    await db.flagged_entries.create_index("gdb_entry_id")
    await db.flagged_entries.create_index("status")
    await db.flagged_entries.create_index("helpfulness_score")

    # whatsapp_sessions indexes
    await db.whatsapp_sessions.create_index("farmer_phone", unique=True)
    await db.whatsapp_sessions.create_index("expires_at", expireAfterSeconds=0)

    logger.info("Database indexes created")


def get_db() -> AsyncIOMotorDatabase:
    """Dependency injection: returns the database instance."""
    return db_instance.db
