import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from gdb_gap_detector.core.config import settings

logger = logging.getLogger("gdb_gap_detector.core.db")


class MongoDB:
    """Async Motor MongoDB Client Manager."""

    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None

    @classmethod
    def connect(cls, uri: str | None = None, db_name: str | None = None) -> None:
        """Establish AsyncIOMotorClient connection."""
        mongo_uri = uri or settings.mongo_uri
        target_db = db_name or settings.feedback_db_name
        logger.info(f"Connecting to MongoDB at {mongo_uri} (Database: {target_db})")
        cls.client = AsyncIOMotorClient(mongo_uri)
        cls.db = cls.client[target_db]

    @classmethod
    def disconnect(cls) -> None:
        """Close AsyncIOMotorClient connection."""
        if cls.client:
            logger.info("Closing MongoDB connection pool.")
            cls.client.close()
            cls.client = None
            cls.db = None

    @classmethod
    def get_db(cls) -> AsyncIOMotorDatabase:
        """Retrieve current database instance."""
        if cls.db is None:
            cls.connect()
        assert cls.db is not None
        return cls.db


def get_database() -> AsyncIOMotorDatabase:
    """FastAPI Dependency for Motor Database instance."""
    return MongoDB.get_db()
