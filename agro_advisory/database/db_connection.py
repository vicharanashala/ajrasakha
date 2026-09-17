#!/usr/bin/env python3
"""MongoDB connection management and index initialization for Agromet DB."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database

# Load environment variables from .env file (workspace root or current dir)
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

import certifi

DEFAULT_MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DEFAULT_DB_NAME = os.getenv("MONGO_DB_NAME", "agromet_db")

_client: Optional[MongoClient] = None


def get_client(uri: Optional[str] = None) -> MongoClient:
    """Return a singleton MongoClient instance or create a new one."""
    global _client
    mongo_uri = uri or DEFAULT_MONGO_URI
    if _client is None:
        client_kwargs: dict = {
            "serverSelectionTimeoutMS": 5000,
            "connectTimeoutMS": 5000,
        }
        # Use certifi CA certificates for TLS/mongodb+srv connections
        if "mongodb+srv" in mongo_uri or "ssl=true" in mongo_uri.lower() or "tls=true" in mongo_uri.lower():
            client_kwargs["tlsCAFile"] = certifi.where()

        _client = MongoClient(mongo_uri, **client_kwargs)
    return _client


def get_db(uri: Optional[str] = None, db_name: Optional[str] = None) -> Database:
    """Return the specified Database instance and ensure indexes are created."""
    client = get_client(uri)
    target_db_name = db_name or DEFAULT_DB_NAME
    db = client[target_db_name]
    ensure_indexes(db)
    return db


def ensure_indexes(db: Database) -> None:
    """Create indexes for districts, weather, and bulletins collections.

    Indexes:
      - districts: { district: 1, state: 1 } (unique)
      - weather:
          * { district: 1, forecast_date: -1 }
          * { district: 1, bulletin_issue_date: -1 }
          * { state: 1, district: 1 }
      - bulletins:
          * { district: 1, issue_date: -1 }
          * { subject: 1, crop_stage: 1 }
          * { category: 1 }
          * { state: 1, district: 1 }
    """
    try:
        # 1. Collection: districts
        db.districts.create_index(
            [("district", ASCENDING), ("state", ASCENDING)],
            unique=True,
            name="idx_district_state_unique",
        )

        # 2. Collection: weather
        db.weather.create_index(
            [("district", ASCENDING), ("forecast_date", DESCENDING)],
            name="idx_district_forecast_date",
        )
        db.weather.create_index(
            [("district", ASCENDING), ("bulletin_issue_date", DESCENDING)],
            name="idx_district_issue_date",
        )
        db.weather.create_index(
            [("state", ASCENDING), ("district", ASCENDING)],
            name="idx_state_district",
        )

        # 3. Collection: bulletins
        db.bulletins.create_index(
            [("district", ASCENDING), ("issue_date", DESCENDING)],
            name="idx_district_issue_date",
        )
        db.bulletins.create_index(
            [("subject", ASCENDING), ("crop_stage", ASCENDING)],
            name="idx_subject_crop_stage",
        )
        db.bulletins.create_index(
            [("category", ASCENDING)],
            name="idx_category",
        )
        db.bulletins.create_index(
            [("state", ASCENDING), ("district", ASCENDING)],
            name="idx_state_district",
        )
    except Exception as exc:
        # If server is not reachable during import/setup, log and continue
        # Connection will be validated when performing actual operations
        pass


def check_connection(uri: Optional[str] = None) -> bool:
    """Test if MongoDB server is reachable."""
    try:
        client = get_client(uri)
        client.admin.command("ping")
        return True
    except Exception:
        return False


def close_connection() -> None:
    """Close active MongoClient connection."""
    global _client
    if _client is not None:
        _client.close()
        _client = None
