"""generate_report.py
===================

Stage 3 of the GDB gap-reporting pipeline. Combines::

    MongoDB gdb_entries    ──┐
                              │
    MongoDB disclaimer_logs ──┤  ──>  full gap_reports document
                (filter       │       (top_gaps from clustering.py +
                 status=      │        coverage_stats heatmap +
                 unanswered)  │        outreach_recommendations +
                              │        domains_with_gaps +
                              │        states_with_gaps)
                              │
                              ▼

Stage 1 (``find_gap_candidates.py``) discovers candidates and prints a
one-line summary. Stage 2 (``clustering.py``) clusters those candidates
into ``top_gaps``. This stage assembles the *full* ``gap_reports``
document and writes a markdown summary to disk.

The ``gap_reports`` collection schema (as specified by the user):

    {
      report_type, period_days, start_date, end_date, generated_at,
      total_disclaimers, unique_queries, clusters_found,
      top_gaps:                  [ from clustering.compute_top_gaps() ],
      coverage_stats: {
        heatmap:           [ { domain, state, gdb_count, disclaimer_count,
                               coverage_score, status } ],
        total_combinations, covered, partial, gaps
      },
      outreach_recommendations: [ { target_state, focus_domain, gap_questions,
                                    recommendation, priority } ],
      domains_with_gaps:        [ { domain, gap_count } ],
      states_with_gaps:         [ { state,  gap_count } ]
    }

Privacy
-------
``farmer_id`` is never read in this script. ``find_gap_candidates.fetch_unanswered_disclaimers``
projects it out at the Mongo layer, so it's not even present in the
in-memory candidate list.

CLI
---
    # Default — read-only, write markdown summary to ./gap_report.md
    export MONGODB_URI="mongodb://localhost:27017"
    python generate_report.py

    # Custom period / output
    python generate_report.py --since-days 30 --output /tmp/gap.md

    # Insert into gap_reports collection (INSERT ONLY — never overwrites)
    python generate_report.py --write-to-db

Safety guarantees
-----------------
* ``--write-to-db`` is **OFF by default** — running the script never
  touches MongoDB without an explicit flag.
* When ``--write-to-db`` is set, the script calls ``insert_one()`` only.
  It never calls ``update_one``, ``replace_one``, ``delete_one``,
  ``delete_many``, ``drop``, or any bulk-write primitive. The script's
  own code path makes a single insert call and exits.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from pymongo import MongoClient
from pymongo.collection import Collection

import clustering
import find_gap_candidates as fgc

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
REPORT_TYPE = "gdb_coverage_gap"
DEFAULT_PERIOD_DAYS = 30
DEFAULT_OUTPUT_PATH = "./gap_report.md"
DEFAULT_DB = fgc.DEFAULT_DB
DEFAULT_LIMIT = fgc.DEFAULT_LIMIT
MAX_LIMIT = fgc.MAX_LIMIT

# Outreach: how many (state, domain) pairs to surface.
OUTREACH_TOP_N = 10

# Sentinel string for missing domain/state values when bucketing the
# heatmap. Mongo docs may omit `state` (or `domain`) entirely, leaving
# Python ``None`` in the row. The heatmap's per-pair counting key is
# ``(domain, state)``; if we left None in the tuple, ``sorted(all_pairs)``
# would raise ``TypeError: '<' not supported between instances of 'str'
# and 'NoneType'``. Bucketing both missing-domain and missing-state
# documents into the literal "None" string keeps the key space
# homogeneous and matches the existing reference gap_reports format
# (e.g. ``{"domain": "General", "state": "None"}``). Applied consistently
# to BOTH gdb_entries and disclaimer_logs so a null-state doc from
# either source lands in the same "None" row.
HEATMAP_MISSING = "None"


def _bucket_key(row: dict[str, Any]) -> tuple[str, str]:
    """Return a homogeneous ``(domain, state)`` bucket key for ``row``.

    Missing or ``None`` values are normalized to the literal string
    ``HEATMAP_MISSING`` (``"None"``) so the bucket set is always
    ``tuple[str, str]`` and is therefore sortable.
    """
    domain = row.get("domain")
    state = row.get("state")
    return (
        domain if domain is not None else HEATMAP_MISSING,
        state  if state  is not None else HEATMAP_MISSING,
    )


# ---------------------------------------------------------------------------
# Coverage_stats.heatmap
# ---------------------------------------------------------------------------
def build_heatmap(
    gdb_entries: Iterable[dict[str, Any]],
    disclaimers: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return one row per distinct (domain, state) seen in either source.

    Each row has ``gdb_count``, ``disclaimer_count``, ``coverage_score``,
    and ``status`` per the spec. Missing domain/state values are
    bucketed under the literal string ``HEATMAP_MISSING`` (``"None"``);
    see the comment on that constant for rationale.
    """
    gdb_pairs: Counter[tuple[str, str]] = Counter()
    for g in gdb_entries:
        gdb_pairs[_bucket_key(g)] += 1

    disc_pairs: Counter[tuple[str, str]] = Counter()
    for d in disclaimers:
        disc_pairs[_bucket_key(d)] += 1

    all_pairs = set(gdb_pairs) | set(disc_pairs)
    rows: list[dict[str, Any]] = []
    for pair in sorted(all_pairs):
        domain, state = pair
        g = gdb_pairs.get(pair, 0)
        d = disc_pairs.get(pair, 0)
        total = g + d
        if total > 0:
            score = round(g / total * 100, 1)
        else:
            score = 0.0
        rows.append({
            "domain": domain,
            "state": state,
            "gdb_count": g,
            "disclaimer_count": d,
            "coverage_score": score,
            # status rule: "gap" if disclaimer_count > 0 else "good"
            "status": "gap" if d > 0 else "good",
        })
    return rows


