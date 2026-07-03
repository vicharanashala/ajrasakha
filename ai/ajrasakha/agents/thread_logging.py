"""Per-thread log files: logs/{thread_id}.txt

Set context at graph node entry; a root logging handler routes records to the
matching file while that context is active.

Multi-turn: each new farmer message opens a beautified TURN block in the same file.
"""

from __future__ import annotations

import inspect
import logging
import os
import re
import threading
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from functools import wraps

# IST = UTC+5:30 (no DST — fixed offset is always correct)
_IST = timezone(timedelta(hours=5, minutes=30))
from pathlib import Path
from typing import Any, Callable, TypeVar

from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.config import resolve_thread_id
from ajrasakha.agents.thread_log_mongo import (
    mongo_thread_log_enabled,
    read_max_turn_number,
    read_thread_log_text,
    sync_completed_turns_to_mongo,
)

F = TypeVar("F", bound=Callable[..., Any])

_thread_id_ctx: ContextVar[str | None] = ContextVar("thread_id", default=None)
_turn_num_ctx: ContextVar[int | None] = ContextVar("turn_num", default=None)
_turn_buffer_ctx: ContextVar[list[str] | None] = ContextVar("turn_buffer", default=None)
_turn_meta_ctx: ContextVar[dict[str, Any] | None] = ContextVar("turn_meta", default=None)

_handler_installed = False
_handler_lock = threading.Lock()
_turn_counts: dict[str, int] = {}
_turn_counts_lock = threading.Lock()
# Cross-node turn state (ContextVars do not survive LangGraph node boundaries).
_active_turns: dict[str, dict[str, Any]] = {}

_UNSAFE_FILENAME = re.compile(r"[^\w.\-]+", re.UNICODE)
_END_TURN_RE = re.compile(r"END TURN (\d+)", re.MULTILINE)
_FARMER_MESSAGE_RE = re.compile(
    r"┏━ FARMER MESSAGE ━+\n(.*?)\n┗━",
    re.DOTALL,
)
_BOT_MESSAGE_RE = re.compile(
    r"┏━ BOT MESSAGE ━+\n(.*?)\n┗━",
    re.DOTALL,
)
_OUTCOME_RE = re.compile(r"── bot reply \(turn \d+\) \| outcome=(\w+)")
_STARTED_AT_RE = re.compile(r"#  started: (.+)")
_BOX_WIDTH = 76

# Thread log files: application logs only (skip httpx / MCP transport noise).
_THREAD_LOG_LOGGER_PREFIX = "ajrasakha"


class ThreadLogFilter(logging.Filter):
    """Keep only ajrasakha application loggers in per-thread files."""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.name.startswith(_THREAD_LOG_LOGGER_PREFIX)


def thread_log_dir() -> Path:
    raw = os.getenv("THREAD_LOG_DIR", "/tmp/logs").strip() or "/tmp/logs"
    return Path(raw)

def sanitize_thread_id_for_filename(thread_id: str) -> str:
    cleaned = _UNSAFE_FILENAME.sub("_", (thread_id or "").strip())
    return cleaned or "unknown_thread"


def set_thread_log_context(thread_id: str | None) -> None:
    _thread_id_ctx.set(thread_id)


def clear_thread_log_context() -> None:
    _thread_id_ctx.set(None)


def current_thread_log_id() -> str | None:
    return _thread_id_ctx.get()


def current_turn_num() -> int | None:
    return _turn_num_ctx.get()


def _wrap_box_lines(text: str, *, prefix: str = "┃ ") -> str:
    content = (text or "").strip() or "(empty)"
    out: list[str] = []
    for raw_line in content.splitlines():
        line = raw_line
        while len(line) > _BOX_WIDTH:
            out.append(f"{prefix}{line[:_BOX_WIDTH]}")
            line = line[_BOX_WIDTH:]
        out.append(f"{prefix}{line}")
    return "\n".join(out)


def _thread_log_path(thread_id: str) -> Path:
    safe = sanitize_thread_id_for_filename(thread_id)
    return thread_log_dir() / f"{safe}.txt"


