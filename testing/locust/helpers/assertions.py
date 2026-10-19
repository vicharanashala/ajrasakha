"""
assertions.py — Locust event-listener for the reviewer-system load test.
"""
from __future__ import annotations

import csv
import json
import threading
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from locust import events

_lock = threading.Lock()
_results_dir: Optional[Path] = None
_request_csv = None
_request_csv_writer = None
_assertions_csv_writer = None
_assertions_file = None
_reputation_snapshots: Dict[str, Dict[str, Any]] = {}
# Per-event history of every reputation snapshot we observe, keyed by
# user_id. Used by `reconcile_reputation.py` to detect in-memory races
# (any monotonicity violation = a missed update).
_reputation_snapshot_history: List[Tuple[float, str, float, str]] = []
_assertion_counts: Dict[str, int] = defaultdict(int)
_failed_request_count: Dict[str, int] = defaultdict(int)
_total_request_count: Dict[str, int] = defaultdict(int)
_queue_lengths: List[Tuple[float, str, int]] = []
_cosine_p95_samples: List[float] = []


def init(results_dir: str) -> None:
    """Open per-run output files. Call once from an init hook."""
    global _results_dir, _request_csv, _request_csv_writer
    global _assertions_csv_writer, _assertions_file

    _results_dir = Path(results_dir)
    _results_dir.mkdir(parents=True, exist_ok=True)

    requests_path = _results_dir / "requests.csv"
    _request_csv = open(requests_path, "w", newline="", encoding="utf-8")
    _request_csv_writer = csv.writer(_request_csv)
    _request_csv_writer.writerow([
        "timestamp", "endpoint", "method", "name", "status_code",
        "response_time_ms", "response_length", "failure", "assertion", "context",
    ])
    _request_csv.flush()

    _assertions_file = open(
        _results_dir / "assertions.csv", "w", newline="", encoding="utf-8"
    )
    _assertions_csv_writer = csv.writer(_assertions_file)
    _assertions_csv_writer.writerow(["assertion_key", "count"])
    _assertions_file.flush()


def flush_all() -> None:
    """Flush buffered CSV rows under the global lock.

    Holding `_lock` here prevents the `_on_quitting` flush from racing
    with an in-flight request handler still writing through
    `record_request`.
    """
    with _lock:
        if _request_csv is not None:
            _request_csv.flush()
        if _assertions_file is not None:
            _assertions_file.flush()


def close() -> None:
    """Close output CSV handles under the global lock.

    If a Locust user thread is mid-`record_request` when the runner
    fires the `quitting` event, this lock keeps the writer from being
    closed while the writerow() call is still buffered/flushed.
    """
    global _request_csv, _assertions_csv_writer, _assertions_file
    with _lock:
        if _request_csv is not None:
            _request_csv.flush()
            _request_csv.close()
        if _assertions_file is not None:
            _assertions_file.flush()
            _assertions_file.close()
        _request_csv = None
        _assertions_csv_writer = None
        _assertions_file = None


def write_assertion(key: str, count: int = 1) -> None:
    with _lock:
        _assertion_counts[key] += count
        if _assertions_csv_writer is not None:
            _assertions_csv_writer.writerow([key, count])
            _assertions_file.flush()

def record_reputation_snapshot(user_id: str, snapshot: Dict[str, Any]) -> None:
    with _lock:
        _reputation_snapshots[user_id] = snapshot
        # Also append to history so `reconcile_reputation.py` can later
        # detect monotonicity violations (= an in-memory race where a
        # concurrent update was lost).
        try:
            score = float(snapshot.get("reputation_score") or 0)
        except (TypeError, ValueError):
            return
        _reputation_snapshot_history.append((
            float(snapshot.get("at") or 0.0),
            user_id,
            score,
            str(snapshot.get("context") or ""),
        ))


def get_reputation_snapshots() -> Dict[str, Dict[str, Any]]:
    with _lock:
        return dict(_reputation_snapshots)


def get_reputation_snapshot_history() -> List[Tuple[float, str, float, str]]:
    with _lock:
        return list(_reputation_snapshot_history)


def write_reputation_snapshot_csv() -> Path:
    if _results_dir is None:
        return Path("reputation_snapshots.csv")
    out = _results_dir / "reputation_snapshots.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["user_id", "captured_at", "snapshot_json"])
        for uid, snap in _reputation_snapshots.items():
            w.writerow([uid, time.time(), json.dumps(snap, default=str)])
    return out


def write_reputation_snapshot_history_csv() -> Optional[Path]:
    """Write every observed reputation snapshot to `reputation_snapshot_history.csv`.

    Used by `reconcile_reputation.py` to detect in-memory races: any user
    whose reputation went DOWN between two consecutive history entries
    has lost an increment (no decrement endpoint exists in the mock).
    """
    if _results_dir is None:
        return None
    out = _results_dir / "reputation_snapshot_history.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["at", "user_id", "reputation_score", "context"])
        # Stable order: by (user_id, at) so monotonicity checks are local.
        rows = sorted(_reputation_snapshot_history, key=lambda r: (r[1], r[0]))
        for r in rows:
            w.writerow([f"{r[0]:.6f}", r[1], f"{r[2]:.6f}", r[3]])
    return out


def record_queue_length(endpoint: str, length: int) -> None:
    with _lock:
        _queue_lengths.append((time.time(), endpoint, length))


def get_queue_lengths() -> List[Tuple[float, str, int]]:
    with _lock:
        return list(_queue_lengths)


