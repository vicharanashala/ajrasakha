"""
locustfile_reviewer.py — Project 7 reviewer loadtest orchestrator.

Usage
-----
The runner is invoked via the scenario files in `scenarios/{1x,5x,10x}.py`
which call `runner.run()` programmatically. The CLI form is also supported:

    locust -f testing/locust/locustfile_reviewer.py --headless \\
           -u 50 -r 5 -t 10m --host http://localhost:3141

What the orchestrator does
--------------------------
1. Loads the per-role user classes from `users/roles.py`.
2. Registers the `assertions` event listener so every request is recorded
   into `results/<scenario>/requests.csv` and rejected 5xx are aggregated.
3. Picks up the `RESULTS_DIR` env var (set by `scenarios/*.py`) so the
   assertions listener writes into the per-scenario output folder.
4. Exposes `LOAD_PROFILE` env var support — `heavy_allocate`, `squash_p95`,
   `moderate` — which adjusts `tasks` weights per role for ergonomic
   one-shot re-runs.

Why this file is *not* the `__init__.py` of the suite:
* Locust's `-f` flag points at this file specifically; `__init__.py` would
  be ambiguous between the parent and the user's actual project.
* This gives us a single, predictable entry point for the
  `pwsh -File testing/scripts/run-locust-1x.ps1` scripts.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List

# Make `testing/locust/...` importable when Locust is launched from any cwd.
_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from locust import events  # noqa: E402

from helpers import assertions as A  # noqa: E402
from users.roles import ALL_USER_CLASSES, Expert, PaeExpert, Moderator, GateKeeper, Auditor, Admin  # noqa: E402

# -----------------------------------------------------------------------------
# 1. Event-listener init
# -----------------------------------------------------------------------------
_results_dir = os.getenv("RESULTS_DIR") or str(_THIS_DIR.parent / "results" / "_default")
A.init(_results_dir)
print(f"[locustfile_reviewer] assertions listener writing to: {_results_dir}")


# -----------------------------------------------------------------------------
# 2. Load-profile knobs
# -----------------------------------------------------------------------------
# Adjusts task weight multiplicatively per role. Used by the scenarios
# (`scenarios/1x.py`, etc.) to focus the run on a single surface — e.g. an
# "allocations only" 10x run for S1 reproduction.
PROFILES = {
    "moderate":   {"expert": 1.0, "pae_expert": 1.0, "moderator": 1.0,
                   "gate_keeper": 1.0, "auditor": 1.0, "admin": 1.0},
    "heavy_allocate": {"expert": 1.0, "pae_expert": 5.0, "moderator": 1.0,
                       "gate_keeper": 1.0, "auditor": 1.0, "admin": 1.0},
    "squash_p95": {"expert": 5.0, "pae_expert": 1.0, "moderator": 5.0,
                   "gate_keeper": 1.0, "auditor": 1.0, "admin": 1.0},
    "moderator_heap": {"expert": 1.0, "pae_expert": 1.0, "moderator": 10.0,
                       "gate_keeper": 1.0, "auditor": 1.0, "admin": 1.0},
}


def _apply_profile(profile: str) -> None:
    """Multiply `weight` on each role class by the profile multiplier."""
    mults = PROFILES.get(profile, PROFILES["moderate"])
    for cls, weight_key in [
        (Expert, "expert"),
        (PaeExpert, "pae_expert"),
        (Moderator, "moderator"),
        (GateKeeper, "gate_keeper"),
        (Auditor, "auditor"),
        (Admin, "admin"),
    ]:
        cls.weight = max(1, int(cls.weight * mults[weight_key]))


_apply_profile(os.getenv("LOAD_PROFILE", "moderate"))


# -----------------------------------------------------------------------------
# 3. Locust startup hook — write a run-manifest CSV so the report has
#    pins to the exact scenario configuration.
# -----------------------------------------------------------------------------
@events.init.add_listener
def _on_init(environment, **kwargs):
    import csv
    manifest_path = Path(_results_dir) / "run_manifest.csv"
    Path(_results_dir).mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["key", "value"])
        w.writerow(["host", environment.host or os.getenv("LOCUST_HOST", "")])
        w.writerow(["profile", os.getenv("LOAD_PROFILE", "moderate")])
        w.writerow(["results_dir", _results_dir])
        for cls in ALL_USER_CLASSES:
            w.writerow([f"weight.{cls.__name__}", cls.weight])


# -----------------------------------------------------------------------------
# 4. Re-export user classes so `locust -f locustfile_reviewer.py` finds them.
# -----------------------------------------------------------------------------
# Locust discovers HttpUser subclasses by importing them. The imports above
# already load the classes; nothing more to do.

# Sanity log so the operator sees the load mix before the run starts.
print("[locustfile_reviewer] user mix:")
for cls in ALL_USER_CLASSES:
    print(f"  {cls.__name__:<14} weight={cls.weight}")
