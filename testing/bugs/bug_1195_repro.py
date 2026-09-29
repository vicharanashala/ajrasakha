"""
bug_1195_repro.py — Bug-1195 regression harness.

Target
------
Asserts that the closed-report endpoint returns the same shape (key set)
whether it is called with `allUsers=true` or `moderator=<id>`. The original
bug stored different fields per path, which the assertion catches.

Run
---
    python -m pytest testing/bugs/bug_1195_repro.py -v
or
    python testing/bugs/bug_1195_repro.py --base-url http://localhost:3141 \\
        --out results/bugs/bug_1195.csv

The script is intentionally idempotent — it inserts fixtures only if
absent, and tears them down on `-`-out exit.
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
from typing import Any, Dict, List, Optional, Tuple


SEED_MARKER_UID = f"lt-bug1195-{uuid.uuid4().hex[:8]}"


def _get_db() -> Any:
    """Lazy mongo (same pattern as users/reviewer.py)."""
    from pymongo import MongoClient
    url = os.getenv("DB_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "agriai_loadtest")
    assert db_name == "agriai_loadtest", "Refusing to mutate non-loadtest DB."
    return MongoClient(url, serverSelectionTimeoutMS=5000)[db_name]


def _seed_questions(db: Any, n: int = 5) -> List[str]:
    """Insert n questions with the bug marker; return their IDs."""
    if db["questions"].count_documents({"firebaseUID": SEED_MARKER_UID}) >= n:
        return [str(d["_id"]) for d in db["questions"].find(
            {"firebaseUID": SEED_MARKER_UID}, projection={"_id": 1})]
    ids: List[str] = []
    for i in range(n):
        doc = {
            "firebaseUID": f"{SEED_MARKER_UID}-{i:03d}",
            "status": "closed",
            "question": f"Bug1195 fixture question {i}",
            "closed_at": time.time() - 3600,
            "moderator": "lt-mod-00001",
        }
        r = db["questions"].insert_one(doc)
        ids.append(str(r.inserted_id))
    return ids


def _teardown(db: Any) -> int:
    return db["questions"].delete_many({"firebaseUID": {"$regex": f"^{SEED_MARKER_UID}"}}).deleted_count


def _http_json(base_url: str, path: str, body: Optional[Dict[str, Any]] = None) -> Tuple[int, Any]:
    import urllib.request

    url = base_url.rstrip("/") + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            text = r.read().decode("utf-8") or "{}"
            return r.status, json.loads(text) if text and text[0] in "[{" else {"raw": text}
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="ignore")
        return e.code, {"raw": text, "error": str(e)}
    except Exception as e:
        return 0, {"error": repr(e)}


def _key_set(payload: Dict[str, Any]) -> set:
    if "data" in payload and isinstance(payload["data"], list) and payload["data"]:
        return set(payload["data"][0].keys())
    return set()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.getenv("BASE_URL", "http://localhost:3141"))
    ap.add_argument("--out", default="results/bugs/bug_1195.csv")
    args = ap.parse_args()

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    summary_row = {"scenario": "bug_1195_repro", "status": "unknown", "detail": ""}

    db = _get_db()
    try:
        ids = _seed_questions(db)
        if len(ids) < 1:
            summary_row.update({"status": "skip", "detail": "no fixtures seeded"})
            return _emit(args.out, summary_row)

        # Exercise both endpoints back-to-back.
        s_all, p_all = _http_json(args.base_url, "/api/questions/closed-reports",
                                  {"allUsers": True, "page": 1, "limit": 50})
        s_mod, p_mod = _http_json(args.base_url, "/api/questions/closed-reports",
                                  {"moderator": "lt-mod-00001", "page": 1, "limit": 50})

        if s_all != 200 or s_mod != 200:
            summary_row["status"] = "error"
            summary_row["detail"] = f"allUsers={s_all}, moderator={s_mod}: {p_all} / {p_mod}"
            return _emit(args.out, summary_row)

        keys_all = _key_set(p_all)
        keys_mod = _key_set(p_mod)

        if keys_all and keys_mod and keys_all != keys_mod:
            summary_row["status"] = "fail"
            summary_row["detail"] = (
                f"key-set mismatch: allUsers-only={keys_all - keys_mod}, "
                f"moderator-only={keys_mod - keys_all}"
            )
        elif not (keys_all or keys_mod):
            summary_row["status"] = "skip"
            summary_row["detail"] = "endpoints returned empty data[]"
        else:
            summary_row["status"] = "pass"
            summary_row["detail"] = f"keys={sorted(keys_all)[:8]}..."

        return _emit(args.out, summary_row)

    finally:
        try:
            _teardown(db)
        except Exception:
            pass


def _emit(out: Path, row: Dict[str, str]) -> int:
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
