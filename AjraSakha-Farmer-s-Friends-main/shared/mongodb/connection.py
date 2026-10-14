from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.database import Database
import os
from typing import Optional

class MongoDBConnection:
    _instance: Optional['MongoDBConnection'] = None
    _client: Optional[MongoClient] = None
    _db: Optional[Database] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def connect(self, uri: str, db_name: str = "hackathon"):
        if self._client is None:
            self._client = MongoClient(uri, tlsAllowInvalidCertificates=True)
            self._db = self._client[db_name]
            self._create_indexes()
        return self._db

    def _create_indexes(self):
        self.feedback.create_index([("gdb_entry_id", ASCENDING)])
        self.feedback.create_index([("farmer_id", ASCENDING)])
        self.feedback.create_index([("timestamp", DESCENDING)])
        self.feedback.create_index([("domain", ASCENDING)])
        self.feedback.create_index([("language", ASCENDING)])
        self.feedback.create_index([("state", ASCENDING)])
        self.feedback.create_index([("is_helpful", ASCENDING)])

        self.flagged_entries.create_index([("gdb_entry_id", ASCENDING)], unique=True)
        self.flagged_entries.create_index([("priority_score", DESCENDING)])
        self.flagged_entries.create_index([("flagged_at", DESCENDING)])

        self.weekly_digest.create_index([("week_start", DESCENDING)])
        self.weekly_digest.create_index([("week_end", DESCENDING)])

        self.message_tracking.create_index([("message_id", ASCENDING)], unique=True)
        self.message_tracking.create_index([("gdb_entry_id", ASCENDING)])
        self.message_tracking.create_index([("farmer_id", ASCENDING)])
        self.message_tracking.create_index([("created_at", DESCENDING)])

    @property
    def feedback(self):
        return self._db["feedback"]

    @property
    def flagged_entries(self):
        return self._db["flagged_entries"]

    @property
    def weekly_digest(self):
        return self._db["weekly_digest"]

    @property
    def message_tracking(self):
        return self._db["message_tracking"]

    @property
    def gdb_entries(self):
        return self._db["gdb_entries"]

    def close(self):
        if self._client:
            self._client.close()
            self._client = None
            self._db = None

def get_db():
    uri = os.getenv(
        "MONGODB_URI",
        "mongodb+srv://your_user:your_password@cluster.mongodb.net/?appName=your_app"
    )
    conn = MongoDBConnection()
    return conn.connect(uri, "farmer_feedback")


db = get_db()