def write_queue_length_csv() -> Optional[Path]:
    if _results_dir is None:
        return None
    out = _results_dir / "queue_lengths.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "endpoint", "queue_length"])
        for ts, ep, ln in _queue_lengths:
            w.writerow([ts, ep, ln])
    return out


def record_cosine_sample(response_time_ms: float) -> None:
    with _lock:
        _cosine_p95_samples.append(response_time_ms)


def get_cosine_samples() -> List[float]:
    with _lock:
        return list(_cosine_p95_samples)

def record_request(
    *,
    endpoint: str,
    method: str,
    name: str,
    status_code: int,
    response_time_ms: float,
    response_length: int,
    failure: Optional[str],
    assertion: str,
    context: Dict[str, Any],
) -> None:
    """Append a single request to `requests.csv` and update counters."""
    with _lock:
        _total_request_count[name] += 1
        if failure:
            _failed_request_count[name] += 1
            if 500 <= status_code <= 599:
                _assertion_counts["HTTP_5XX"] += 1
                if _assertions_csv_writer is not None:
                    _assertions_csv_writer.writerow(["HTTP_5XX", 1])
                    _assertions_file.flush()
        if _request_csv_writer is not None:
            try:
                _request_csv_writer.writerow([
                    time.time(),
                    endpoint,
                    method,
                    name,
                    status_code,
                    f"{response_time_ms:.1f}",
                    response_length,
                    failure or "",
                    assertion,
                    json.dumps(context, default=str)[:512],
                ])
                _request_csv.flush()
            except ValueError:
                # Under gevent, a record_request coroutine that already
                # entered the `with _lock:` block can be yielded out at
                # the I/O call; meanwhile close() (in _on_quitting) can
                # close the underlying file. When the writer resumes it
                # would otherwise raise "I/O operation on closed file."
                # Swallow that case — the data is already flushed/closed
                # by the quit path and the run is ending.
                pass


def get_failure_ratio() -> Dict[str, float]:
    """Return `{name: failed/total}` for every seen request name."""
    out: Dict[str, float] = {}
    with _lock:
        for name, total in _total_request_count.items():
            failed = _failed_request_count.get(name, 0)
            out[name] = (failed / total) if total else 0.0
    return out


def get_assertion_counts() -> Dict[str, int]:
    with _lock:
        return dict(_assertion_counts)

@events.request.add_listener
def _on_request(
    request_type: str,
    name: str,
    response_time: float,
    response_length: int,
    response: Optional[Any],
    context: Dict[str, Any],
    exception: Optional[BaseException],
    start_time: float,
    url: str,
    **kwargs: Any,
) -> None:
    """Locust 2.x request hook. Buckets 5xx, decodes JSON for captures."""
    status_code = 0
    body_text: str = ""
    body_json: Optional[Dict[str, Any]] = None
    if response is not None:
        status_code = getattr(response, "status_code", 0)
        try:
            body_text = response.text or ""
        except Exception:
            body_text = ""
        if body_text and body_text.lstrip().startswith(("{", "[")):
            try:
                parsed = json.loads(body_text)
                if isinstance(parsed, dict):
                    body_json = parsed
            except Exception:
                body_json = None

    failure_msg: Optional[str] = None
    if exception is not None:
        failure_msg = repr(exception)
    elif status_code >= 500:
        failure_msg = f"HTTP {status_code}"

    assertion = "PASS"
    if status_code == 401:
        assertion = "IGNORE_AUTH"
    elif status_code >= 500:
        assertion = "FAIL_5XX"

    if body_json is not None:
        # Some endpoints (e.g. /api/answers) nest the data envelope under a
        # `data` key; resolve either the top-level shape or the nested one
        # so snapshots are captured for both contract variants.
        rep_score = (
            body_json.get("reputation_score")
            if "reputation_score" in body_json
            else (body_json.get("data") or {}).get("reputation_score")
            if isinstance(body_json.get("data"), dict)
            else None
        )
        if rep_score is not None:
            data_block = body_json.get("data") if isinstance(body_json.get("data"), dict) else body_json
            uid = (
                data_block.get("userId")
                or data_block.get("user_id")
                or data_block.get("_id")
                or body_json.get("userId")
                or body_json.get("user_id")
                or body_json.get("_id")
                or context.get("user_id")
            )
            if uid:
                record_reputation_snapshot(
                    str(uid),
                    {
                        "reputation_score": rep_score,
                        "context": name,
                        "at": time.time(),
                    },
                )

    if (
        body_json is not None
        and isinstance(body_json.get("data"), list)
        and "queue-details" in url
    ):
        record_queue_length(url, len(body_json["data"]))
    if (
        body_json is not None
        and isinstance(body_json.get("data"), dict)
        and "received" in body_json["data"]
        and isinstance(body_json["data"]["received"], dict)
        and "count" in body_json["data"]["received"]
    ):
        record_queue_length(url, body_json["data"]["received"]["count"])

    if "check-duplicate" in url and status_code < 500:
        record_cosine_sample(response_time)

    record_request(
        endpoint=url,
        method=request_type,
        name=name,
        status_code=status_code,
        response_time_ms=response_time,
        response_length=response_length,
        failure=failure_msg,
        assertion=assertion,
        context=context or {},
    )


@events.quitting.add_listener
def _on_quitting(environment: Any, **kwargs: Any) -> None:  # pragma: no cover
    flush_all()
    write_reputation_snapshot_csv()
    write_reputation_snapshot_history_csv()
    write_queue_length_csv()
    close()
