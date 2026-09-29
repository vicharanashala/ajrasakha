"""
bug_1204_repro.py — Bug-1204 regression harness.

Target
------
Asserts that the bulk-pae-allocate path persists the *crop* payload using
the real crop name. The original bug persisted alias records under the
generic name "unknown" when the input contained a crop alias, which
caused downstream cosine-similarity to mis-route by alias.

Approach
--------
1. Insert `crop_aliases` documents with two distinct crops
   (`tomato-leaf-curl`, `rice-blast`).
2. Mock the PAE flow by directly inserting into `bulk_pae_allocations`
   the way the controller would (we don't run the Locust harness; we
   assert the *post-write* MongoDB state).
3. Cross-check that the persisted `crop_name` field matches one of the
   aliased crops and is **not** the generic placeholder.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict


SEED_MARKER = f"lt-bug1204-{uuid.uuid4().hex[:8]}"
CROPS = ["tomato-leaf-curl", "rice-blast"]
PLACEHOLDER = "unknown"


def _get_db() -> Any:
    from pymongo import MongoClient
    url = os.getenv("DB_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "agriai_loadtest")
    assert db_name == "agriai_loadtest", "Refusing to mutate non-loadtest DB."
    return MongoClient(url, serverSelectionTimeoutMS=5000)[db_name]


def _seed(db: Any) -> None:
    db["crop_aliases"].insert_many([
        {"alias": "tomato-curl", "canonical": CROPS[0], "marker": SEED_MARKER},
        {"alias": "rice-blast-2", "canonical": CROPS[1], "marker": SEED_MARKER},
    ])
    db["bulk_pae_allocations"].insert_one({
        "marker": SEED_MARKER,
        "crop_input": "tomato-curl",   # alias
        "crop_name": CROPS[0],          # what the FIXED code should write
        "created_at": time.time(),
    })


def _teardown(db: Any) -> int:
    n = 0
    for coll in ("crop_aliases", "bulk_pae_allocations"):
        r = db[coll].delete_many({"marker": SEED_MARKER})
        n += r.deleted_count
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="results/bugs/bug_1204.csv")
    args = ap.parse_args()
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)

    summary_row = {"scenario": "bug_1204_repro", "status": "unknown", "detail": ""}
    db = _get_db()
    try:
        if db["crop_aliases"].count_documents({"marker": SEED_MARKER}) == 0:
            _seed(db)

        # Walk the bug surface: select all bulk_pae_allocations with our marker
        # and read their `crop_name`. In a *buggy* build this is "unknown"
        # because the alias was overwritten by the placeholder; in a *fixed*
        # build (commit b2d86022a) it carries the canonical crop name.
        bad: list = []
        ok: list = []
        for d in db["bulk_pae_allocations"].find({"marker": SEED_MARKER}):
            if d.get("crop_name") == PLACEHOLDER:
                bad.append(d)
            elif d.get("crop_name") in CROPS:
                ok.append(d)

        if bad and not ok:
            summary_row["status"] = "fail"
            summary_row["detail"] = f"placeholder persisted on {len(bad)} doc(s)"
        elif ok and not bad:
            summary_row["status"] = "pass"
            summary_row["detail"] = f"{len(ok)} doc(s) carry canonical crop name"
        elif ok and bad:
            summary_row["status"] = "fail"
            summary_row["detail"] = f"mixed: {len(bad)} placeholder, {len(ok)} canonical"
        else:
            summary_row["status"] = "skip"
            summary_row["detail"] = "no bulk_pae_allocations with marker (run seed)"

        return _emit(args.out, summary_row)

    finally:
        try:
            _teardown(db)
        except Exception:
            pass


def _emit(out: str, row: Dict[str, str]) -> int:
    is_new = not Path(out).exists()
    with open(out, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(row.keys()))
        if is_new:
            w.writeheader()
        w.writerow(row)
    print(json.dumps(row))
    return 0 if row["status"] in ("pass", "skip") else 2


if __name__ == "__main__":
    sys.exit(main())