def _read_local_thread_log_text(thread_id: str) -> str:
    """Read accumulated log text from the local file only (never blocks on MongoDB)."""
    path = _thread_log_path(thread_id)
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _read_thread_log_text(thread_id: str) -> str:
    """Read log text: local file first, then MongoDB (for offline/admin reads only)."""
    text = _read_local_thread_log_text(thread_id)
    if text:
        return text
    if mongo_thread_log_enabled():
        return read_thread_log_text(thread_id)
    return ""


def _max_turn_from_log(thread_id: str) -> int:
    """Read highest completed turn from local file, then Mongo (for multi-replica / restart)."""
    text = _read_local_thread_log_text(thread_id)
    local_max = 0
    if text:
        turns = [int(m) for m in _END_TURN_RE.findall(text)]
        local_max = max(turns) if turns else 0

    mongo_max = 0
    if mongo_thread_log_enabled():
        try:
            mongo_max = read_max_turn_number(thread_id)
        except Exception:
            pass

    return max(local_max, mongo_max)


def _get_active_turn(thread_id: str | None) -> dict[str, Any] | None:
    if not thread_id:
        return None
    return _active_turns.get(thread_id)


def _extract_turn_text_from_file(thread_id: str, turn: int) -> str:
    """Extract one turn block from the local log file (authoritative for Mongo log_text)."""
    text = _read_local_thread_log_text(thread_id)
    if not text or turn <= 0:
        return ""

    start_marker = f"#  TURN {turn} "
    start_idx = text.find(start_marker)
    if start_idx == -1:
        return ""

    end_marker = f"  END TURN {turn}\n"
    end_idx = text.find(end_marker, start_idx)
    if end_idx == -1:
        return text[start_idx:]

    # Include the closing ====== line after END TURN N.
    line_end = text.find("\n", end_idx + len(end_marker))
    if line_end == -1:
        return text[start_idx:]
    return text[start_idx : line_end + 1]


def _extract_user_message_from_log(log_text: str) -> str:
    match = _FARMER_MESSAGE_RE.search(log_text)
    if not match:
        return ""
    raw = match.group(1)
    lines = [
        line[2:] if line.startswith("┃ ") else line.lstrip("┃")
        for line in raw.splitlines()
    ]
    return "\n".join(lines).strip()


def _extract_bot_message_from_log(log_text: str) -> str:
    match = _BOT_MESSAGE_RE.search(log_text)
    if not match:
        return ""
    raw = match.group(1)
    lines = [
        line[2:] if line.startswith("┃ ") else line.lstrip("┃")
        for line in raw.splitlines()
    ]
    return "\n".join(lines).strip()


def _completed_turn_numbers_in_file(thread_id: str) -> list[int]:
    text = _read_local_thread_log_text(thread_id)
    if not text:
        return []
    return sorted({int(m) for m in _END_TURN_RE.findall(text)})


def _turn_record_from_log_text(turn: int, log_text: str) -> dict[str, Any]:
    outcome_match = _OUTCOME_RE.search(log_text)
    started_match = _STARTED_AT_RE.search(log_text)
    ended_at = ""
    for line in log_text.splitlines():
        if "── bot reply" in line and "IST" in line:
            parts = line.rsplit("IST", 1)
            if parts:
                ended_at = parts[0].strip().split("─")[-1].strip() + " IST"
            break
    return {
        "turn": turn,
        "user_message": _extract_user_message_from_log(log_text),
        "bot_message": _extract_bot_message_from_log(log_text),
        "outcome": outcome_match.group(1) if outcome_match else "unknown",
        "started_at": started_match.group(1).strip() if started_match else "",
        "ended_at": ended_at,
        "log_text": log_text,
    }


def build_turn_records_from_local_file(thread_id: str) -> list[dict[str, Any]]:
    """Build structured turn records for every completed turn in the local log file."""
    records: list[dict[str, Any]] = []
    for turn in _completed_turn_numbers_in_file(thread_id):
        log_text = _extract_turn_text_from_file(thread_id, turn)
        if log_text.strip():
            records.append(_turn_record_from_log_text(turn, log_text))
    return records


