"""Tests for per-thread file logging."""

import logging
from pathlib import Path
import pytest

from ajrasakha.agents import thread_logging as tl


@pytest.fixture(autouse=True)
def _disable_mongo_by_default(monkeypatch):
    monkeypatch.setattr(tl, "mongo_thread_log_enabled", lambda: False)


def test_sanitize_thread_id():
    assert tl.sanitize_thread_id_for_filename("919541703420-2026-06-03") == "919541703420-2026-06-03"
    assert tl.sanitize_thread_id_for_filename("a/b:c") == "a_b_c"


def test_conversation_turn_blocks(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(tl, "thread_log_dir", lambda: tmp_path)
    tl.set_thread_log_context("thread-multi")
    tl.begin_conversation_turn("What crop for Punjab?")
    tl.end_conversation_turn("Please tell me your crop.", outcome="clarify")
    tl.begin_conversation_turn("Paddy")
    tl.end_conversation_turn("Here is advice for paddy.", outcome="answer")
    tl.clear_thread_log_context()

    text = (tmp_path / "thread-multi.txt").read_text(encoding="utf-8")
    assert "TURN 1" in text
    assert "TURN 2" in text
    assert "FARMER MESSAGE" in text
    assert "BOT MESSAGE" in text
    assert "What crop for Punjab?" in text
    assert "Please tell me your crop." in text
    assert "Paddy" in text
    assert "END TURN 1" in text
    assert "END TURN 2" in text


def test_turn_counter_survives_process_restart(tmp_path: Path, monkeypatch):
    """After restart in-memory _turn_counts is empty; next turn reads from log file."""
    monkeypatch.setattr(tl, "thread_log_dir", lambda: tmp_path)
    tl._turn_counts.clear()

    tl.set_thread_log_context("thread-restart")
    tl.begin_conversation_turn("First question")
    tl.end_conversation_turn("First answer", outcome="answer")
    tl.clear_thread_log_context()

    tl._turn_counts.clear()
    tl.set_thread_log_context("thread-restart")
    tl.begin_conversation_turn("Second question")
    tl.end_conversation_turn("Second answer", outcome="answer")
    tl.clear_thread_log_context()

    text = (tmp_path / "thread-restart.txt").read_text(encoding="utf-8")
    assert "TURN 1" in text
    assert "TURN 2" in text
    assert "END TURN 2" in text
    assert text.count("#  TURN 1 ") == 1
    assert text.count("#  TURN 2 ") == 1


def test_thread_file_handler_routes_by_context(tmp_path: Path):
    handler = tl.ThreadFileLogHandler(tmp_path)
    handler.addFilter(tl.ThreadLogFilter())
    logger = logging.getLogger("ajrasakha.agents.tests.thread_logging")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    tl.set_thread_log_context("thread-abc")
    logger.info("hello from thread abc")
    tl.clear_thread_log_context()

    tl.set_thread_log_context("thread-xyz")
    logger.info("hello from thread xyz")
    tl.clear_thread_log_context()

    # Noisy third-party loggers should not appear in thread files.
    tl.set_thread_log_context("thread-abc")
    logging.getLogger("httpx").info("HTTP Request: POST http://example/mcp")
    logging.getLogger("mcp.client.streamable_http").info("Received session ID: abc")
    tl.clear_thread_log_context()

    logger.removeHandler(handler)

    abc_text = (tmp_path / "thread-abc.txt").read_text(encoding="utf-8")
    assert abc_text.count("hello from thread abc") == 1
    assert "HTTP Request" not in abc_text
    assert "Received session ID" not in abc_text
    assert (tmp_path / "thread-xyz.txt").read_text(encoding="utf-8").count("hello from thread xyz") == 1


def test_end_conversation_turn_syncs_turn_to_mongo(tmp_path: Path, monkeypatch):
    sync_calls: list[tuple[str, dict]] = []

    def _capture_sync(thread_id: str, turn_record: dict, *, background=True):
        sync_calls.append((thread_id, turn_record))

    monkeypatch.setattr(tl, "thread_log_dir", lambda: tmp_path)
    monkeypatch.setattr(tl, "mongo_thread_log_enabled", lambda: True)
    monkeypatch.setattr(tl, "sync_turn_to_mongo", _capture_sync)

    tl.set_thread_log_context("thread-mongo")
    tl.begin_conversation_turn("Hi")
    tl.end_conversation_turn("Hello!", outcome="answer")
    tl.clear_thread_log_context()

    assert len(sync_calls) == 1
    thread_id, turn_record = sync_calls[0]
    assert thread_id == "thread-mongo"
    assert turn_record["turn"] == 1
    assert turn_record["user_message"] == "Hi"
    assert turn_record["bot_message"] == "Hello!"
    assert turn_record["outcome"] == "answer"
    assert "FARMER MESSAGE" in turn_record["log_text"]
    assert "BOT MESSAGE" in turn_record["log_text"]
    assert "END TURN 1" in turn_record["log_text"]
    assert (tmp_path / "thread-mongo.txt").is_file()


def test_turn_state_survives_node_context_reset(tmp_path: Path, monkeypatch):
    """Simulate LangGraph: planner sets turn, later node clears ContextVar but ends turn."""
    sync_calls: list[dict] = []

    def _capture_sync(thread_id: str, turn_record: dict, *, background=True):
        sync_calls.append(turn_record)

    monkeypatch.setattr(tl, "thread_log_dir", lambda: tmp_path)
    monkeypatch.setattr(tl, "mongo_thread_log_enabled", lambda: True)
    monkeypatch.setattr(tl, "sync_turn_to_mongo", _capture_sync)

    tl.set_thread_log_context("thread-nodes")
    tl.begin_conversation_turn("hii")
    tl.clear_thread_log_context()

    tl.set_thread_log_context("thread-nodes")
    tl.end_conversation_turn("Hi there!", outcome="answer")
    tl.clear_thread_log_context()

    assert len(sync_calls) == 1
    assert sync_calls[0]["user_message"] == "hii"
    assert "hii" in sync_calls[0]["log_text"]
    assert "Hi there!" in sync_calls[0]["log_text"]
    assert "END TURN 1" in sync_calls[0]["log_text"]


def test_turn_buffer_captures_handler_logs(tmp_path: Path, monkeypatch):
    sync_calls: list[dict] = []

    def _capture_sync(thread_id: str, turn_record: dict, *, background=True):
        sync_calls.append(turn_record)

    monkeypatch.setattr(tl, "thread_log_dir", lambda: tmp_path)
    monkeypatch.setattr(tl, "mongo_thread_log_enabled", lambda: True)
    monkeypatch.setattr(tl, "sync_turn_to_mongo", _capture_sync)

    handler = tl.ThreadFileLogHandler(tmp_path)
    handler.addFilter(tl.ThreadLogFilter())
    logger = logging.getLogger("ajrasakha.agents.tests.turn_buffer")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    tl.set_thread_log_context("thread-buffer")
    tl.begin_conversation_turn("Weather?")
    logger.info("planner resolved state=Punjab")
    tl.end_conversation_turn("It will rain.", outcome="answer")
    tl.clear_thread_log_context()
    logger.removeHandler(handler)

    assert len(sync_calls) == 1
    assert "planner resolved state=Punjab" in sync_calls[0]["log_text"]
    assert "Weather?" in sync_calls[0]["log_text"]


def test_handler_emit_writes_file_only_not_mongo_per_line(tmp_path: Path, monkeypatch):
    sync_calls: list[str] = []

    def _capture_sync(thread_id: str, *, file_path, background=True):
        sync_calls.append(thread_id)

    monkeypatch.setattr(tl, "mongo_thread_log_enabled", lambda: True)
    monkeypatch.setattr(tl, "sync_turn_to_mongo", _capture_sync)

    handler = tl.ThreadFileLogHandler(tmp_path)
    handler.addFilter(tl.ThreadLogFilter())
    logger = logging.getLogger("ajrasakha.agents.tests.thread_logging_mongo")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    tl.set_thread_log_context("thread-handler-mongo")
    logger.info("file only line")
    tl.clear_thread_log_context()
    logger.removeHandler(handler)

    file_text = (tmp_path / "thread-handler-mongo.txt").read_text(encoding="utf-8")
    assert "file only line" in file_text
    assert sync_calls == []


def test_max_turn_from_log_uses_local_file_only(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(tl, "thread_log_dir", lambda: tmp_path)
    monkeypatch.setattr(tl, "mongo_thread_log_enabled", lambda: True)
    monkeypatch.setattr(
        tl,
        "read_thread_log_text",
        lambda thread_id: "\n  END TURN 99\n",
    )

    # No local file → do not block on Mongo for turn numbering.
    assert tl._max_turn_from_log("thread-mongo-only") == 0

    log_file = tmp_path / "thread-local.txt"
    log_file.write_text("\n  END TURN 3\n", encoding="utf-8")
    assert tl._max_turn_from_log("thread-local") == 3
