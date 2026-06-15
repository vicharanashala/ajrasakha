"""Tests for user_details MongoDB persistence."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from ajrasakha.agents import user_location_mongo as mongo


@pytest.fixture(autouse=True)
def reset_mongo_singleton():
    mongo._client = None
    mongo._collection = None
    mongo._init_logged = False
    mongo._index_ensured = False
    yield
    mongo._client = None
    mongo._collection = None
    mongo._init_logged = False
    mongo._index_ensured = False


def _mock_collection():
    col = MagicMock()
    store: dict[str, dict] = {}

    def find_one(query, projection=None, max_time_ms=None):
        return store.get(query.get("user_id"))

    def update_one(query, update, upsert=False):
        user_id = query["user_id"]
        doc = store.get(user_id, {"user_id": user_id, "location_history": []})
        if "$setOnInsert" in update:
            for key, value in update["$setOnInsert"].items():
                doc.setdefault(key, value)
        if "$set" in update:
            doc.update(update["$set"])
        if "$push" in update:
            push_spec = update["$push"]["location_history"]
            history = doc.setdefault("location_history", [])
            history.extend(push_spec["$each"])
            slice_val = push_spec["$slice"]
            doc["location_history"] = history[slice_val:] if slice_val < 0 else history[:slice_val]
        store[user_id] = doc
        result = MagicMock()
        result.matched_count = 1
        return result

    col.find_one.side_effect = find_one
    col.update_one.side_effect = update_one
    col._store = store
    return col


@patch.dict("os.environ", {"GOLDEN_MONGODB_URI": "mongodb://test", "GOLDEN_MONGODB_DATABASE": "agriai"})
@patch.object(mongo, "_get_collection")
def test_save_new_location_creates_doc(mock_get_collection):
    col = _mock_collection()
    mock_get_collection.return_value = col

    assert mongo.save_user_location("919876543210", "Sirsa", "Haryana") is True
    doc = col._store["919876543210"]
    assert doc["current_location"] == {"district": "Sirsa", "state": "Haryana"}
    assert doc["location_history"] == []


@patch.dict("os.environ", {"GOLDEN_MONGODB_URI": "mongodb://test", "GOLDEN_MONGODB_DATABASE": "agriai"})
@patch.object(mongo, "_get_collection")
def test_update_moves_old_location_to_history(mock_get_collection):
    col = _mock_collection()
    mock_get_collection.return_value = col

    mongo.save_user_location("919876543210", "Sirsa", "Haryana")
    assert mongo.save_user_location("919876543210", "Ambala", "Haryana") is True

    doc = col._store["919876543210"]
    assert doc["current_location"] == {"district": "Ambala", "state": "Haryana"}
    assert len(doc["location_history"]) == 1
    assert doc["location_history"][0]["district"] == "Sirsa"
    assert doc["location_history"][0]["state"] == "Haryana"
    assert doc["location_history"][0]["timestamp"].endswith("Z")


@patch.dict("os.environ", {"GOLDEN_MONGODB_URI": "mongodb://test", "GOLDEN_MONGODB_DATABASE": "agriai"})
@patch.object(mongo, "_get_collection")
def test_same_location_does_not_duplicate_history(mock_get_collection):
    col = _mock_collection()
    mock_get_collection.return_value = col

    mongo.save_user_location("919876543210", "Sirsa", "Haryana")
    assert mongo.save_user_location("919876543210", "Sirsa", "Haryana") is False
    doc = col._store["919876543210"]
    assert doc["location_history"] == []


@patch.dict("os.environ", {"GOLDEN_MONGODB_URI": "mongodb://test", "GOLDEN_MONGODB_DATABASE": "agriai"})
@patch.object(mongo, "_get_collection")
def test_update_does_not_setoninsert_location_history_when_pushing(mock_get_collection):
    col = _mock_collection()
    mock_get_collection.return_value = col

    mongo.save_user_location("919876543210", "Sirsa", "Haryana")
    col.update_one.reset_mock()
    mongo.save_user_location("919876543210", "Punjab", "Punjab")

    update_doc = col.update_one.call_args[0][1]
    assert "$push" in update_doc
    assert "location_history" not in update_doc.get("$setOnInsert", {})


@patch.dict("os.environ", {"GOLDEN_MONGODB_URI": "mongodb://test", "GOLDEN_MONGODB_DATABASE": "agriai"})
@patch.object(mongo, "_get_collection")
def test_history_cap_enforced(mock_get_collection):
    col = _mock_collection()
    mock_get_collection.return_value = col
    user_id = "919876543210"

    mongo.save_user_location(user_id, "Loc0", "Haryana")
    for idx in range(1, 25):
        mongo.save_user_location(user_id, f"Loc{idx}", "Haryana")

    doc = col._store[user_id]
    assert len(doc["location_history"]) == mongo._HISTORY_CAP


@patch.dict("os.environ", {"GOLDEN_MONGODB_URI": "mongodb://test", "GOLDEN_MONGODB_DATABASE": "agriai"})
@patch.object(mongo, "_get_collection")
def test_get_user_location_returns_current(mock_get_collection):
    col = _mock_collection()
    mock_get_collection.return_value = col
    mongo.save_user_location("919876543210", "Sirsa", "Haryana")

    assert mongo.get_user_location("919876543210") == {
        "district": "Sirsa",
        "state": "Haryana",
    }


@patch.dict("os.environ", {}, clear=True)
def test_get_user_location_without_mongo_returns_none():
    assert mongo.get_user_location("919876543210") is None
