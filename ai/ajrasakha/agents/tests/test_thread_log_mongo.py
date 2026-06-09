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


def test_read_thread_log_text(monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.find_one.return_value = {"text": "accumulated log"}
    monkeypatch.setattr(tlm, "_collection", mock_col)

    assert tlm.read_thread_log_text("thread-abc") == "accumulated log"
    mock_col.find_one.assert_called_once_with(
        {"_id": "thread-abc"},
        {"text": 1},
        max_time_ms=tlm._MONGO_OP_TIMEOUT_MS,
    )


def test_read_thread_log_text_missing(monkeypatch):
    monkeypatch.setenv("GOLDEN_MONGODB_URI", "mongodb://localhost:27017")
    mock_col = MagicMock()
    mock_col.find_one.return_value = None
    monkeypatch.setattr(tlm, "_collection", mock_col)

    assert tlm.read_thread_log_text("thread-abc") == ""
