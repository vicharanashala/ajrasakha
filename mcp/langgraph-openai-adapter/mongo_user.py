"""Load user farmer profile location from LibreChat MongoDB."""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from config import (
    LOCATION_CACHE_TTL_SEC,
    MONGO_URI,
    MONGO_USERS_COLLECTION,
    resolve_mongo_db_name,
)

logger = logging.getLogger("langgraph-openai-adapter")

_cache: dict[str, tuple[float, dict[str, str] | None]] = {}


@lru_cache(maxsize=1)
def _users_collection() -> Collection | None:
    if not MONGO_URI:
        logger.warning("MONGO_URI is not set; user location headers will be omitted")
        return None

    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db_name = resolve_mongo_db_name()
    db: Database = client[db_name]
    logger.info("MongoDB user lookup enabled (db=%s, collection=%s)", db_name, MONGO_USERS_COLLECTION)
    return db[MONGO_USERS_COLLECTION]


def _parse_user_id(user_id: str) -> ObjectId | str | None:
    user_id = user_id.strip()
    if not user_id:
        return None
    try:
        return ObjectId(user_id)
    except (InvalidId, TypeError):
        return user_id


def _location_from_doc(doc: dict | None) -> dict[str, str] | None:
    if not doc:
        return None

    profile = doc.get("farmerProfile") or {}
    location = profile.get("location") or {}
    latitude = location.get("latitude")
    longitude = location.get("longitude")

    headers: dict[str, str] = {}
    if latitude is not None and longitude is not None:
        headers["X-Latitude"] = str(latitude)
        headers["X-Longitude"] = str(longitude)

    state = profile.get("state")
    district = profile.get("district")
    if state:
        headers["X-State"] = str(state)
    if district:
        headers["X-District"] = str(district)

    return headers or None


def get_user_context_headers(user_id: str | None) -> dict[str, str]:
    """Return upstream headers derived from the user's MongoDB farmer profile."""
    if not user_id:
        return {}

    now = time.monotonic()
    cached = _cache.get(user_id)
    if cached and now - cached[0] < LOCATION_CACHE_TTL_SEC:
        return cached[1] or {}

    collection = _users_collection()
    if collection is None:
        return {}

    parsed_id = _parse_user_id(user_id)
    if parsed_id is None:
        return {}

    try:
        doc = collection.find_one(
            {"_id": parsed_id},
            projection={
                "farmerProfile.location": 1,
                "farmerProfile.state": 1,
                "farmerProfile.district": 1,
            },
        )
    except Exception:
        logger.exception("MongoDB lookup failed for user_id=%s", user_id)
        _cache[user_id] = (now, None)
        return {}

    headers = _location_from_doc(doc) or {}
    _cache[user_id] = (now, headers)
    return headers


def update_user_location_if_changed(
    user_id: str,
    latitude: float,
    longitude: float,
    *,
    tolerance: float = 1e-5,
) -> bool:
    """Persist farmerProfile.location when live GPS differs from the stored profile."""
    collection = _users_collection()
    if collection is None:
        return False

    parsed_id = _parse_user_id(user_id)
    if parsed_id is None:
        return False

    try:
        doc = collection.find_one(
            {"_id": parsed_id},
            projection={"farmerProfile.location": 1},
        )
    except Exception:
        logger.exception("MongoDB read failed before location update user_id=%s", user_id)
        return False

    existing = ((doc or {}).get("farmerProfile") or {}).get("location") or {}
    try:
        ex_lat = float(existing["latitude"])
        ex_lon = float(existing["longitude"])
        if abs(ex_lat - latitude) <= tolerance and abs(ex_lon - longitude) <= tolerance:
            return False
    except (TypeError, ValueError, KeyError):
        pass

    try:
        collection.update_one(
            {"_id": parsed_id},
            {
                "$set": {
                    "farmerProfile.location": {
                        "latitude": latitude,
                        "longitude": longitude,
                    }
                }
            },
        )
    except Exception:
        logger.exception("MongoDB location update failed user_id=%s", user_id)
        return False

    _cache.pop(user_id, None)
    logger.info(
        "Updated farmerProfile.location for user_id=%s (lat=%s, lon=%s)",
        user_id,
        latitude,
        longitude,
    )
    return True
