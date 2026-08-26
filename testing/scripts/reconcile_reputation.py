#!/usr/bin/env python3
"""
reconcile_reputation.py - Compare runtime reputation snapshots to ground truth.

Reads:
    results/<scenario>/reputation_snapshots.csv       (final per-user snapshot)
    results/<scenario>/reputation_snapshot_history.csv (per-event timeline)
    agriai_loadtest.users.reputation_score (live MongoDB)

Writes:
    results/<scenario>/reputation_drift.csv
    results/<scenario>/reputation_races.csv
    appends to `assertions.csv`:
        REP_DRIFT             (snapshot-vs-live mismatch, S6)
        REP_RACE_MONOTONICITY (in-memory race detected via history)
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

DRIFT_THRESHOLD = 1.0


def _live_reputation():
    from pymongo import MongoClient
    url = os.getenv("DB_URL", "mongodb://127.0.0.1:27018/?replicaSet=rs0")
    db_name = os.getenv("DB_NAME", "agriai_loadtest")
    assert db_name == "agriai_loadtest", "Refusing to read non-loadtest DB."
    db = MongoClient(url, serverSelectionTimeoutMS=5000)[db_name]
    out = {}
    for u in db["users"].find(
        {"firebaseUID": {"$regex": "^lt-"}},
        projection={"_id": 1, "reputation_score": 1, "reputationScore": 1},
    ):
        uid = str(u["_id"])
        rep = u.get("reputation_score") or u.get("reputationScore") or 0.0
        try:
            out[uid] = float(rep)
        except (TypeError, ValueError):
            pass
    return out


def _detect_monotonicity_races(hist_path):
    """Return list of (uid, prev_score, curr_score, prev_ctx, curr_ctx)
    for every consecutive (per-user) history row where score decreased."""
    if not hist_path.exists():
        return []
    races = []
    by_uid = {}
    with open(hist_path, "r", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                at = float(r["at"])
                score = float(r["reputation_score"])
            except (KeyError, ValueError, TypeError):
                continue
            by_uid.setdefault(r["user_id"], []).append(
                (at, score, r.get("context", ""))
            )
    for uid, rows in by_uid.items():
        rows.sort(key=lambda x: x[0])
        for (a1, s1, c1), (a2, s2, c2) in zip(rows, rows[1:]):
            if s2 < s1:
                races.append((uid, s1, s2, c1, c2))
    return races


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", required=True)
    args = ap.parse_args()

    repo = Path(__file__).resolve().parents[2]
    scen_dir = repo / "results" / args.scenario
    snap_path = scen_dir / "reputation_snapshots.csv"
    hist_path = scen_dir / "reputation_snapshot_history.csv"
    out_csv   = scen_dir / "reputation_drift.csv"
    races_csv = scen_dir / "reputation_races.csv"

    drift_count = 0
    race_count  = 0
    rows = []

    # Snapshot vs. live (S6 drift)
    if snap_path.exists():
        try:
            live = _live_reputation()
        except Exception as e:
            print(f"[reconcile] live Mongo unreachable ({e}); snapshot-vs-live skipped")
            live = {}

        with open(snap_path, "r", newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                uid = r["user_id"]
                try:
                    snap = json.loads(r["snapshot_json"])
                    snap_value = float(snap.get("reputation_score") or 0)
                except (json.JSONDecodeError, ValueError, TypeError):
                    snap_value = 0.0
                live_value = live.get(uid, 0.0)
                delta = abs(snap_value - live_value)
                if delta > DRIFT_THRESHOLD:
                    drift_count += 1
                rows.append({
                    "user_id": uid, "snapshot": snap_value,
                    "live": live_value, "abs_delta": delta,
                    "drift": int(delta > DRIFT_THRESHOLD),
                })

        with open(out_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["user_id", "snapshot", "live",
                                              "abs_delta", "drift"])
            w.writeheader()
            w.writerows(rows)
    else:
        print(f"[reconcile] {snap_path} missing - snapshot-vs-live skipped")

    # History monotonicity (in-memory race detector)
    races = _detect_monotonicity_races(hist_path)
    race_count = len(races)
    with open(races_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["user_id", "prev_score", "curr_score",
                    "prev_context", "curr_context"])
        for uid, p, c, pc, cc in races:
            w.writerow([uid, f"{p:.4f}", f"{c:.4f}", pc, cc])

    # Append both signals to assertions.csv
    ass_path = scen_dir / "assertions.csv"
    with open(ass_path, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["REP_DRIFT", drift_count])
        w.writerow(["REP_RACE_MONOTONICITY", race_count])

    print(f"[reconcile] {args.scenario}: "
          f"drift={drift_count}/{len(rows)} races={race_count} "
          f"-> {out_csv.name}, {races_csv.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
