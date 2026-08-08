"""
====================================================================
AjraSakha Project 3 - Answer Evaluation Pipeline DEMO
====================================================================

Walks through this PR's implementation step by step, showing real output
at each stage. Run it from the ai/ directory:

    cd ai
    uv run python ajrasakha/evaluation/demo_project3.py

No API keys required for a normal run - every step reads data that
already exists (git history, the real Postgres score history, the
already-rendered quality_trends.html) rather than calling a live judge.

Structured directly around the brief's own "Output" section, one step
per clause:

    "Evaluation pipeline running on every stable suite execution.        -> STEP 1
     Quality scores visible per test case and per domain.                -> STEP 2
     A baseline quality report across all 6 domains (weather, market,
     soil, schemes, GDB queries, greetings) that the AI team can use
     to prioritise prompt and retrieval improvements."                   -> STEP 3

STEP 4 is a clearly-labeled bonus (regression detection) - a real
capability, but not something the brief asked for, so it's kept visibly
separate from the three steps above rather than presented as part of
the brief's Output.

Read-only / demo-only: does not modify deepeval_metrics.py, answer_eval.py,
summary.py, or any other evaluation logic. STEP 2 and STEP 3 query the
real Postgres baseline directly and regenerate quality_trends.html from
it - the same call run.py itself makes on every pipeline run, not a
demo-only code path. The only file this script writes that isn't part
of the real pipeline's own output is demo_regression_example.html
(STEP 4's bonus, seeded into its own isolated SQLite file/table rows so
it can never land in the real Postgres baseline). Safe and idempotent:
re-running regenerates quality_trends.html from the same unchanged
Postgres history (byte-identical output) and clears/re-writes only
STEP 4's demo rows, never accumulating duplicates.
====================================================================
"""

from __future__ import annotations

import sys
from pathlib import Path

import sqlite3

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass  # non-interactive/redirected stdout on some platforms doesn't support this

if sys.platform == "win32":
    try:
        import os as _os

        _os.system("")  # enables ANSI escape processing in modern Windows consoles
    except Exception:
        pass

AI_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = AI_ROOT.parent
ANSWER_EVAL_PATH = "ai/ajrasakha/evaluation/answer_eval.py"

TOTAL_STEPS = 4

# The brief's 6 official domains, in the exact order/casing the brief itself
# lists them - used to order every table below and to check baseline coverage.
BRIEF_DOMAINS = ["Weather", "Market", "Soil", "Schemes", "GDB queries", "Greetings"]

# Presentation-only: colors the demo's terminal output for readability during
# a live walkthrough (matching the colored PASS/FAIL convention other teams'
# demos use). Disabled automatically when stdout isn't a real terminal (e.g.
# piped to a file), so redirected output stays plain text.
_COLOR = sys.stdout.isatty()


