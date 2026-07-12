"""
run_ground_truth.py — PR2 ground-truth evaluation runner.

Loads GDB-derived fixture cases and runs the answer quality metrics pipeline
against them. Synthetic data only — no MongoDB, no network calls (EVAL_JUDGE=mock).

PLUMBING NOTE
-------------
This runner feeds each case's expected_output as response_text:
    result["query"]          = case["input"]          # user question
    result["response_text"]  = case["expected_output"] # same text (plumbing smoke-run)
    result["context"]        = []

This is a CIRCULAR evaluation — the agent answer IS the ground truth,
identical strings. AnswerRelevancyMetric will score ~1.0 trivially.
This is intentional: the value of this runner is verifying that:
  (a) the loader produces well-formed cases
  (b) evaluate_response_quality accepts them without error
  (c) build_summary() aggregates results correctly
  (d) the full pipeline runs end-to-end with EVAL_JUDGE=mock

Once a real GDB export exists (questions + answers joined, expected_output
populated from the answers collection), response_text should be the LIVE
AGENT ANSWER and expected_output the canonical GDB answer — then the
circularity disappears and the scores are meaningful quality measurements.
This file does NOT make that change; it is documented plumbing only.

Run:
    cd ai && EVAL_JUDGE=mock python -m ajrasakha.evaluation.run_ground_truth
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure ai/ is on the path
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# ------------------------------------------------------------------
# Modules under test
# ------------------------------------------------------------------
from ajrasakha.evaluation.gdb_fixtures import load_ground_truth_cases, GDBFixtureError
from ajrasakha.evaluation.answer_eval import evaluate_response_quality
from ajrasakha.evaluation.summary import build_summary


def run_ground_truth_eval(
    fixture_path: str | Path,
    judge: str | None = None,
    db_url: str | None = None,
    readback: int = 0,
    domain_report_md: str | None = None,
) -> list[dict]:
    """
    Load ground-truth cases from a JSON fixture file and run the answer quality
    evaluation pipeline against them.

    Parameters
    ----------
    fixture_path : str | Path
        Path to a gdb_ground_truth*.json fixture file.
    judge : str | None
        Override EVAL_JUDGE from env. Values: "mock", "ollama", "anthropic".
        If None, uses os.environ.get("EVAL_JUDGE", "mock").
    db_url : str | None
        If provided, results are saved to this database via
        storage.save_eval_results(). Supports any DB-API 2.0 URL:
          - "postgresql://user:pass@host:5432/dbname"   (production)
          - "sqlite:///absolute/path.db"                (file-backed tests)
          - "sqlite://:memory:"                          (in-memory; not cross-conn)
        If None, storage is skipped entirely (backwards-compatible).
    readback : int
        After saving, read back the N most recent rows via
        storage.get_recent_results() and print them. 0 = skip read-back.
        Requires db_url to be set; ignored otherwise.
    domain_report_md : str | None
        If provided, build the per-domain quality report and write it to
        this path as Markdown. The report aggregates AnswerRelevancy,
        Faithfulness, ContextualRelevancy, gdb_match_score, and
        agricultural_correctness (with per-facet breakdown) sliced by
        result["expected_metadata"]["domain"].
        If None, the per-domain report is not written (legacy behaviour).
        Note: a short table is always printed to stdout regardless of
        this flag; the flag controls whether a Markdown file is written.

    Returns
    -------
    list[dict]
        Per-case result dicts from evaluate_response_quality.

    Raises
    ------
    GDBFixtureError
        If the fixture file is missing, malformed, or fails validation.
    """
    # Resolve judge
    judge = judge or os.environ.get("EVAL_JUDGE", "mock")

    # ------------------------------------------------------------------
    # 1. Load fixture cases
    # ------------------------------------------------------------------
    cases = load_ground_truth_cases(fixture_path)
    print(f"\nLoaded {len(cases)} ground-truth case(s) from {fixture_path}")
    if not cases:
        print("No cases to evaluate.")
        return []

    # ------------------------------------------------------------------
    # 2. Build result dicts and run evaluate_response_quality
    # ------------------------------------------------------------------
    results = []

    for case in cases:
        # Plumbing smoke-run: response_text == expected_output (circular by design).
        # See module docstring for full explanation.
        #
        # Fixture schema (after gdb_fixtures.load_ground_truth_cases normalises):
        #   case["input"], case["expected_output"], case["question_id"]  — required
        #   case["metadata"]                                            — always present (may be {})
        #     metadata may carry: domain, crop, state, AND/OR
        #       expected_crop, expected_treatment, expected_region
        #
        # Both shapes are supported. The runner synthesises expected_* from
        # crop/state when those are present but the expected_* fields aren't
        # (so the discrimination fixture, which only has flat fields, also
        # feeds the agricultural_correctness metric).
        metadata = case.get("metadata") or {}

        # Synthesise expected_* from crop/state if not explicitly declared.
        if metadata.get("expected_crop") is None and metadata.get("crop"):
            metadata["expected_crop"] = metadata["crop"]
        if metadata.get("expected_region") is None and metadata.get("state"):
            metadata["expected_region"] = metadata["state"]
        # expected_treatment is never derivable from a flat field — only the
        # caller (or the fixture author) can know that. Leave it absent if
        # not declared; the metric will skip that facet.

        # Carry the domain forward into expected_metadata so the per-domain
        # report can slice on it without re-reading the source fixture.
        # gdb_fixtures already populates metadata["domain"] (either from
        # the fixture's metadata.domain field or by synthesising it from a
        # top-level domain field on legacy flat fixtures).

        # expected_metadata is the full metadata bag. agricultural_correctness
        # only reads expected_crop / expected_treatment / expected_region out
        # of it (those are the facet names in its API), but downstream
        # consumers (domain_report.py) need the domain too.
        expected_metadata = dict(metadata)

        result = {
            "query": case["input"],
            "response_text": case["expected_output"],     # intentionally identical
            "expected_output": case["expected_output"],   # carries the canonical answer
            "expected_metadata": expected_metadata,       # facet expectations
            "context": [],                                # retrieval_context not captured yet
        }

        eval_result = evaluate_response_quality(result, enabled=True)

        # Reporter context — question_id, query, expected_metadata not produced
        # by evaluate_response_quality (the metric reads them but doesn't
        # echo them back). Forward them so downstream tools (storage.py,
        # domain_report.py) can slice by domain without re-reading the
        # original fixture.
        eval_result["question_id"] = case["question_id"]
        eval_result["query"]        = case["input"]
        eval_result["expected_metadata"] = expected_metadata

        results.append(eval_result)

    # ------------------------------------------------------------------
    # 3. Build summary
    # ------------------------------------------------------------------
    summary = build_summary(results)

    # ------------------------------------------------------------------
    # 4. Print per-case table
    # ------------------------------------------------------------------
    _print_results_table(results)

    # ------------------------------------------------------------------
    # 5. Print summary block
    # ------------------------------------------------------------------
    _print_summary(summary)

    # ------------------------------------------------------------------
    # 5b. Per-domain quality report (always computed and printed; written
    #     to disk only if domain_report_md is provided)
    # ------------------------------------------------------------------
    from ajrasakha.evaluation.domain_report import build_domain_report, render_markdown
    dreport = build_domain_report(results)
    _print_domain_report(dreport)
    if domain_report_md:
        md = render_markdown(dreport)
        Path(domain_report_md).write_text(md, encoding="utf-8")
        print(f"\n[domain-report] wrote Markdown report to {domain_report_md}")

    # ------------------------------------------------------------------
    # 6. Persist + read back (opt-in via db_url; see storage.py)
    # ------------------------------------------------------------------
    if db_url:
        # Import deferred so the module is importable on hosts without
        # psycopg2 (e.g. minimal CI images that only need the runner).
        from ajrasakha.evaluation.storage import save_eval_results, get_recent_results

        inserted = save_eval_results(results, db_url)
        print(f"\n[storage] saved {inserted} row(s) to {db_url}")

        if readback > 0:
            recent = get_recent_results(db_url, limit=readback)
            print(f"[storage] read back {len(recent)} most recent row(s):")
            _print_recent_rows(recent, limit=readback)

    return results


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def _print_results_table(results: list[dict]) -> None:
    header = (
        f"{'question_id':<35} {'answer_relevancy_score':>22} {'answer_relevancy_passed':>23} "
        f"{'faithfulness_passed':>20} {'contextual_passed':>20} {'gdb_match_score':>16} {'gdb_match_method':>17} "
        f"{'agri_score':>10} {'crop':>6} {'treat':>6} {'region':>7} {'assessed':>32}"
    )
    sep = "-" * len(header)
    print(f"\n{header}")
    print(sep)
    for r in results:
        qid = r.get("question_id", r.get("query", "?")[:35])
        qid = qid[:35]
        ar_score = str(r.get("answerrelevancymetric_score", ""))
        ar_pass  = r.get("answerrelevancymetric_passed", "")
        fa_pass  = r.get("faithfulnessmetric_passed", "")
        co_pass  = r.get("contextualrelevancymetric_passed", "")
        gm_score = str(r.get("gdb_match_score_score", ""))
        gm_meth  = r.get("gdb_match_score_method", "")
        # For agricultural_correctness facets, the metric assigns 1.0 to any
        # facet whose expected_* field was not provided (unassessed). Show
        # '-' instead so a 1.0 in the table unambiguously means "this facet
        # was actually assessed and the answer matched".
        assessed = (r.get("agriculturalcorrectness_facets_assessed") or "").split(",")
        assessed_set = {x for x in assessed if x}

        def _display_facet(facet_name: str) -> str:
            score = r.get(f"agriculturalcorrectness_facets_{facet_name}", "")
            if facet_name not in assessed_set:
                return "-"
            return str(score)

        ac_score = str(r.get("agriculturalcorrectness_score", ""))
        ac_crop  = _display_facet("crop")
        ac_treat = _display_facet("treatment")
        ac_reg   = _display_facet("regional")
        ac_assd  = str(r.get("agriculturalcorrectness_facets_assessed", ""))[:32] or "(none)"
        print(
            f"{qid:<35} {ar_score:>22} {ar_pass:>23} {fa_pass:>20} {co_pass:>20} "
            f"{gm_score:>16} {gm_meth:>17} "
            f"{ac_score:>10} {ac_crop:>6} {ac_treat:>6} {ac_reg:>7} {ac_assd:>32}"
        )


def _print_summary(summary: dict) -> None:
    print("\n=== Summary ===")
    print(f"  Total cases evaluated : {summary.get('total_cases', 0)}")
    print(f"  Answer Relevancy evaluated : {summary.get('answer_relevancy_evaluated', 0)}")
    print(f"  Answer Relevancy passed    : {summary.get('answer_relevancy_passed', 0)}")
    print(f"  Answer Relevancy mean score: {summary.get('answer_relevancy_mean_score', 'N/A')}")
    print(f"  Faithfulness skipped       : {summary.get('faithfulness_skipped', 0)}")
    print(f"  Contextual Relevancy skipped: {summary.get('contextual_relevancy_skipped', 0)}")
    print(f"  gdb_match_score evaluated  : {summary.get('gdb_match_score_evaluated', 0)}")
    print(f"  gdb_match_score mean score : {summary.get('gdb_match_score_mean_score', 'N/A')}")
    print(f"  agricultural_correctness evaluated  : {summary.get('agricultural_correctness_evaluated', 0)}")
    print(f"  agricultural_correctness mean score : {summary.get('agricultural_correctness_mean_score', 'N/A')}")


def _print_domain_report(report: dict) -> None:
    """Print a compact per-domain rollup to stdout."""
    if not report["by_domain"]:
        print("\n=== Per-domain report ===")
        print("  (no cases)")
        return

    print("\n=== Per-domain quality report ===")
    print(f"  domains: {', '.join(report['domains'])}")
    print()
    print(f"  {'domain':<14} {'cases':>6} {'AR mean':>9} {'AR pass%':>10} "
          f"{'F skip':>7} {'CR skip':>8} {'gdb_mean':>9} {'agri_mean':>10}")
    print("  " + "-" * 86)
    for d in report["domains"]:
        s = report["by_domain"][d]
        ar = s["answer_relevancy"]
        ar_mean = _fmt(ar.get("mean_score"))
        ar_pr   = _fmt_pct(ar.get("pass_rate"))
        f_skip  = s["faithfulness"]["skipped"]
        cr_skip = s["contextual_relevancy"]["skipped"]
        gms = _fmt(s["gdb_match_score"].get("mean_score"))
        agm = _fmt(s["agricultural_correctness"].get("mean_score"))
        print(f"  {d:<14} {s['case_count']:>6} {ar_mean:>9} {ar_pr:>10} "
              f"{f_skip:>7} {cr_skip:>8} {gms:>9} {agm:>10}")

    # Per-facet per-domain block (only if there are assessed facets)
    any_assessed = any(
        _any_facet_assessed(report["by_domain"][d]["agricultural_correctness"]["facets"])
        for d in report["domains"]
    )
    if any_assessed:
        print()
        print(f"  {'domain':<14} {'crop pass%':>12} {'treatment pass%':>16} {'regional pass%':>15}")
        print("  " + "-" * 64)
        for d in report["domains"]:
            facets = report["by_domain"][d]["agricultural_correctness"]["facets"]
            parts = []
            for f in ("crop", "treatment", "regional"):
                v = facets[f]
                parts.append(f"{_fmt_pct(v['pass_rate']):>11} ({v['assessed']})")
            print(f"  {d:<14} {'  '.join(parts)}")


def _fmt(value) -> str:
    """Format a numeric value as a short string; None → 'N/A'."""
    if value is None:
        return "N/A"
    if isinstance(value, float):
        return f"{value:.4f}" if value < 1 else f"{value:.4f}"
    return str(value)


def _fmt_pct(value) -> str:
    """Format a 0..1 ratio as a percentage; None → 'N/A'."""
    if value is None:
        return "N/A"
    return f"{value * 100:.1f}%"


def _any_facet_assessed(facets: dict) -> bool:
    return any(f.get("assessed", 0) > 0 for f in facets.values())


def _print_recent_rows(rows: list[dict], limit: int) -> None:
    """Pretty-print rows returned by get_recent_results()."""
    if not rows:
        print("  (no rows)")
        return
    cols = ["id", "question_id", "answer_relevancy_score", "answer_relevancy_passed",
            "faithfulness_status", "contextual_relevancy_status", "created_at"]
    widths = {"id": 4, "question_id": 32, "answer_relevancy_score": 14,
              "answer_relevancy_passed": 14, "faithfulness_status": 14,
              "contextual_relevancy_status": 14, "created_at": 26}
    header = "  " + "  ".join(f"{c:<{widths[c]}}" for c in cols)
    sep = "  " + "  ".join("-" * widths[c] for c in cols)
    print(header)
    print(sep)
    for row in rows[:limit]:
        line = "  " + "  ".join(
            f"{str(row.get(c, ''))[:widths[c]]:<{widths[c]}}" for c in cols
        )
        print(line)




# ===========================================================================
# CSV output helper (must be defined before the __main__ block below)
# ===========================================================================

def _write_csv(results: list[dict], path: str) -> None:
    """
    Write per-case eval results as CSV.

    The output schema mirrors the field set produced by
    ajrasakha.evaluation.report.write_csv_report for live runs —
    same column order, same per-case granularity. Stable suite readers
    and downstream dashboards can treat both CSVs the same way.

    Parameters
    ----------
    results : list[dict]
        Per-case result dicts from evaluate_response_quality() (as
        returned by run_ground_truth_eval).
    path : str
        Destination path. Parent directories are created if needed.
    """
    import csv as _csv
    from pathlib import Path as _Path

    out = _Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    if not results:
        # Write an empty file with just a header so downstream readers
        # don't break; the absence of rows is the signal.
        with out.open("w", encoding="utf-8", newline="") as f:
            f.write("question_id\n")
        return

    # Stable column order: question_id first (for humans/grep), then the
    # full key set from results[0].keys() in insertion order. We DON'T
    # alphabetize — that would break the existing CSV readers in
    # run_stable_suite.py that key off specific column names.
    fieldnames = list(results[0].keys())
    # Make sure question_id is always first for readability.
    if "question_id" in fieldnames and fieldnames[0] != "question_id":
        fieldnames.remove("question_id")
        fieldnames.insert(0, "question_id")

    with out.open("w", encoding="utf-8", newline="") as f:
        writer = _csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in results:
            writer.writerow(row)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import os
    parser = argparse.ArgumentParser(
        description="Run the ground-truth evaluation pipeline against a GDB-derived JSON fixture file."
    )
    parser.add_argument(
        "fixture",
        nargs="?",
        default=None,
        help=(
            "Path to a gdb_ground_truth*.json fixture file. "
            "Defaults to tests/fixtures/gdb_ground_truth_sample.json."
        ),
    )
    parser.add_argument(
        "--db-url",
        default=None,
        help=(
            "DB-API 2.0 URL to persist results to (e.g. "
            "'postgresql://user:***@host:5432/db' or 'sqlite:///path.db'). "
            "If omitted, storage is skipped entirely (default)."
        ),
    )
    parser.add_argument(
        "--readback",
        type=int,
        default=0,
        help=(
            "After saving, read back the N most recent rows and print them. "
            "Requires --db-url. Default 0 (no read-back)."
        ),
    )
    parser.add_argument(
        "--domain-report-md",
        default=None,
        help=(
            "Write a per-domain quality report (Markdown) to this path. "
            "If omitted, the report is still printed to stdout but not "
            "written to disk."
        ),
    )
    parser.add_argument(
        "--csv-out",
        default=None,
        help=(
            "Write per-case eval results as CSV to this path. Used by the "
            "stable suite (tests/run_stable_suite.py) for Layer 4 integration. "
            "If omitted, no CSV is written."
        ),
    )
    args = parser.parse_args()

    if args.fixture is None:
        fixture = (
            Path(__file__).resolve().parents[2]
            / "tests"
            / "fixtures"
            / "gdb_ground_truth_sample.json"
        )
    else:
        fixture = Path(args.fixture)

    judge = os.environ.get("EVAL_JUDGE", "mock")
    print(f"EVAL_JUDGE={judge}")
    print(f"Fixture: {fixture}")
    if args.db_url:
        print(f"DB URL : {args.db_url}")
    if args.readback:
        print(f"Readback: {args.readback} most recent row(s)")
    if args.domain_report_md:
        print(f"Domain report (md): {args.domain_report_md}")
    if args.csv_out:
        print(f"CSV out : {args.csv_out}")

    try:
        results = run_ground_truth_eval(
            fixture,
            judge=judge,
            db_url=args.db_url,
            readback=args.readback,
            domain_report_md=args.domain_report_md,
        )
    except GDBFixtureError as e:
        print(f"GDBFixtureError: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise

    # ------------------------------------------------------------------
    # Optional CSV dump — for integration with tests/run_stable_suite.py
    # and any other CI tool that wants machine-readable per-case results.
    # The CSV uses the same flat dict that evaluate_response_quality
    # returns (same keys as the live evaluation_report_*.csv produced
    # by ajrasakha.evaluation.run), so downstream readers don't need
    # to special-case ground-truth vs live runs.
    # ------------------------------------------------------------------
    if args.csv_out:
        _write_csv(results, args.csv_out)
        print(f"\n[csv] wrote per-case results to {args.csv_out}")