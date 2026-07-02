"""Tests for MongoDB thread log sink."""

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from ajrasakha.agents import thread_log_mongo as tlm


@pytest.fixture(autouse=True)
def _reset_mongo_singleton():
    tlm._client = None
    tlm._collection = None
    tlm._init_logged = False
    yield
    tlm._client = None
    tlm._collection = None
    tlm._init_logged = False


def test_mongo_thread_log_enabled_requires_uri(monkeypatch):
    monkeypatch.delenv("GOLDEN_MONGODB_URI", raising=False)
    assert tlm.mongo_thread_log_enabled() is False

    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    assert tlm.mongo_thread_log_enabled() is True

    monkeypatch.setenv("THREAD_LOG_MONGODB", "false")
    assert tlm.mongo_thread_log_enabled() is False


def test_sync_turn_to_mongo_pushes_turn_without_text(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    monkeypatch.setattr(tlm, "_collection", mock_col)

    turn_record = {
        "turn": 1,
        "user_message": "Hi",
        "bot_message": "Hello!",
        "outcome": "answer",
        "started_at": "2026-06-09 18:00:00 IST",
        "ended_at": "2026-06-09 18:00:01 IST",
        "log_text": "turn 1 trace\n",
    }

    tlm.sync_turn_to_mongo(
        "thread-abc",
        turn_record,
        background=False,
    )

    mock_col.update_one.assert_called_once()
    filter_doc, update_doc = mock_col.update_one.call_args[0]
    assert filter_doc == {"_id": "thread-abc"}
    assert update_doc["$push"]["turns"] == turn_record
    assert "text" not in update_doc.get("$set", {})
    assert update_doc["$unset"] == {"text": ""}
    assert "updated_at" in update_doc["$set"]
    assert mock_col.update_one.call_args[1]["upsert"] is True


def test_sync_missing_turns_only_pushes_absent(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    monkeypatch.setattr(tlm, "_collection", mock_col)
    monkeypatch.setattr(
        tlm,
        "read_thread_turns",
        lambda thread_id: [{"turn": 2, "user_message": "punjab"}],
    )

    records = [
        {"turn": 1, "user_message": "disease", "log_text": "turn1"},
        {"turn": 2, "user_message": "punjab", "log_text": "turn2"},
    ]
    tlm.sync_completed_turns_to_mongo(
        "thread-abc",
        records,
        full_logs="full file text",
        background=False,
    )

    mock_col.update_one.assert_called_once()
    _, update_doc = mock_col.update_one.call_args[0]
    assert update_doc["$push"]["turns"]["turn"] == 1
    assert update_doc["$set"]["full_logs"] == "full file text"


def test_sync_turn_to_mongo_swallows_errors(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.update_one.side_effect = RuntimeError("db down")
    monkeypatch.setattr(tlm, "_collection", mock_col)
    monkeypatch.setattr(tlm, "read_thread_turns", lambda thread_id: [])

    log_file = tmp_path / "thread-abc.txt"
    log_file.write_text("hello\n", encoding="utf-8")

    tlm.sync_turn_to_mongo(
        "thread-abc",
        {"turn": 1, "user_message": "Hi", "log_text": "trace"},
        background=False,
    )


def test_read_thread_turns(monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.find_one.return_value = {
        "turns": [
            {"turn": 1, "user_message": "Hi", "log_text": "trace 1"},
            {"turn": 2, "user_message": "Bye", "log_text": "trace 2"},
        ]
    }
    monkeypatch.setattr(tlm, "_collection", mock_col)

    turns = tlm.read_thread_turns("thread-abc")
    assert len(turns) == 2
    assert turns[0]["user_message"] == "Hi"
    mock_col.find_one.assert_called_once_with(
        {"_id": "thread-abc"},
        {"turns": 1},
        max_time_ms=tlm._MONGO_OP_TIMEOUT_MS,
    )


def test_read_thread_turns_missing(monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.find_one.return_value = None
    monkeypatch.setattr(tlm, "_collection", mock_col)

    assert tlm.read_thread_turns("thread-abc") == []


def test_sync_thread_log_file_replaces_document(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    monkeypatch.setattr(tlm, "_collection", mock_col)

    log_file = tmp_path / "thread-abc.txt"
    log_file.write_text("full turn log\n", encoding="utf-8")

    tlm.sync_thread_log_file_to_mongo(
        "thread-abc",
        file_path=log_file,
        background=False,
    )

    mock_col.update_one.assert_called_once()
    filter_doc, update_doc = mock_col.update_one.call_args[0]
    assert filter_doc == {"_id": "thread-abc"}
    assert update_doc["$set"]["text"] == "full turn log\n"
    assert mock_col.update_one.call_args[1]["upsert"] is True
    assert "max_time_ms" not in mock_col.update_one.call_args[1]


def test_sync_thread_log_file_swallows_errors(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.update_one.side_effect = RuntimeError("db down")
    monkeypatch.setattr(tlm, "_collection", mock_col)

    log_file = tmp_path / "thread-abc.txt"
    log_file.write_text("hello\n", encoding="utf-8")

    tlm.sync_thread_log_file_to_mongo(
        "thread-abc",
        file_path=log_file,
        background=False,
    )


def test_read_thread_log_text_from_turns(monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.find_one.return_value = {
        "turns": [
            {"turn": 1, "log_text": "trace 1\n"},
            {"turn": 2, "log_text": "trace 2\n"},
        ]
    }
    monkeypatch.setattr(tlm, "_collection", mock_col)

    assert tlm.read_thread_log_text("thread-abc") == "trace 1\ntrace 2\n"
    mock_col.find_one.assert_called_once_with(
        {"_id": "thread-abc"},
        {"turns": 1, "text": 1, "full_logs": 1},
        max_time_ms=tlm._MONGO_OP_TIMEOUT_MS,
    )


def test_read_max_turn_number(monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.find_one.return_value = {
        "turns": [
            {"turn": 1, "log_text": "a"},
            {"turn": 2, "log_text": "b"},
        ]
    }
    monkeypatch.setattr(tlm, "_collection", mock_col)

    assert tlm.read_max_turn_number("thread-abc") == 2


def test_read_thread_log_text(monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.find_one.return_value = {"text": "accumulated log"}
    monkeypatch.setattr(tlm, "_collection", mock_col)

    assert tlm.read_thread_log_text("thread-abc") == "accumulated log"


def test_read_thread_log_text_missing(monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.find_one.return_value = None
    monkeypatch.setattr(tlm, "_collection", mock_col)

    assert tlm.read_thread_log_text("thread-abc") == ""
