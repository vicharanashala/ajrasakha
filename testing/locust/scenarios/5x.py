"""
scenarios/5x.py — 5× burst.

Target
------
* 5× user counts vs 1×. Total = 60 simulated users (Locust 2.32 uses
  per-class weights to distribute the run).
* Spawn rate = 5/sec (all classes ramp in parallel).
* 30-min budget (we want throughput under sustained load, not soak).

Use
---
Specifically pinned to SLA S2 ("allocator must complete in ≤ 800 ms at 5×"),
this scenario must be run with `--profile heavy_allocate` so the bulk-PAE
path is exercised hard enough to reproduce the SLA breach.

Override
--------
Set `LOCUST_RUN_TIME=60s` (or `5m`/`1h`) to auto-stop the run after the
given duration; the default is 30m.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import gevent  # noqa: E402

_THIS_DIR = Path(__file__).resolve().parent
_ROOT = _THIS_DIR.parent.parent
sys.path.insert(0, str(_ROOT / "locust"))

from locust import events as _locust_events  # noqa: E402
from locust.env import Environment  # noqa: E402

from locustfile_reviewer import ALL_USER_CLASSES  # noqa: E402

SCENARIO = "5x"
RESULTS_DIR = Path(os.getenv("RESULTS_DIR") or _ROOT / "results" / f"{SCENARIO}_locust")
HOST = os.getenv("LOCUST_HOST", "http://localhost:3141")

TOTAL_USERS = 60
SPAWN_RATE = 5
RUN_TIME = os.getenv("LOCUST_RUN_TIME", "30m")


def _parse_run_time(s: str) -> int:
    """Parse '30s' / '5m' / '1h' into seconds."""
    m = re.match(r"^(\d+)(s|m|h)$", s.strip())
    if not m:
        raise ValueError(f"Bad LOCUST_RUN_TIME {s!r} (expected e.g. 30s, 5m, 1h)")
    n, unit = int(m.group(1)), m.group(2)
    return n * {"s": 1, "m": 60, "h": 3600}[unit]


def main() -> None:
    env = Environment(user_classes=ALL_USER_CLASSES, host=HOST, events=_locust_events)
    env.create_local_runner()

    env.runner.start(user_count=TOTAL_USERS, spawn_rate=SPAWN_RATE)
    print(f"[scenarios/{SCENARIO}] starting: total={TOTAL_USERS} rate={SPAWN_RATE}/s "
          f"host={HOST} results={RESULTS_DIR} time={RUN_TIME}")

    seconds = _parse_run_time(RUN_TIME)

    def _auto_stop():
        _locust_events.quitting.fire(environment=env, reverse=True)
        env.runner.quit()

    gevent.spawn_later(seconds, _auto_stop)
    print(f"[scenarios/{SCENARIO}] scheduled auto-stop+quit in {seconds}s")

    env.runner.greenlet.join()
    print(f"[scenarios/{SCENARIO}] runner joined; exiting")


if __name__ == "__main__":
    main()