def coverage_stats(heatmap: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate heatmap rows into ``coverage_stats``.

    ``partial`` is reserved for future use and is always 0.
    """
    total = len(heatmap)
    gaps = sum(1 for r in heatmap if r["status"] == "gap")
    covered = sum(1 for r in heatmap if r["status"] == "good")
    return {
        "heatmap": heatmap,
        "total_combinations": total,
        "covered": covered,
        "partial": 0,           # reserved for future use; see README
        "gaps": gaps,
    }


# ---------------------------------------------------------------------------
# domains_with_gaps / states_with_gaps
# ---------------------------------------------------------------------------
def domains_with_gaps(disclaimers: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sum disclaimer_count by domain; only entries with gap_count > 0.

    Sorted descending by gap_count. Rows with ``domain is None`` are
    dropped (uncategorized).
    """
    counts: Counter[str] = Counter()
    for d in disclaimers:
        dom = d.get("domain")
        if dom is None:
            continue
        counts[dom] += 1
    return [{"domain": dom, "gap_count": c}
            for dom, c in counts.most_common()
            if c > 0]


def states_with_gaps(disclaimers: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sum disclaimer_count by state; only entries with gap_count > 0.

    Sorted descending by gap_count.
    """
    counts: Counter[str] = Counter()
    for d in disclaimers:
        st = d.get("state")
        if st is None:
            continue
        counts[st] += 1
    return [{"state": st, "gap_count": c}
            for st, c in counts.most_common()
            if c > 0]


# ---------------------------------------------------------------------------
# outreach_recommendations
# ---------------------------------------------------------------------------
def _recommendation_for(priority: str, domain: str, state: str) -> str:
    """Short templated recommendation string keyed off priority level."""
    if priority == "HIGH":
        return (f"Coordinate with {state}'s agri department to draft expert "
                f"Q&A in {domain}.")
    if priority == "MEDIUM":
        return (f"Engage local KVK to address {domain} questions in {state}.")
    return (f"Monitor {domain} questions from {state}; bundle into next "
            f"review cycle.")


def outreach_recommendations(
    heatmap: list[dict[str, Any]],
    *,
    top_n: int = OUTREACH_TOP_N,
) -> list[dict[str, Any]]:
    """Return top-N (state, domain) pairs by disclaimer_count desc.

    Rows with ``state == HEATMAP_MISSING`` (``"None"``) are excluded
    before sorting because field-visit outreach recommendations need a
    real, named state — a "Coordinate with None's agri department"
    target is not actionable. Those rows are still counted in
    ``coverage_stats`` and ``domains_with_gaps`` for completeness;
    they're only filtered out of this outreach list.

    Note: rows where ``domain == HEATMAP_MISSING`` are NOT excluded
    here. The user's filter scope is state-only. A focus_domain of
    "None" in a recommendation is odd but not impossible to act on
    (e.g. a state-wide pest outbreak that crosses domain categories),
    so we surface it. Documented scope decision.

    ``priority`` is ``"HIGH"`` for entries at or above the **median**
    disclaimer_count within the top-N list. Median-of-10 = average of
    the 5th and 6th values (0-indexed: items[4] and items[5]). We use
    ``>=`` against that average, so ties at the cutoff are flagged HIGH.

    Documented here so the cutoff rule is auditable from the source.
    """
    # Drop rows with a missing state — they cannot drive actionable
    # field-visit outreach. (Domain-missing rows still appear; see the
    # note in the docstring above.)
    actionable = [r for r in heatmap if r["state"] != HEATMAP_MISSING]

    sorted_rows = sorted(
        actionable,
        key=lambda r: (-r["disclaimer_count"], r["domain"] or "", r["state"] or ""),
    )[:top_n]

    if not sorted_rows:
        return []

    counts = [r["disclaimer_count"] for r in sorted_rows]
    # Median of an even-length list = average of the two middle elements.
    median = (counts[len(counts) // 2 - 1] + counts[len(counts) // 2]) / 2

    out: list[dict[str, Any]] = []
    for r in sorted_rows:
        priority = "HIGH" if r["disclaimer_count"] >= median else "MEDIUM"
        out.append({
            "target_state": r["state"],
            "focus_domain": r["domain"],
            "gap_questions": r["disclaimer_count"],
            "recommendation": _recommendation_for(
                priority, r["domain"] or "uncategorized", r["state"] or "unspecified"
            ),
            "priority": priority,
        })
    return out


# ---------------------------------------------------------------------------
# Full report assembly
# ---------------------------------------------------------------------------
def build_report(
    *,
    period_days: int,
    gdb_entries: Iterable[dict[str, Any]],
    disclaimers: Iterable[dict[str, Any]],
    candidates: Iterable[dict[str, Any]],
    now: datetime | None = None,
    top_n_outreach: int = OUTREACH_TOP_N,
) -> dict[str, Any]:
    """Assemble the full ``gap_reports`` document.

    Parameters
    ----------
    period_days
        Number of days back from ``now`` that this report covers.
    gdb_entries
        Iterable of pre-loaded gdb_entries rows.
    disclaimers
        Iterable of pre-loaded disclaimer_logs rows (already filtered to
        status="unanswered"; PII already stripped upstream).
    candidates
        Same as ``disclaimers`` — fed into ``clustering.compute_top_gaps``.
        Kept as a separate parameter so the caller can decide whether
        clustering uses a different slice than the heatmap (e.g. only the
        last 7 days for clustering but 30 days for the heatmap).
    now
        UTC reference time. Defaults to ``datetime.now(timezone.utc)``.
        Override for tests / reproducible reports.
    """
    now = now or datetime.now(timezone.utc)
    end_date = now
    start_date = now - timedelta(days=period_days)

    # Materialize iterables once so we can iterate multiple times.
    gdb_list = list(gdb_entries)
    disc_list = list(disclaimers)
    cand_list = list(candidates)

    top_gaps = clustering.compute_top_gaps(cand_list, now=now)
    heatmap = build_heatmap(gdb_list, disc_list)
    stats = coverage_stats(heatmap)
    dom_gaps = domains_with_gaps(disc_list)
    st_gaps = states_with_gaps(disc_list)
    outreach = outreach_recommendations(heatmap, top_n=top_n_outreach)

    return {
        "report_type": REPORT_TYPE,
        "period_days": period_days,
        "start_date": start_date,
        "end_date": end_date,
        "generated_at": now,
        "total_disclaimers": len(disc_list),
        "unique_queries": fgc.count_unique_query_hash(disc_list),
        "clusters_found": len(top_gaps),
        "top_gaps": top_gaps,
        "coverage_stats": stats,
        "outreach_recommendations": outreach,
        "domains_with_gaps": dom_gaps,
        "states_with_gaps": st_gaps,
    }


# ---------------------------------------------------------------------------
# Markdown rendering (lightweight; not a styling exercise)
# ---------------------------------------------------------------------------
def render_markdown(report: dict[str, Any]) -> str:
    """Render a short human-readable markdown summary of the report."""
    lines: list[str] = []
    a = lines.append
    a(f"# Gap Report — {report['report_type']}")
    a("")
    a(f"- Generated at: `{report['generated_at'].isoformat()}`")
    a(f"- Period: {report['period_days']} days "
      f"({report['start_date'].date()} → {report['end_date'].date()})")
    a(f"- Total unanswered disclaimers: **{report['total_disclaimers']}**")
    a(f"- Distinct query hashes: **{report['unique_queries']}**")
    a(f"- Clusters found: **{report['clusters_found']}**")
    a("")

    cs = report["coverage_stats"]
    a("## Coverage")
    a(f"- Total (domain, state) combinations: **{cs['total_combinations']}**")
    a(f"- Covered: **{cs['covered']}**")
    a(f"- Gaps: **{cs['gaps']}**")
    a(f"- Partial: **{cs['partial']}** (reserved for future use)")
    a("")

    a("## Top gaps (by priority score)")
    if not report["top_gaps"]:
        a("_No clusters._")
    else:
        for c in report["top_gaps"][:10]:
            a(f"- **{c['priority_level']}** "
              f"`{c['cluster_name']}` — size {c['size']}, "
              f"states {len(c['states'])}, "
              f"priority {c['priority_score']:.2f}")
    a("")

    a("## Outreach recommendations")
    if not report["outreach_recommendations"]:
        a("_No outreach targets._")
    else:
        for o in report["outreach_recommendations"]:
            a(f"- [{o['priority']}] {o['target_state']} / {o['focus_domain']} "
              f"— {o['gap_questions']} gap questions. {o['recommendation']}")
    a("")

    a("## Domains with gaps")
    if not report["domains_with_gaps"]:
        a("_None._")
    else:
        for d in report["domains_with_gaps"]:
            a(f"- {d['domain']}: {d['gap_count']}")
    a("")

    a("## States with gaps")
    if not report["states_with_gaps"]:
        a("_None._")
    else:
        for s in report["states_with_gaps"]:
            a(f"- {s['state']}: {s['gap_count']}")
    a("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# MongoDB write (INSERT ONLY — never overwrites)
# ---------------------------------------------------------------------------
def write_report_to_db(report: dict[str, Any], *, db_name: str = DEFAULT_DB) -> str:
    """Insert the report as a new document. Returns the inserted _id.

    Safety: this function ONLY calls ``insert_one``. It never updates,
    replaces, or deletes. See the module docstring's safety section.
    """
    uri = os.environ.get("MONGODB_URI", "").strip()
    if not uri:
        sys.stderr.write(
            "ERROR: MONGODB_URI is not set. Cannot write to gap_reports.\n"
        )
        sys.exit(2)

    client = MongoClient(uri)
    try:
        coll = client[db_name]["gap_reports"]
        result = coll.insert_one(report)
        return str(result.inserted_id)
    finally:
        client.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Assemble a gap_reports document and write a markdown "
                    "summary. Reads from MongoDB; only writes back to "
                    "gap_reports when --write-to-db is passed."
    )
    p.add_argument(
        "--since-days",
        type=int,
        default=DEFAULT_PERIOD_DAYS,
        help=f"Period covered by the report in days (default {DEFAULT_PERIOD_DAYS}).",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Hard cap on rows read per collection (default {DEFAULT_LIMIT}, max {MAX_LIMIT}).",
    )
    p.add_argument(
        "--db",
        default=DEFAULT_DB,
        help=f"MongoDB database name (default: {DEFAULT_DB}).",
    )
    p.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_PATH,
        help=f"Markdown output path (default {DEFAULT_OUTPUT_PATH}).",
    )
    p.add_argument(
        "--write-to-db",
        action="store_true",
        help="Insert the report into gap_reports. Default OFF (read-only).",
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="Log progress to stderr.",
    )
    return p.parse_args(argv)


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

    if args.since_days <= 0:
        sys.stderr.write("ERROR: --since-days must be a positive integer.\n")
        sys.exit(2)

    client = fgc.get_client()
    try:
        db = client[args.db]

        disclaimers = fgc.fetch_unanswered_disclaimers(
            db["disclaimer_logs"],
            since_days=args.since_days,
            limit=limit,
            verbose=args.verbose,
        )
        gdb_entries = fgc.fetch_gdb_entries(
            db["gdb_entries"],
            limit=limit,
            verbose=args.verbose,
        )
    finally:
        client.close()

    # Clustering uses the same disclaimers slice (could be narrowed
    # later if needed).
    report = build_report(
        period_days=args.since_days,
        gdb_entries=gdb_entries,
        disclaimers=disclaimers,
        candidates=disclaimers,
    )

    # 1. Markdown summary — ALWAYS written (even when --write-to-db is off).
    md = render_markdown(report)
    out_path = os.path.abspath(args.output)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"wrote markdown summary: {out_path}")
    print(f"total_disclaimers: {report['total_disclaimers']}")
    print(f"unique_queries: {report['unique_queries']}")
    print(f"clusters_found: {report['clusters_found']}")
    print(f"coverage_stats.gaps: {report['coverage_stats']['gaps']}")

    # 2. Optional Mongo insert — INSERT ONLY.
    if args.write_to_db:
        inserted_id = write_report_to_db(report, db_name=args.db)
        print(f"inserted gap_reports _id={inserted_id}")
    else:
        print("(read-only run; pass --write-to-db to insert into gap_reports)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())