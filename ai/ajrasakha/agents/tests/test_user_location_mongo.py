"""Tests for user_details MongoDB persistence."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from ajrasakha.agents import user_location_mongo as mongo


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
        return MagicMock(matched_count=1)

    col.find_one.side_effect = find_one
    col.update_one.side_effect = update_one
    col._store = store
    return col


@patch.dict("os.environ", {"GOLDEN_MONGODB_URI": "mongodb://test", "GOLDEN_MONGODB_DATABASE": "agriai"})
@patch.object(mongo, "_get_collection")
def test_save_includes_thread_id_metadata(mock_get_collection):
    col = _mock_collection()
    mock_get_collection.return_value = col

    assert mongo.save_user_location(
        "919876543210",
        "all",
        "Punjab",
        thread_id="080ebed7-bd96-4a89-9a49-57a4b05d360f",
        state_source="rephrased_query_text",
        district_source="default_all_when_state_only",
    ) is True

    doc = col._store["919876543210"]
    assert doc["current_location"] == {"district": "all", "state": "Punjab"}
    source = doc["current_location_source"]
    assert source["thread_id"] == "080ebed7-bd96-4a89-9a49-57a4b05d360f"
    assert source["state_source"] == "rephrased_query_text"
    assert source["district_source"] == "default_all_when_state_only"
    assert source["picked_at"].endswith("Z")


@patch.dict("os.environ", {"GOLDEN_MONGODB_URI": "mongodb://test", "GOLDEN_MONGODB_DATABASE": "agriai"})
@patch.object(mongo, "_get_collection")
def test_same_location_refreshes_source_metadata(mock_get_collection):
    col = _mock_collection()
    mock_get_collection.return_value = col

    mongo.save_user_location(
        "919876543210",
        "all",
        "Punjab",
        thread_id="thread-a",
        state_source="rephrased_query_text",
        district_source="default_all_when_state_only",
    )
    assert mongo.save_user_location(
        "919876543210",
        "all",
        "Punjab",
        thread_id="thread-b",
        state_source="rephrased_query_text",
        district_source="default_all_when_state_only",
    ) is True

    doc = col._store["919876543210"]
    assert doc["current_location_source"]["thread_id"] == "thread-b"
    assert doc["location_history"] == []


@patch.dict("os.environ", {"GOLDEN_MONGODB_URI": "mongodb://test", "GOLDEN_MONGODB_DATABASE": "agriai"})
@patch.object(mongo, "_get_collection")
def test_location_change_preserves_old_source_in_history(mock_get_collection):
    col = _mock_collection()
    mock_get_collection.return_value = col

    mongo.save_user_location(
        "919876543210",
        "Sirsa",
        "Haryana",
        thread_id="thread-a",
        state_source="rephrased_query_text",
        district_source="plan.entities.district (llm)",
    )
    mongo.save_user_location(
        "919876543210",
        "Ambala",
        "Haryana",
        thread_id="thread-b",
        state_source="rephrased_query_text",
        district_source="plan.entities.district (llm)",
    )

    doc = col._store["919876543210"]
    assert doc["current_location"] == {"district": "Ambala", "state": "Haryana"}
    assert len(doc["location_history"]) == 1
    assert doc["location_history"][0]["source"]["thread_id"] == "thread-a"
