"""Local cache of POP states and per-state crops, refreshed from MongoDB every 6 hours."""
from __future__ import annotations

import json
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pymongo

from logging_config import get_logger

from constants import (
    METADATA_CACHE_PATH,
    METADATA_REFRESH_SECONDS,
    MONGODB_URI,
    POP_MONGODB_COLLECTION,
    POP_MONGODB_DATABASE,
)

logger = get_logger("metadata_cache")

_lock = threading.Lock()
_cache: dict[str, Any] = {
    "last_updated": None,
    "states": [],
    "state_crops": {},
}

_mongo_client: pymongo.MongoClient | None = None
_refresh_thread: threading.Thread | None = None


def _normalize(text: str) -> str:
    text = (text or "").lower()
    text = text.replace("&", "and")
    text = text.replace("_", " ")
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _get_collection():
    global _mongo_client
    if _mongo_client is None:
        logger.info(
            "connecting mongo db=%s collection=%s",
            POP_MONGODB_DATABASE,
            POP_MONGODB_COLLECTION,
        )
        _mongo_client = pymongo.MongoClient(
            MONGODB_URI, tlsAllowInvalidCertificates=True
        )
    return _mongo_client[POP_MONGODB_DATABASE][POP_MONGODB_COLLECTION]


def _fetch_state_crops_from_db() -> tuple[list[str], dict[str, list[str]]]:
    logger.info("fetching states/crops from MongoDB aggregation")
    collection = _get_collection()
    pipeline = [
        {"$unwind": "$document.doc_usage"},
        {
            "$group": {
                "_id": "$document.doc_usage.state",
                "crops": {"$addToSet": "$document.doc_usage.crop"},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    state_crops: dict[str, list[str]] = {}
    for doc in collection.aggregate(pipeline):
        state = doc.get("_id")
        if not state:
            continue
        crops = sorted(c for c in doc.get("crops", []) if c)
        state_crops[str(state)] = crops
    states = sorted(state_crops.keys())
    logger.info(
        "aggregation done states=%d total_crop_entries=%d",
        len(states),
        sum(len(c) for c in state_crops.values()),
    )
    return states, state_crops


def refresh_metadata_cache() -> dict[str, Any]:
    states, state_crops = _fetch_state_crops_from_db()
    payload = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "states": states,
        "state_crops": state_crops,
    }
    cache_path = Path(METADATA_CACHE_PATH)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    with _lock:
        _cache.clear()
        _cache.update(payload)
    logger.info(
        "cache refreshed path=%s states=%d last_updated=%s",
        cache_path,
        len(states),
        payload["last_updated"],
    )
    return payload


def load_metadata_cache() -> dict[str, Any]:
    cache_path = Path(METADATA_CACHE_PATH)
    if cache_path.is_file():
        try:
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            with _lock:
                _cache.clear()
                _cache.update(payload)
            states = payload.get("states") or []
            logger.info(
                "cache loaded from file path=%s states=%d last_updated=%s",
                cache_path,
                len(states),
                payload.get("last_updated"),
            )
            if states:
                return payload
            logger.info("cache file has no states, refreshing from DB")
            return refresh_metadata_cache()
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("cache file read failed path=%s error=%s", cache_path, exc)
    logger.info("cache file missing or invalid, refreshing from DB")
    return refresh_metadata_cache()


def _cache_snapshot() -> dict[str, Any]:
    with _lock:
        return {
            "last_updated": _cache.get("last_updated"),
            "states": list(_cache.get("states") or []),
            "state_crops": dict(_cache.get("state_crops") or {}),
        }


def get_states() -> list[str]:
    return _cache_snapshot()["states"]


def get_crops_for_state(state: str) -> list[str]:
    snap = _cache_snapshot()
    matched = validate_state(state)
    if not matched:
        return []
    return list(snap["state_crops"].get(matched, []))


def validate_state(state: str) -> str | None:
    state_n = _normalize(state)
    if not state_n:
        logger.debug("validate_state: empty input")
        return None
    for s in get_states():
        norm_s = _normalize(s)
        if norm_s == state_n:
            logger.debug("validate_state: exact match input=%r -> %r", state, s)
            return s
    for s in get_states():
        norm_s = _normalize(s)
        if state_n in norm_s or norm_s in state_n:
            logger.debug("validate_state: partial match input=%r -> %r", state, s)
            return s
    logger.info("validate_state: no match for input=%r", state)
    return None


def validate_crop(crop: str, state: str) -> str | None:
    available = get_crops_for_state(state)
    crop_n = _normalize(crop)
    if not crop_n:
        logger.debug("validate_crop: empty input state=%r", state)
        return None
    for c in available:
        norm_c = _normalize(c)
        if norm_c == crop_n:
            logger.debug("validate_crop: exact match input=%r state=%r -> %r", crop, state, c)
            return c
        if crop_n in norm_c or norm_c in crop_n:
            logger.debug("validate_crop: partial match input=%r state=%r -> %r", crop, state, c)
            return c
    logger.info(
        "validate_crop: no match input=%r state=%r available_count=%d",
        crop,
        state,
        len(available),
    )
    return None


def get_metadata_export() -> dict[str, Any]:
    snap = _cache_snapshot()
    logger.debug(
        "metadata export states=%d last_updated=%s",
        len(snap.get("states") or []),
        snap.get("last_updated"),
    )
    return snap


def _refresh_loop() -> None:
    logger.info(
        "background refresh loop started interval_seconds=%d",
        METADATA_REFRESH_SECONDS,
    )
    while True:
        time.sleep(METADATA_REFRESH_SECONDS)
        try:
            refresh_metadata_cache()
        except Exception as exc:
            logger.exception("background metadata refresh failed: %s", exc)


def start_metadata_refresh_loop() -> None:
    global _refresh_thread
    load_metadata_cache()
    if _refresh_thread is None or not _refresh_thread.is_alive():
        _refresh_thread = threading.Thread(
            target=_refresh_loop, name="pop-metadata-refresh", daemon=True
        )
        _refresh_thread.start()
        logger.info("background refresh thread started")
