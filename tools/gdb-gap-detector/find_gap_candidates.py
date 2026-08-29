"""
find_gap_candidates.py
======================

Reads farmer-asked queries that the system could not answer
(`disclaimer_logs.status == "unanswered"`) and compares them against the
verified Golden Dataset (`gdb_entries`) to surface coverage gaps.

This is the *candidate discovery* stage of the gap reporting pipeline. A
downstream report generator (matching the `gap_reports` collection schema)
consumes the output of this script to produce the full report.

Source collections (database: `farmer_feedback`)
-------------------------------------------------
- disclaimer_logs
    { _id, query, query_hash, query_normalized, farmer_id, source, language,
      state, domain, confidence, best_match_id, best_match_score, timestamp,
      status, metadata }
    Only rows where ``status == "unanswered"`` are read.

- gdb_entries
    { _id, question, answer, domain, language, state, keywords,
      created_at, updated_at }

Output (printed to stdout)
--------------------------
- total_disclaimers: count of qualifying disclaimer_logs rows
- unique_queries:    count of distinct ``query_hash`` values

The full ``gap_reports`` collection shape (clusters, heatmap, outreach
recommendations, etc.) is assembled by the downstream generator — this
script only produces the candidate/aggregate numbers needed for that.

Privacy
-------
``farmer_id`` is the single identifying field in `disclaimer_logs`. It is
**never** read into local variables, included in prints/logs, or written
to any output artifact. Only non-PII fields (query text, state, domain,
timestamp) are used.

Usage
-----
    # from tools/gdb-gap-detector/
    python find_gap_candidates.py

    # limit to last 30 days, cap at 10000 results
    python find_gap_candidates.py --since-days 30 --limit 10000

    # custom database / explicit URI override
    MONGODB_URI="mongodb://localhost:27017" \\
    python find_gap_candidates.py --db farmer_feedback

Tests
-----
    # from tools/gdb-gap-detector/
    pytest -v

Environment
-----------
Required:
    MONGODB_URI   MongoDB connection string. Script fails loudly if missing.

Optional flags:
    --since-days N     Only consider disclaimers from the last N days.
                       Omit to read all unanswered disclaimers.
    --limit N          Hard-cap on rows read per collection (default 5000,
                       max 20000). Protects against runaway scans.
    --db NAME          Database name (default: ``farmer_feedback``).
    --verbose          Log progress to stderr.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Iterable

from pymongo import MongoClient
from pymongo.collection import Collection

# ---------------------------------------------------------------------------
# Defaults — override via CLI flags or environment
# ---------------------------------------------------------------------------
DEFAULT_DB = "farmer_feedback"
DEFAULT_LIMIT = 5000
MAX_LIMIT = 20000


# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
def get_client() -> MongoClient:
    """Build a MongoClient from MONGODB_URI. Fail loudly if unset."""
    uri = os.environ.get("MONGODB_URI", "").strip()
    if not uri:
        sys.stderr.write(
            "ERROR: MONGODB_URI is not set. "
            "Export it before running this script, e.g.\n"
            "    export MONGODB_URI='mongodb://localhost:27017'\n"
        )
        sys.exit(2)
    return MongoClient(uri)


def fetch_unanswered_disclaimers(
    coll: Collection,
    *,
    since_days: int | None,
    limit: int,
    verbose: bool = False,
) -> list[dict[str, Any]]:
    """Pull disclaimer_logs rows where status == 'unanswered'.

    Notes:
        - ``farmer_id`` is explicitly excluded from the projection so it
          cannot leak into logs/print/pickle by accident.
        - Results are sorted newest-first because gap reports care about
          recent demand more than historical volume.
    """
    query: dict[str, Any] = {"status": "unanswered"}
    if since_days is not None:
        # Mongo-side time filter; avoids round-tripping old rows only to
        # discard them.
        from datetime import datetime, timedelta, timezone

        cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
        query["timestamp"] = {"$gte": cutoff}

    if verbose:
        sys.stderr.write(
            f"[verbose] fetching unanswered disclaimers "
            f"(since_days={since_days}, limit={limit})\n"
        )

    cursor = (
        coll.find(
            query,
            # Explicit projection — PII never leaves Mongo in this script.
            projection={"farmer_id": 0},
        )
        .sort("timestamp", -1)
        .limit(limit)
    )
    return list(cursor)


def fetch_gdb_entries(
    coll: Collection,
    *,
    limit: int,
    verbose: bool = False,
) -> list[dict[str, Any]]:
    """Pull all gdb_entries (capped) for the coverage denominator."""
    if verbose:
        sys.stderr.write(f"[verbose] fetching gdb_entries (limit={limit})\n")
    cursor = coll.find({}, projection={"_id": 1, "domain": 1, "state": 1}).limit(
        limit
    )
    return list(cursor)


# ---------------------------------------------------------------------------
# Aggregations
# ---------------------------------------------------------------------------
def count_unique_query_hash(disclaimers: Iterable[dict[str, Any]]) -> int:
    """Count distinct ``query_hash`` across the disclaimer set."""
    return len({d.get("query_hash") for d in disclaimers if d.get("query_hash")})


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Surface gap candidates between farmer-asked unanswered queries "
            "and the verified Golden Dataset."
        )
    )
    parser.add_argument(
        "--since-days",
        type=int,
        default=None,
        help="Only consider disclaimers from the last N days. Omit for all-time.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=(
            f"Hard cap on rows read per collection "
            f"(default {DEFAULT_LIMIT}, max {MAX_LIMIT})."
        ),
    )
    parser.add_argument(
        "--db",
        default=DEFAULT_DB,
        help=f"MongoDB database name (default: {DEFAULT_DB}).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Log progress to stderr.",
    )
    return parser.parse_args(argv)


def _clamp_limit(limit: int) -> int:
    if limit <= 0:
        sys.stderr.write("ERROR: --limit must be a positive integer.\n")
        sys.exit(2)
    if limit > MAX_LIMIT:
        sys.stderr.write(
            f"WARN: --limit {limit} exceeds max {MAX_LIMIT}; clamping to {MAX_LIMIT}.\n"
        )
        return MAX_LIMIT
    return limit


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv or sys.argv[1:])
    limit = _clamp_limit(args.limit)

    client = get_client()
    try:
        db = client[args.db]

        disclaimers = fetch_unanswered_disclaimers(
            db["disclaimer_logs"],
            since_days=args.since_days,
            limit=limit,
            verbose=args.verbose,
        )
        gdb_entries = fetch_gdb_entries(
            db["gdb_entries"],
            limit=limit,
            verbose=args.verbose,
        )
    finally:
        client.close()

    total_disclaimers = len(disclaimers)
    unique_queries = count_unique_query_hash(disclaimers)

    print(f"total_disclaimers: {total_disclaimers}")
    print(f"unique_queries: {unique_queries}")
    print(f"gdb_entries_loaded: {len(gdb_entries)}")
    if args.since_days is not None:
        print(f"since_days: {args.since_days}")
    print(f"limit: {limit}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
