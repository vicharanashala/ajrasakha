"""MongoDB sink for per-thread conversation logs.

During a request, logs are written only to the local file (THREAD_LOG_DIR).
When a turn completes, the turn record is pushed to ``turns[]`` on the thread
document (one document per thread_id, no top-level ``text`` field).
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pymongo.collection import Collection

logger = logging.getLogger(__name__)

_client = None
_collection: Collection | None = None
_init_lock = threading.Lock()
_init_logged = False

_MONGO_OP_TIMEOUT_MS = 5_000


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("true", "1", "yes")


def mongo_thread_log_enabled() -> bool:
    uri = os.getenv("GOLDEN_MONGODB_URI", "").strip()
    if not uri:
        return False
    explicit = os.getenv("THREAD_LOG_MONGODB")
    if explicit is not None:
        return _env_flag("THREAD_LOG_MONGODB")
    return True


def _collection_name() -> str:
    return os.getenv("THREAD_LOG_MONGODB_COLLECTION", "langgraph_log").strip() or "langgraph_log"


def _database_name() -> str:
    return os.getenv("GOLDEN_MONGODB_DATABASE", "agriai").strip() or "agriai"


def _get_collection() -> Collection | None:
    global _client, _collection, _init_logged
    if not mongo_thread_log_enabled():
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
        except Exception:
            logger.exception("Failed to initialize thread log MongoDB client")
            return None

        if not _init_logged:
            _init_logged = True
            logger.info(
                "Thread log MongoDB enabled: %s.%s (end-of-turn turns[] sync)",
                _database_name(),
                _collection_name(),
            )
    return _collection


def _sync_turn_to_mongo(thread_id: str, turn_record: dict[str, Any]) -> None:
    """Push one turn to turns[] on the thread document."""
    col = _get_collection()
    if col is None:
        return

    now = datetime.now(timezone.utc)
    try:
        col.update_one(
            {"_id": thread_id},
            {
                "$push": {"turns": turn_record},
                "$set": {"updated_at": now},
                "$unset": {"text": ""},
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
    except Exception:
        logger.exception("Failed to sync turn log to MongoDB for %s", thread_id)


def sync_turn_to_mongo(
    thread_id: str,
    turn_record: dict[str, Any],
    *,
    background: bool = True,
) -> None:
    """Push a completed turn to MongoDB turns[] on the thread document.

    When ``background`` is True (default), runs in a daemon thread so the graph
    response is never blocked on MongoDB.
    """
    if not thread_id or not mongo_thread_log_enabled():
        return

    if background:
        threading.Thread(
            target=_sync_turn_to_mongo,
            args=(thread_id, turn_record),
            name=f"thread-log-mongo-turn-{thread_id[:8]}",
            daemon=True,
        ).start()
    else:
        _sync_turn_to_mongo(thread_id, turn_record)


def read_thread_turns(thread_id: str) -> list[dict[str, Any]]:
    """Read structured turn records for a thread. Returns [] on miss or error."""
    if not thread_id:
        return []

    col = _get_collection()
    if col is None:
        return []

    try:
        doc = col.find_one(
            {"_id": thread_id},
            {"turns": 1},
            max_time_ms=_MONGO_OP_TIMEOUT_MS,
        )
        if not doc:
            return []
        turns = doc.get("turns")
        return turns if isinstance(turns, list) else []
    except Exception:
        logger.exception("Failed to read thread turns from MongoDB for %s", thread_id)
        return []


def read_thread_log_text(thread_id: str) -> str:
    """Read accumulated log text for a thread (concatenated turns[].log_text)."""
    if not thread_id:
        return ""

    col = _get_collection()
    if col is None:
        return ""

    try:
        doc = col.find_one(
            {"_id": thread_id},
            {"turns": 1, "text": 1},
            max_time_ms=_MONGO_OP_TIMEOUT_MS,
        )
        if not doc:
            return ""

        turns = doc.get("turns")
        if isinstance(turns, list) and turns:
            parts = [
                t.get("log_text", "")
                for t in turns
                if isinstance(t, dict) and isinstance(t.get("log_text"), str)
            ]
            return "".join(p for p in parts if p)

        # Legacy documents that only have top-level text.
        text = doc.get("text")
        return text if isinstance(text, str) else ""
    except Exception:
        logger.exception("Failed to read thread log from MongoDB for %s", thread_id)
        return ""


def _read_file_text(file_path: Path) -> str:
    if not file_path.is_file():
        return ""
    try:
        return file_path.read_text(encoding="utf-8")
    except OSError:
        logger.exception("Failed to read thread log file for Mongo sync: %s", file_path)
        return ""


def _sync_file_to_mongo(thread_id: str, file_path: Path) -> None:
    """Legacy: replace MongoDB log document with full local file as top-level text."""
    col = _get_collection()
    if col is None:
        return
    text = _read_file_text(file_path)
    if not text:
        return

    now = datetime.now(timezone.utc)
    try:
        col.update_one(
            {"_id": thread_id},
            {
                "$set": {"text": text, "updated_at": now},
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
    except Exception:
        logger.exception("Failed to sync thread log file to MongoDB for %s", thread_id)


def sync_thread_log_file_to_mongo(
    thread_id: str,
    *,
    file_path: Path | str,
    background: bool = True,
) -> None:
    """Legacy full-file sync (prefer sync_turn_to_mongo per turn)."""
    if not thread_id or not mongo_thread_log_enabled():
        return

    path = Path(file_path)
    if background:
        threading.Thread(
            target=_sync_file_to_mongo,
            args=(thread_id, path),
            name=f"thread-log-mongo-sync-{thread_id[:8]}",
            daemon=True,
        ).start()
    else:
        _sync_file_to_mongo(thread_id, path)
