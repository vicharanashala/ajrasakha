"""MongoDB persistence for per-user district/state location."""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pymongo.collection import Collection

logger = logging.getLogger(__name__)

_client = None
_collection: Collection | None = None
_init_lock = threading.Lock()
_init_logged = False
_index_ensured = False

_MONGO_OP_TIMEOUT_MS = 5_000
_HISTORY_CAP = 20


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("true", "1", "yes")


def user_location_mongo_enabled() -> bool:
    uri = os.getenv("GOLDEN_MONGODB_URI", "").strip()
    if not uri:
        return False
    explicit = os.getenv("USER_DETAILS_MONGODB")
    if explicit is not None:
        return _env_flag("USER_DETAILS_MONGODB")
    return True


def _collection_name() -> str:
    return (
        os.getenv("USER_DETAILS_MONGODB_COLLECTION", "user_details").strip()
        or "user_details"
    )


def _database_name() -> str:
    return os.getenv("GOLDEN_MONGODB_DATABASE", "agriai").strip() or "agriai"


def _ensure_index(col: Collection) -> None:
    global _index_ensured
    if _index_ensured:
        return
    try:
        col.create_index("user_id", unique=True)
        _index_ensured = True
    except Exception:
        logger.exception("Failed to ensure user_details index on user_id")


def _get_collection() -> Collection | None:
    global _client, _collection, _init_logged
    if not user_location_mongo_enabled():
        return None

    with _init_lock:
        if _collection is not None:
            return _collection

        from pymongo import MongoClient

        uri = os.getenv("GOLDEN_MONGODB_URI", "").strip()
        if not uri:
            return None

        try:
            _client = MongoClient(
                uri,
                serverSelectionTimeoutMS=5_000,
                connectTimeoutMS=5_000,
                socketTimeoutMS=_MONGO_OP_TIMEOUT_MS,
            )
            _collection = _client[_database_name()][_collection_name()]
            _ensure_index(_collection)
        except Exception:
            logger.exception("Failed to initialize user location MongoDB client")
            return None

        if not _init_logged:
            _init_logged = True
            logger.info(
                "User location MongoDB enabled: %s.%s",
                _database_name(),
                _collection_name(),
            )
    return _collection


def _normalize_user_id(user_id: str) -> str | None:
    user_id = (user_id or "").strip()
    return user_id or None


def _locations_equal(
    a: dict[str, Any] | None,
    b: dict[str, Any] | None,
) -> bool:
    if not a or not b:
        return False
    return (
        str(a.get("state", "")).strip().lower()
        == str(b.get("state", "")).strip().lower()
        and str(a.get("district", "")).strip().lower()
        == str(b.get("district", "")).strip().lower()
    )


def get_user_location(user_id: str | None) -> dict[str, str] | None:
    """Return ``{district, state}`` from ``current_location`` or None."""
    normalized_id = _normalize_user_id(user_id or "")
    if not normalized_id:
        return None

    col = _get_collection()
    if col is None:
        return None

    try:
        doc = col.find_one(
            {"user_id": normalized_id},
            {"current_location": 1},
            max_time_ms=_MONGO_OP_TIMEOUT_MS,
        )
    except Exception:
        logger.exception("Failed to read user location for user_id=%s", normalized_id)
        return None

    if not doc:
        return None

    current = doc.get("current_location") or {}
    district = str(current.get("district") or "").strip()
    state = str(current.get("state") or "").strip()
    if not district or not state:
        return None
    return {"district": district, "state": state}


def get_farmer_profile_location(user_id: str | None) -> dict[str, str] | None:
    """Read state/district from ``users.farmerProfile`` when ``user_details`` is empty."""
    normalized_id = _normalize_user_id(user_id or "")
    if not normalized_id:
        return None

    col = _get_collection()
    if col is None:
        return None

    from bson import ObjectId
    from bson.errors import InvalidId

    try:
        parsed_id: ObjectId | str = ObjectId(normalized_id)
    except (InvalidId, TypeError):
        parsed_id = normalized_id

    try:
        users_col = col.database["users"]
        doc = users_col.find_one(
            {"_id": parsed_id},
            projection={"farmerProfile.state": 1, "farmerProfile.district": 1},
            max_time_ms=_MONGO_OP_TIMEOUT_MS,
        )
    except Exception:
        logger.exception("Failed to read farmerProfile location for user_id=%s", normalized_id)
        return None

    if not doc:
        return None

    profile = doc.get("farmerProfile") or {}
    district = str(profile.get("district") or "").strip()
    state = str(profile.get("state") or "").strip()
    if not state:
        return None
    if not district:
        district = "all"
    return {"district": district, "state": state}


def save_user_location(user_id: str, district: str, state: str) -> bool:
    """Upsert current location; move prior current_location to history when changed."""
    normalized_id = _normalize_user_id(user_id)
    if not normalized_id:
        return False

    district = district.strip()
    state = state.strip()
    if not district or not state:
        return False

    col = _get_collection()
    if col is None:
        return False

    now = datetime.now(timezone.utc)
    new_current = {"district": district, "state": state}

    try:
        existing = col.find_one(
            {"user_id": normalized_id},
            {"current_location": 1, "location_history": 1},
            max_time_ms=_MONGO_OP_TIMEOUT_MS,
        )
    except Exception:
        logger.exception("Failed to read user location before save user_id=%s", normalized_id)
        return False

    update: dict[str, Any] = {
        "$set": {
            "current_location": new_current,
            "updated_at": now,
        },
    }
    set_on_insert: dict[str, Any] = {
        "user_id": normalized_id,
        "created_at": now,
    }

    old_current = (existing or {}).get("current_location")
    if existing and old_current and not _locations_equal(old_current, new_current):
        history_entry = {
            "district": str(old_current.get("district", "")).strip(),
            "state": str(old_current.get("state", "")).strip(),
            "timestamp": now.isoformat().replace("+00:00", "Z"),
        }
        if history_entry["district"] and history_entry["state"]:
            update["$push"] = {
                "location_history": {
                    "$each": [history_entry],
                    "$slice": -_HISTORY_CAP,
                }
            }
    else:
        # MongoDB rejects $push and $setOnInsert on the same path in one update.
        set_on_insert["location_history"] = []

    update["$setOnInsert"] = set_on_insert

    if existing and _locations_equal(old_current, new_current):
        return False

    try:
        col.update_one({"user_id": normalized_id}, update, upsert=True)
    except Exception:
        logger.exception("Failed to save user location for user_id=%s", normalized_id)
        return False

    logger.info(
        "Saved user location user_id=%s district=%s state=%s",
        normalized_id,
        district,
        state,
    )
    return True


def save_last_rephrased_query(user_id: str, rephrased_query: str) -> bool:
    """Save the last rephrased query for the user."""
    normalized_id = _normalize_user_id(user_id)
    if not normalized_id:
        return False

    query = (rephrased_query or "").strip()
    if not query:
        return False

    col = _get_collection()
    if col is None:
        return False

    now = datetime.now(timezone.utc)

    try:
        col.update_one(
            {"user_id": normalized_id},
            {
                "$set": {
                    "last_rephrased_query": query,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "user_id": normalized_id,
                    "created_at": now,
                },
            },
            upsert=True,
        )
    except Exception:
        logger.exception("Failed to save last rephrased query for user_id=%s", normalized_id)
        return False

    logger.info(
        "Saved last rephrased query for user_id=%s: %s",
        normalized_id,
        query[:100] + "..." if len(query) > 100 else query,
    )
    return True