def _append_to_turn_buffer(text: str, *, thread_id: str | None = None) -> None:
    """Append text to the in-memory turn buffer for the active turn."""
    tid = thread_id or _thread_id_ctx.get()
    active = _get_active_turn(tid)
    if active is None:
        return
    block = text if text.endswith("\n") else f"{text}\n"
    active["buffer"].append(block)


def _append_to_file(thread_id: str, text: str) -> None:
    """Append text to the local thread log file only (fast path during request)."""
    block = text if text.endswith("\n") else f"{text}\n"
    path = _thread_log_path(thread_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with _turn_counts_lock:
        with path.open("a", encoding="utf-8") as fh:
            fh.write(block)
    _append_to_turn_buffer(block, thread_id=thread_id)


def append_thread_block(text: str, *, thread_id: str | None = None) -> None:
    """Append a raw multi-line block directly to the thread log (no log prefix)."""
    tid = thread_id or _thread_id_ctx.get()
    if not tid:
        return
    _append_to_file(tid, text)


def begin_conversation_turn(farmer_message: str) -> int:
    """Start a new turn block for the latest farmer message (same thread file)."""
    thread_id = _thread_id_ctx.get()
    if not thread_id:
        return 0

    # Local file only — never call MongoDB here (sync I/O would block the async graph).
    prior_from_log = _max_turn_from_log(thread_id)
    with _turn_counts_lock:
        prior = max(_turn_counts.get(thread_id, 0), prior_from_log)
        turn = prior + 1
        _turn_counts[thread_id] = turn

    _turn_num_ctx.set(turn)
    ts = datetime.now(_IST).strftime("%Y-%m-%d %H:%M:%S IST")
    with _turn_counts_lock:
        _active_turns[thread_id] = {
            "turn": turn,
            "user_message": farmer_message,
            "started_at": ts,
            "buffer": [],
        }
    _turn_buffer_ctx.set([])
    _turn_meta_ctx.set(
        {
            "turn": turn,
            "user_message": farmer_message,
            "started_at": ts,
        }
    )
    farmer_box = _wrap_box_lines(farmer_message)

    block = f"""
{'#' * 80}
#  TURN {turn}  |  thread={thread_id}
#  started: {ts}
{'#' * 80}

┏━ FARMER MESSAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{farmer_box}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── pipeline trace (turn {turn}) ───────────────────────────────────────────────────
"""
    append_thread_block(block, thread_id=thread_id)
    return turn


def end_conversation_turn(
    bot_message: str,
    *,
    outcome: str = "answer",
    thread_id: str | None = None,
) -> None:
    """Close the current turn block with the bot reply."""
    tid = thread_id or _thread_id_ctx.get()
    if not tid:
        return

    turn = _turn_num_ctx.get() or _turn_counts.get(tid, 0)
    ts = datetime.now(_IST).strftime("%Y-%m-%d %H:%M:%S IST")
    bot_box = _wrap_box_lines(bot_message)

    block = f"""
── bot reply (turn {turn}) | outcome={outcome} | {ts} ───────────────────────────

┏━ BOT MESSAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{bot_box}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{'=' * 80}
  END TURN {turn}
{'=' * 80}

"""
    append_thread_block(block, thread_id=tid)

    with _turn_counts_lock:
        active = _active_turns.pop(tid, {})

    log_text = _extract_turn_text_from_file(tid, turn)
    if not log_text.strip():
        log_text = "".join(active.get("buffer") or [])

    user_message = (active.get("user_message") or "").strip()
    if not user_message:
        user_message = _extract_user_message_from_log(log_text)

    turn_record = {
        "turn": turn,
        "user_message": user_message,
        "bot_message": bot_message,
        "outcome": outcome,
        "started_at": active.get("started_at") or "",
        "ended_at": ts,
        "log_text": log_text,
    }
    _turn_buffer_ctx.set(None)
    _turn_meta_ctx.set(None)
    _turn_num_ctx.set(None)

    if mongo_thread_log_enabled():
        full_logs = _read_local_thread_log_text(tid) or None
        records = build_turn_records_from_local_file(tid)
        if not records:
            records = [turn_record]
        else:
            updated = False
            for idx, record in enumerate(records):
                if record.get("turn") == turn:
                    records[idx] = turn_record
                    updated = True
                    break
            if not updated:
                records.append(turn_record)
        sync_completed_turns_to_mongo(tid, records, full_logs=full_logs)


def _resolve_config_thread_id(config: RunnableConfig | dict[str, Any] | None) -> str | None:
    if config is None:
        return None
    return resolve_thread_id(config if isinstance(config, dict) else dict(config))


class ThreadFileLogHandler(logging.Handler):
    """Routes log records to logs/{thread_id}.txt based on contextvar."""

    def __init__(self, log_dir: Path | None = None) -> None:
        super().__init__()
        self.log_dir = log_dir or thread_log_dir()
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._file_handlers: dict[str, logging.FileHandler] = {}
        self._fh_lock = threading.Lock()

    def _get_file_handler(self, thread_id: str) -> logging.FileHandler:
        safe = sanitize_thread_id_for_filename(thread_id)
        with self._fh_lock:
            fh = self._file_handlers.get(safe)
            if fh is None:
                path = self.log_dir / f"{safe}.txt"
                fh = logging.FileHandler(path, encoding="utf-8")
                fh.setFormatter(
                    logging.Formatter(
                        "%(asctime)s [%(levelname)s] %(name)s "
                        "(%(filename)s:%(lineno)d): %(message)s"
                    )
                )
                self._file_handlers[safe] = fh
            return fh

    def emit(self, record: logging.LogRecord) -> None:
        thread_id = _thread_id_ctx.get()
        if not thread_id:
            return
        try:
            fh = self._get_file_handler(thread_id)
            if not self.formatter:
                msg = record.getMessage()
            else:
                msg = self.format(record)
            if _turn_num_ctx.get() is not None and record.name.startswith(
                _THREAD_LOG_LOGGER_PREFIX
            ):
                msg = "\n".join(f"  │ {line}" for line in msg.splitlines())
            line = msg + fh.terminator
            fh.stream.write(line)
            fh.flush()
            _append_to_turn_buffer(line, thread_id=thread_id)
        except Exception:
            self.handleError(record)


_file_handler_registry: ThreadFileLogHandler | None = None


def setup_thread_file_logging(*, log_dir: Path | None = None) -> ThreadFileLogHandler | None:
    """Install per-thread file handler on root logger (once)."""
    global _handler_installed, _file_handler_registry
    enabled = os.getenv("THREAD_FILE_LOGGING", "true").lower() in ("true", "1", "yes")
    if not enabled:
        return None

    with _handler_lock:
        if _handler_installed:
            return _file_handler_registry

        handler = ThreadFileLogHandler(log_dir)
        handler.addFilter(ThreadLogFilter())
        handler.setLevel(logging.DEBUG)
        root = logging.getLogger()
        root.addHandler(handler)
        _handler_installed = True
        _file_handler_registry = handler
        logging.getLogger(__name__).info(
            "Thread file logging enabled: %s/{{thread_id}}.txt",
            handler.log_dir,
        )
        return handler


def with_thread_logging(node_fn: F) -> F:
    """Wrap a LangGraph node so logs during the run go to logs/{thread_id}.txt."""

    if inspect.iscoroutinefunction(node_fn):

        @wraps(node_fn)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            config = kwargs.get("config")
            if config is None and len(args) > 1:
                config = args[1]
            thread_id = _resolve_config_thread_id(config)
            set_thread_log_context(thread_id)
            try:
                return await node_fn(*args, **kwargs)
            finally:
                clear_thread_log_context()

        return async_wrapper  # type: ignore[return-value]

    @wraps(node_fn)
    def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
        config = kwargs.get("config")
        if config is None and len(args) > 1:
            config = args[1]
        thread_id = _resolve_config_thread_id(config)
        set_thread_log_context(thread_id)
        try:
            return node_fn(*args, **kwargs)
        finally:
            clear_thread_log_context()

    return sync_wrapper  # type: ignore[return-value]
