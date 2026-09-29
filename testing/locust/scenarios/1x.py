"""
scenarios/1x.py — 1× baseline.

Target
------
Establish the per-role cost envelope at the *expected steady-state* load
(numbers below come from the production traffic profile in the roadmap §5
— "approximately 50 reviewer-side requests/min under normal traffic" —
scaled to hit per-second targets stated in the SLA doc):

* 5 experts, 2 pae_experts, 2 moderators, 1 gate_keeper, 1 auditor, 1 admin
* 1× spawn rate (`-r 1`), 60-minute run budget.

Run
---
    pwsh -File testing/scripts/run-locust-1x.ps1
or directly:
    LOAD_PROFILE=moderate RESULTS_DIR=results/1x_locust \
      python testing/locust/scenarios/1x.py

Override
--------
Set `LOCUST_RUN_TIME=30s` (or `5m`/`1h`) to auto-stop the run after the
given duration; the default is 60m.

Implementation note
-------------------
Locust 2.32's `runner.start()` accepts a single `user_count` (total)
and uses per-class `weight` to allocate. The run plan is therefore:

* Spawn `TOTAL = 12` virtual users at `1/s`.
* Class weights in `users/roles.py` (Expert=50, PaeExpert=10, Moderator=10,
  GateKeeper=5, Auditor=5, Admin=1) yield a per-class mix of
  E=7 / P=2 / M=2 / GK=1 / A=1 / Ad=0 (rounded) — close to the 5/2/2/1/1/1
  documented in the roadmap.
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

SCENARIO = "1x"
RESULTS_DIR = Path(os.getenv("RESULTS_DIR") or _ROOT / "results" / f"{SCENARIO}_locust")
HOST = os.getenv("LOCUST_HOST", "http://localhost:3141")

# 12 simulated users at 1x — distributed by `weight` across the 6 role classes.
TOTAL_USERS = 12
# 1 spawn/sec.
SPAWN_RATE = 1
# 60-min default budget.
RUN_TIME = os.getenv("LOCUST_RUN_TIME", "60m")


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

    # Schedule auto-stop if LOCUST_RUN_TIME is set. We call .quit() rather
    # than .stop() so the runner's hub greenlet is killed at the end of the
    # run — otherwise the greenlet.join() below can hang on a stuck user
    # gevent (e.g. one blocked on a long request after the timer fires).
    # We also fire `events.quitting` first so listeners that flush
    # reputation_snapshots.csv / queue_lengths.csv (assertions.py:_on_quitting)
    # get a chance to run — Locust's main.py:shutdown() would normally do this
    # for the CLI driver, but the programmatic scenario driver has to fire
    # it manually.
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