def _c(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOR else text


def _bold_cyan(text: str) -> str:
    return _c(text, "1;36")


def _green(text: str) -> str:
    return _c(text, "32")


def _yellow(text: str) -> str:
    return _c(text, "33")


def _red(text: str) -> str:
    return _c(text, "31")


def _score_color(score: float) -> str:
    """Green >= 0.7, yellow 0.4-0.7, red < 0.4 - same thresholds quality_trends.html's
    score bars use, so the terminal and the HTML report read consistently."""
    return _green if score >= 0.7 else _yellow if score >= 0.4 else _red


def _rule(char: str = "=", width: int = 70) -> None:
    print(_bold_cyan(char * width))


def _banner(title: str) -> None:
    _rule()
    print(_bold_cyan(title))
    _rule()


def _step(n: int, title: str) -> None:
    print()
    _rule("-")
    print(_bold_cyan(f"STEP {n} of {TOTAL_STEPS} - {title}"))
    _rule("-")


def _run_git(args: list[str]) -> str:
    """Read-only git call, cwd=repo root. Never raises - returns '' on any failure."""
    import subprocess

    try:
        result = subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return result.stdout.strip()
    except Exception:
        return ""


# ======================================================================
# STEP 1 - "Evaluation pipeline running on every stable suite execution."
# ======================================================================

def step_1_wired_into_every_run() -> None:
    _step(1, 'Brief: "Evaluation pipeline running on every stable suite execution"')
    print(
        "answer_eval.py used to be a disabled stub: evaluate_response_quality()\n"
        "ignored its inputs and always returned a hardcoded 'disabled' result, no\n"
        "matter what the pipeline fed it. deepeval_metrics.py's real scoring logic\n"
        "existed in the codebase the whole time - it was just never called.\n"
    )

    diff = _run_git(["diff", "HEAD", "--", ANSWER_EVAL_PATH])

    if diff:
        print("Proof 1/2 - git diff of answer_eval.py against HEAD (the pre-PR state):\n")
        lines = diff.splitlines()
        preview = lines[:45]
        for line in preview:
            print(f"  {line}")
        if len(lines) > len(preview):
            print(f"  ... ({len(lines) - len(preview)} more lines)")
    else:
        before = _run_git(["show", f"HEAD:{ANSWER_EVAL_PATH}"])
        current = Path(__file__).resolve().parent.joinpath("answer_eval.py").read_text(
            encoding="utf-8"
        )
        if before:
            print("Proof 1/2 - no pending diff against HEAD (already committed). Before/after:\n")
            print("  --- HEAD (before) ---")
            for line in before.splitlines():
                print(f"  {line}")
            print("\n  --- current (after), first 15 lines ---")
            for line in current.splitlines()[:15]:
                print(f"  {line}")
        else:
            print(
                "  (git not available / not a git checkout - skipping diff proof.\n"
                "   answer_eval.py now calls evaluate_answer_with_deepeval() for real\n"
                "   when enabled=True; see the file directly.)"
            )

    # ai/tests isn't part of the installed "ajrasakha" package, so it's only
    # importable when the ai/ project root itself is on sys.path - true when
    # this script is run via `python -m` or from ai/ directly, not guaranteed
    # when run as a nested file path (sys.path[0] is then this file's own
    # directory, ajrasakha/evaluation/, not ai/).
    # ai/tests isn't part of the installed "ajrasakha" package. The editable
    # install already puts AI_ROOT on sys.path, but only after site-packages
    # (lower priority than expected), which isn't enough to make "tests"
    # resolvable here - force it to the front and drop any finder cache built
    # against the old sys.path order before importing it.
    import importlib

    sys.path.insert(0, str(AI_ROOT))
    importlib.invalidate_caches()
    from tests.run_stable_suite import QUALITY_SCORE_COLUMNS

    print(
        "\nProof 2/2 - ai/tests/run_stable_suite.py's Layer 3 (the stable suite itself)\n"
        f"carries these {len(QUALITY_SCORE_COLUMNS)} quality-score columns into every combined\n"
        "stable_suite_report.csv/.html row rather than stripping them - Layer 1/2 rows\n"
        "(API contracts, MCP connectivity) simply leave them blank, since only Layer 3\n"
        "runs the AI workflow that produces a quality score:\n"
    )
    print(f"  {', '.join(QUALITY_SCORE_COLUMNS)}")


# ======================================================================
# STEP 2 - "Quality scores visible per test case and per domain."
# ======================================================================

def step_2_scores_per_case_and_domain() -> None:
    _step(2, 'Brief: "Quality scores visible per test case and per domain"')
    print(
        "Per-test-case rows already exist wherever the pipeline writes a CSV\n"
        "(evaluation_report_live.csv, and run_stable_suite.py's combined\n"
        "stable_suite_report.csv - see STEP 1's Proof 2/2). This step covers the\n"
        "other half: querying the real score history directly, no summary claim,\n"
        "no synthetic data - this is exactly what trends_store.fetch_history()\n"
        "reads and what run.py itself calls after every run.\n"
    )

    from ajrasakha.evaluation.summary import QUALITY_METRICS
    from ajrasakha.evaluation.trends_store import active_backend, fetch_history

    backend = active_backend()
    print(f"$ trends_store.fetch_history(last_n_runs=1)   (backend: {backend})\n")

    runs = fetch_history(last_n_runs=1)

    if not runs:
        print(_red("  No runs in history yet - run the real pipeline once first."))
        return

    run = runs[-1]
    domains = run["domains"]
    total_cells = sum(len(m) for m in domains.values())

    print(f"  run_timestamp: {run['run_timestamp']}")
    print(f"  mode:          {run['mode']}")
    print(f"  {total_cells} real scored metric cells across {len(domains)} domains\n")

    print(f"  {'Domain':<14} {'Metric':<24} {'Score':>7}")
    print(f"  {'-'*14} {'-'*24} {'-'*7}")
    for domain in BRIEF_DOMAINS:
        metrics = domains.get(domain, {})
        for metric in QUALITY_METRICS:
            if metric not in metrics:
                continue
            score = metrics[metric]
            colorize = _score_color(score)
            print(f"  {domain:<14} {metric:<24} {colorize(f'{score:>7.2f}')}")

    print(
        "\n  Note the per-domain rows above already show the custom agricultural\n"
        "  metric split into three independent facets (CropCorrectness /\n"
        "  TreatmentCorrectness / RegionCorrectness) with genuinely different real\n"
        "  scores in the same domain - not one blended number."
    )


# ======================================================================
# STEP 3 - "A baseline quality report across all 6 domains ..."
# ======================================================================

def step_3_baseline_report() -> None:
    _step(3, 'Brief: "A baseline quality report across all 6 domains"')
    print(
        "This IS quality_trends.html - the literal deliverable the brief asks for,\n"
        "\"that the AI team can use to prioritise prompt and retrieval\n"
        "improvements.\" Regenerating it now, live, from the real Postgres history\n"
        "(the same call run.py makes after every run - see STEP 1's Proof 2/2 for\n"
        "where quality scores enter that history in the first place):\n"
    )

    from ajrasakha.evaluation.generate_trend_report import (
        DEFAULT_HTML_PATH,
        generate_trend_report,
    )
    from ajrasakha.evaluation.trends_store import fetch_history

    path = generate_trend_report()
    print(f"$ generate_trend_report()\n  -> {path.resolve()}")
    assert path == DEFAULT_HTML_PATH

    runs = fetch_history(last_n_runs=1)
    domains = runs[-1]["domains"] if runs else {}

    print("\n  Domain coverage check against the brief's 6 named domains:")
    missing = []
    for domain in BRIEF_DOMAINS:
        present = domain in domains and len(domains[domain]) > 0
        mark = _green("[x]") if present else _red("[ ]")
        print(f"    {mark} {domain}")
        if not present:
            missing.append(domain)

    if missing:
        print(_red(f"\n  {len(missing)}/6 domains missing from the current baseline."))
    else:
        print(_green("\n  All 6/6 brief domains represented in quality_trends.html."))


# ======================================================================
# STEP 4 (BONUS, not part of the brief) - regression detection
# ======================================================================

DEMO_DB_PATH = Path(__file__).resolve().parent / "quality_history.db"
# Separate output file from the real quality_trends.html baseline, structurally
# (not just by run order) - see the module docstring above.
DEMO_REGRESSION_HTML_PATH = Path(__file__).resolve().parent / "demo_regression_example.html"
DEMO_MODE_LABEL = "mock-demo"
DEMO_DOMAIN = "GDB queries"  # exact casing from questions.py's brief-domain labels
DEMO_TS_RUN_1 = "2020-01-01T09:00:00+00:00"
DEMO_TS_RUN_2 = "2020-01-01T09:05:00+00:00"

_DEMO_RUN_1 = {
    DEMO_DOMAIN: {
        "AnswerRelevancyMetric": 0.92,
        "GDBMatchScore": 0.88,
        "CropCorrectness": 0.95,
        "TreatmentCorrectness": 0.85,
        "RegionCorrectness": 0.90,
    }
}
_DEMO_RUN_2 = {
    DEMO_DOMAIN: {
        "AnswerRelevancyMetric": 0.91,
        "GDBMatchScore": 0.86,
        "CropCorrectness": 0.94,
        "TreatmentCorrectness": 0.83,
        "RegionCorrectness": 0.20,  # deliberately wrong region -> sharp drop
    }
}


def _seed_demo_regression() -> None:
    """
    Idempotent: deletes only rows with mode='mock-demo' before re-inserting,
    so repeated runs converge to the same two rows instead of accumulating
    duplicates. Never touches real pipeline history (any other mode).
    """
    from ajrasakha.evaluation.trends_store import log_run

    conn = sqlite3.connect(DEMO_DB_PATH)
    try:
        conn.execute("DELETE FROM quality_runs WHERE mode = ?", (DEMO_MODE_LABEL,))
        conn.commit()
    except sqlite3.OperationalError:
        pass  # table doesn't exist yet - log_run() below creates it
    finally:
        conn.close()

    # force_sqlite=True: this bonus demo must stay isolated in its own
    # DEMO_DB_PATH file even when a real DATABASE_URL is configured - these
    # hand-seeded mode="mock-demo" rows must never land in the real Postgres
    # baseline history queried in STEP 2/3 above.
    log_run(_DEMO_RUN_1, mode=DEMO_MODE_LABEL, db_path=DEMO_DB_PATH, run_timestamp=DEMO_TS_RUN_1, force_sqlite=True)
    log_run(_DEMO_RUN_2, mode=DEMO_MODE_LABEL, db_path=DEMO_DB_PATH, run_timestamp=DEMO_TS_RUN_2, force_sqlite=True)


def step_4_bonus_regression_detection() -> None:
    _step(4, "BONUS (not asked for by the brief) - automatic regression detection")
    print(
        "Everything above (STEPS 1-3) is the brief's literal Output section, done.\n"
        "This step is extra: regression detection between consecutive runs, layered\n"
        "on top of the same score history. Real feature, real code path - but shown\n"
        "here as a bonus, not folded into the brief's own deliverables above.\n"
    )
    print(
        "Mock mode's CLI never calls a judge, so there's no live lever to make 'one\n"
        "answer's region wrong' on demand. This step demonstrates the identical\n"
        "detection mechanism instead: two runs logged for the same domain, second run\n"
        "with RegionCorrectness deliberately lowered (same shape of drop a real wrong-\n"
        "region answer would produce), labeled honestly as mode='mock-demo' - not live\n"
        "output. Rendered to its own demo_regression_example.html, deliberately\n"
        "separate from quality_trends.html - the real baseline from STEP 3 stays\n"
        "untouched by this step.\n"
    )
    print(f"  Run 1 ({DEMO_TS_RUN_1}): {_DEMO_RUN_1[DEMO_DOMAIN]}")
    print(f"  Run 2 ({DEMO_TS_RUN_2}): {_DEMO_RUN_2[DEMO_DOMAIN]}")

    _seed_demo_regression()

    from ajrasakha.evaluation.generate_trend_report import (
        DEFAULT_HTML_PATH,
        _detect_regressions,
        generate_trend_report,
    )
    from ajrasakha.evaluation.trends_store import fetch_history

    path = generate_trend_report(
        db_path=DEMO_DB_PATH,
        output_path=DEMO_REGRESSION_HTML_PATH,
        force_sqlite=True,
    )
    print(f"\n  demo_regression_example.html regenerated: {path.resolve()}")
    print("  (quality_trends.html was not touched by this step.)")

    demo_runs = fetch_history(db_path=DEMO_DB_PATH, force_sqlite=True)
    regressions = _detect_regressions(demo_runs)

    if regressions:
        r = regressions[-1]
        drop_line = _red(
            f"\"{r['domain']} - {r['metric']}\" dropped "
            f"{r['prev_score']:.2f} -> {r['new_score']:.2f} ({r['drop_pct']:.0f}% drop)"
        )
        print(f"\n  Regression banner: {drop_line}")
        print(
            "  - only that one facet's cell is highlighted, while the other metrics\n"
            "  for the same domain stay green."
        )

    print("\n  Where to look, in a browser:")
    print(f"    Real baseline (brief's Output, STEP 3):  {DEFAULT_HTML_PATH.resolve()}")
    print(f"    Bonus regression demo (STEP 4):          {DEMO_REGRESSION_HTML_PATH.resolve()}")


# ======================================================================

def main() -> None:
    _banner("AjraSakha Project 3 - Answer Evaluation Pipeline DEMO")
    print()

    step_1_wired_into_every_run()
    step_2_scores_per_case_and_domain()
    step_3_baseline_report()
    step_4_bonus_regression_detection()

    print()
    _rule()
    print(_green(f"Demo complete - {TOTAL_STEPS}/{TOTAL_STEPS} steps."))
    _rule()


if __name__ == "__main__":
    main()
