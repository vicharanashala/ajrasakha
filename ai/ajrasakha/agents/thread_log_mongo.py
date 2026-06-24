"""MongoDB sink for per-thread conversation logs.

During a request, logs are written only to the local file (THREAD_LOG_DIR).
When a turn completes, the turn record is pushed to ``turns[]`` on the thread
document (one document per thread_id, no top-level ``text`` field).

Writes are queued on a background thread pool (non-blocking for the graph) with
retries so fast clarify turns are not lost when the worker returns early.
"""

from __future__ import annotations

import atexit
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
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
_executor: ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()

_MONGO_OP_TIMEOUT_MS = 5_000
_MONGO_SYNC_RETRIES = 3
_MONGO_SYNC_RETRY_BASE_S = 0.2


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
                "Thread log MongoDB enabled: %s.%s (async turns[] sync with retries)",
                _database_name(),
                _collection_name(),
            )
    return _collection


def _get_executor() -> ThreadPoolExecutor:
    """Shared pool for background Mongo writes (non-daemon workers survive request return)."""
    global _executor
    with _executor_lock:
        if _executor is None:
            workers = max(1, int(os.getenv("THREAD_LOG_MONGO_WORKERS", "4")))
            _executor = ThreadPoolExecutor(
                max_workers=workers,
                thread_name_prefix="thread-log-mongo",
            )
            atexit.register(_shutdown_executor)
        return _executor


def _shutdown_executor() -> None:
    global _executor
    with _executor_lock:
        if _executor is not None:
            _executor.shutdown(wait=True, cancel_futures=False)
            _executor = None


def _sync_turn_to_mongo(
    thread_id: str,
    turn_record: dict[str, Any],
    *,
    full_logs: str | None = None,
) -> None:
    """Push one turn to turns[] on the thread document (with retries)."""
    col = _get_collection()
    if col is None:
        return

    now = datetime.now(timezone.utc)
    set_fields: dict[str, Any] = {"updated_at": now}
    if full_logs is not None:
        set_fields["full_logs"] = full_logs

    update_doc: dict[str, Any] = {
        "$push": {"turns": turn_record},
        "$set": set_fields,
        "$unset": {"text": ""},
        "$setOnInsert": {"created_at": now},
    }

    last_exc: Exception | None = None
    for attempt in range(_MONGO_SYNC_RETRIES):
        try:
            col.update_one(
                {"_id": thread_id},
                update_doc,
                upsert=True,
            )
            return
        except Exception as exc:
            last_exc = exc
            if attempt < _MONGO_SYNC_RETRIES - 1:
                time.sleep(_MONGO_SYNC_RETRY_BASE_S * (attempt + 1))

    logger.exception(
        "Failed to sync turn log to MongoDB for %s after %d attempts: %s",
        thread_id,
        _MONGO_SYNC_RETRIES,
        last_exc,
    )


def sync_turn_to_mongo(
    thread_id: str,
    turn_record: dict[str, Any],
    *,
    full_logs: str | None = None,
    background: bool = True,
) -> None:
    """Push a completed turn to MongoDB turns[] on the thread document.

    Prefer :func:`sync_completed_turns_to_mongo` when multiple turns may be missing.
    """
    sync_completed_turns_to_mongo(
        thread_id,
        [turn_record],
        full_logs=full_logs,
        background=background,
    )


def _sync_missing_turns_impl(
    thread_id: str,
    turn_records: list[dict[str, Any]],
    *,
    full_logs: str | None = None,
) -> None:
    """Push any turn records not yet present in Mongo (by turn number)."""
    if not turn_records:
        return

    existing_nums: set[int] = set()
    for item in read_thread_turns(thread_id):
        if isinstance(item, dict):
            turn = item.get("turn")
            if isinstance(turn, int) and turn > 0:
                existing_nums.add(turn)

    missing = sorted(
        (r for r in turn_records if isinstance(r.get("turn"), int) and r["turn"] not in existing_nums),
        key=lambda r: r["turn"],
    )
    if not missing:
        return

    for idx, record in enumerate(missing):
        is_last = idx == len(missing) - 1
        _sync_turn_to_mongo(
            thread_id,
            record,
            full_logs=full_logs if is_last else None,
        )

    logger.info(
        "Synced %d missing turn(s) to Mongo for thread %s (turns=%s)",
        len(missing),
        thread_id,
        [r["turn"] for r in missing],
    )


def sync_completed_turns_to_mongo(
    thread_id: str,
    turn_records: list[dict[str, Any]],
    *,
    full_logs: str | None = None,
    background: bool = True,
) -> None:
    """Push all completed turns that are not yet stored in Mongo (non-blocking by default)."""
    if not thread_id or not mongo_thread_log_enabled() or not turn_records:
        return

    sync_blocking = not background or _env_flag("THREAD_LOG_MONGO_SYNC")
    if sync_blocking:
        _sync_missing_turns_impl(thread_id, turn_records, full_logs=full_logs)
        return

    _get_executor().submit(
        _sync_missing_turns_impl,
        thread_id,
        turn_records,
        full_logs=full_logs,
    )


def read_max_turn_number(thread_id: str) -> int:
    """Highest completed turn number stored in Mongo for this thread."""
    turns = read_thread_turns(thread_id)
    nums: list[int] = []
    for item in turns:
        if not isinstance(item, dict):
            continue
        turn = item.get("turn")
        if isinstance(turn, int) and turn > 0:
            nums.append(turn)
    return max(nums) if nums else 0


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
    if background and not _env_flag("THREAD_LOG_MONGO_SYNC"):
        _get_executor().submit(_sync_file_to_mongo, thread_id, path)
    else:
        _sync_file_to_mongo(thread_id, path)
