"""
test_stable_suite_layer4.py — tests Layer 4 (Answer Quality) integration
in tests/run_stable_suite.py.

Verifies:
  - run_ground_truth.py --csv-out writes a CSV with the expected schema
  - run_stable_suite.py's Layer 4 command is registered
  - read_report_rows() correctly reads Layer 4 CSVs using
    answerrelevancymetric_passed as the pass criterion
  - Stable suite COMMANDS list now has 4 layers (was 3)
"""

from __future__ import annotations

import csv
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

_AI_ROOT = Path(__file__).resolve().parents[1]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

os.environ.setdefault("EVAL_JUDGE", "mock")

from ajrasakha.evaluation import judge as jm
jm._JUDGE_CACHE = None

# Import lazy so module-level state doesn't conflict
import importlib


# ===========================================================================
# Part 1: --csv-out produces a valid CSV
# ===========================================================================

def test_csv_out_produces_per_case_csv():
    """The runner's _write_csv helper produces a CSV with the expected columns.

    Note: --csv-out is a CLI-only flag (handled in if __name__ block), so we
    test the underlying _write_csv helper directly with results from the
    run_ground_truth_eval() function call.
    """
    from ajrasakha.evaluation.run_ground_truth import run_ground_truth_eval, _write_csv
    if "ajrasakha.evaluation.answer_eval" in sys.modules:
        importlib.reload(sys.modules["ajrasakha.evaluation.answer_eval"])
    if "ajrasakha.evaluation.run_ground_truth" in sys.modules:
        importlib.reload(sys.modules["ajrasakha.evaluation.run_ground_truth"])

    tmp = Path(tempfile.gettempdir()) / "ps3_layer4_test.csv"
    if tmp.exists():
        tmp.unlink()

    results = run_ground_truth_eval(
        fixture_path=_AI_ROOT / "tests" / "fixtures" / "gdb_ground_truth_sample_6domains.json",
        judge="mock",
        db_url=None,
        readback=0,
        domain_report_md=None,
    )

    # Now write the CSV via the helper (the same call the CLI makes after --csv-out)
    _write_csv(results, str(tmp))
    assert tmp.exists(), f"CSV not written to {tmp}"

    with tmp.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    # 12 cases in the 6-domain fixture
    assert len(rows) == 12, f"expected 12 rows, got {len(rows)}"

    # Required columns from the 5 metric families
    required_columns = {
        "question_id", "query",
        "answerrelevancymetric_score", "answerrelevancymetric_passed",
        "faithfulnessmetric_passed", "contextualrelevancymetric_passed",
        "gdb_match_score_score", "gdb_match_score_method",
        "agriculturalcorrectness_score",
        "agriculturalcorrectness_facets_crop",
        "agriculturalcorrectness_facets_treatment",
        "agriculturalcorrectness_facets_regional",
        "agriculturalcorrectness_facets_assessed",
    }
    actual_columns = set(rows[0].keys())
    missing = required_columns - actual_columns
    assert not missing, f"CSV missing required columns: {missing}"

    # question_id first (readability invariant)
    fieldnames = reader.fieldnames
    assert fieldnames[0] == "question_id", f"first column must be question_id, got {fieldnames[0]}"

    # All AnswerRelevancy rows in smoke-run should be PASS
    pass_count = sum(1 for r in rows if r["answerrelevancymetric_passed"] == "PASS")
    assert pass_count == 12, f"expected 12 AR-passed rows, got {pass_count}"

    print(f"  _write_csv produced {len(rows)} rows, "
          f"{len(fieldnames)} columns, all 12 AnswerRelevancy PASS")

    tmp.unlink()


def test_csv_out_empty_results_produces_just_header():
    """Empty input list writes a CSV with question_id header but no data rows."""
    from ajrasakha.evaluation import storage as _storage  # not used; ensures importable
    # Empty case: just check the helper directly
    import importlib
    if "ajrasakha.evaluation.run_ground_truth" in sys.modules:
        mod = importlib.reload(sys.modules["ajrasakha.evaluation.run_ground_truth"])
    else:
        from ajrasakha.evaluation import run_ground_truth as mod

    tmp = Path(tempfile.gettempdir()) / "ps3_layer4_empty_test.csv"
    if tmp.exists():
        tmp.unlink()

    mod._write_csv([], str(tmp))
    assert tmp.exists()

    with tmp.open(encoding="utf-8") as f:
        first_line = f.readline().strip()
    assert first_line == "question_id", f"empty CSV header must be 'question_id', got {first_line!r}"
    print(f"  empty results → CSV with single 'question_id' header line")
    tmp.unlink()


# ===========================================================================
# Part 2: run_stable_suite.py registration + Layer 4 dispatch
# ===========================================================================

def test_run_stable_suite_has_4_layers():
    """The stable suite must register Layer 4 (Answer Quality)."""
    from tests import run_stable_suite
    if "tests.run_stable_suite" in sys.modules:
        importlib.reload(sys.modules["tests.run_stable_suite"])

    layers = [c["layer"] for c in run_stable_suite.COMMANDS]
    assert "Layer 4 - Answer Quality" in layers, (
        f"Layer 4 not registered; got layers: {layers}"
    )
    assert len(layers) == 4, f"expected 4 layers, got {len(layers)}: {layers}"
    print(f"  stable suite has 4 layers: {layers}")


def test_layer4_command_writes_csv_via_subprocess():
    """Run the Layer 4 command directly and confirm it produces a CSV
    with the expected number of rows and pass values."""
    from tests import run_stable_suite
    if "tests.run_stable_suite" in sys.modules:
        importlib.reload(sys.modules["tests.run_stable_suite"])

    layer4 = next(
        (c for c in run_stable_suite.COMMANDS if c["layer"].startswith("Layer 4")),
        None,
    )
    assert layer4 is not None, "Layer 4 not found in COMMANDS"

    # Resolve the report path and clear it
    report_path = Path(layer4["report"])
    if report_path.exists():
        report_path.unlink()

    # Run the command (uses mock judge from env)
    env = dict(os.environ)
    env["EVAL_JUDGE"] = "mock"
    completed = subprocess.run(
        layer4["command"],
        cwd=str(run_stable_suite.ROOT),
        capture_output=True,
        text=True,
        env=env,
        timeout=120,
    )
    assert completed.returncode == 0, (
        f"Layer 4 command failed with rc={completed.returncode}\n"
        f"stdout: {completed.stdout[-500:]}\n"
        f"stderr: {completed.stderr[-500:]}"
    )
    assert report_path.exists(), (
        f"Layer 4 CSV not written to {report_path}\n"
        f"stdout: {completed.stdout[-500:]}"
    )

    with report_path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 12, f"expected 12 rows, got {len(rows)}"

    # Layer 4 should report PASS for AnswerRelevancy on every row
    pass_count = sum(1 for r in rows if r["answerrelevancymetric_passed"] == "PASS")
    assert pass_count == 12, f"expected 12 AR-passed rows, got {pass_count}"

    # Now exercise the reader as run_stable_suite would
    layer4_rows = run_stable_suite.read_report_rows(layer4["layer"], report_path)
    pass_in_layer = sum(1 for r in layer4_rows if r["status"] == "PASS")
    assert pass_in_layer == 12, (
        f"reader produced {pass_in_layer} PASS rows for Layer 4, expected 12"
    )
    print(f"  Layer 4 subprocess ran successfully: {pass_in_layer} PASS rows, "
          f"{len(rows)} data rows in CSV")


def test_read_report_rows_layer4_uses_ar_passed():
    """Confirm the read_report_rows layer-aware logic: Layer 4 uses
    answerrelevancymetric_passed, not the legacy 'passed' column."""
    from tests import run_stable_suite
    if "tests.run_stable_suite" in sys.modules:
        importlib.reload(sys.modules["tests.run_stable_suite"])

    # Build a synthetic Layer 4 CSV
    tmp = Path(tempfile.gettempdir()) / "ps3_reader_layer4_test.csv"
    if tmp.exists():
        tmp.unlink()
    with tmp.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "question_id", "answerrelevancymetric_passed", "passed",
        ])
        writer.writeheader()
        # AR=PASS but legacy passed=False — Layer 4 reader should prefer AR
        writer.writerow({
            "question_id": "q1",
            "answerrelevancymetric_passed": "PASS",
            "passed": "false",
        })
        # AR=FAIL — Layer 4 reader should mark FAIL
        writer.writerow({
            "question_id": "q2",
            "answerrelevancymetric_passed": "FAIL",
            "passed": "true",
        })
    rows = run_stable_suite.read_report_rows("Layer 4 - Answer Quality", tmp)
    assert len(rows) == 2
    # First row: AR=PASS, legacy=false → Layer 4 reader says PASS (prefers AR)
    assert rows[0]["status"] == "PASS", (
        f"Layer 4 row 1: expected PASS (AnswerRelevancy), got {rows[0]['status']!r}"
    )
    # Second row: AR=FAIL, legacy=true → Layer 4 reader says FAIL (prefers AR)
    assert rows[1]["status"] == "FAIL", (
        f"Layer 4 row 2: expected FAIL (AnswerRelevancy), got {rows[1]['status']!r}"
    )
    print("  Layer 4 reader correctly prefers answerrelevancymetric_passed "
          "over legacy 'passed' column")
    tmp.unlink()


def test_read_report_rows_layer1_uses_legacy_passed():
    """Confirm the reader still uses the legacy 'passed' column for Layers 1-3."""
    from tests import run_stable_suite
    if "tests.run_stable_suite" in sys.modules:
        importlib.reload(sys.modules["tests.run_stable_suite"])

    tmp = Path(tempfile.gettempdir()) / "ps3_reader_legacy_test.csv"
    if tmp.exists():
        tmp.unlink()
    with tmp.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["question_id", "passed"])
        writer.writeheader()
        writer.writerow({"question_id": "q1", "passed": "PASS"})
    rows = run_stable_suite.read_report_rows("Layer 1 - API Contracts", tmp)
    assert len(rows) == 1
    assert rows[0]["status"] == "PASS", (
        f"Layer 1 legacy column: expected PASS, got {rows[0]['status']!r}"
    )
    print("  Layer 1 reader still uses legacy 'passed' column")
    tmp.unlink()


# ===========================================================================
# Entry point
# ===========================================================================

def main() -> int:
    print("=" * 75)
    print("Layer 4 (Answer Quality) integration test suite")
    print("=" * 75)
    print()

    tests = [
        ("--csv-out produces per-case CSV",            test_csv_out_produces_per_case_csv),
        ("--csv-out empty results → header only",      test_csv_out_empty_results_produces_just_header),
        ("run_stable_suite has 4 layers",               test_run_stable_suite_has_4_layers),
        ("Layer 4 subprocess writes CSV correctly",    test_layer4_command_writes_csv_via_subprocess),
        ("Layer 4 reader uses AR-passed column",        test_read_report_rows_layer4_uses_ar_passed),
        ("Layer 1 reader still uses legacy 'passed'",  test_read_report_rows_layer1_uses_legacy_passed),
    ]

    failures = 0
    for name, fn in tests:
        print(f"[{name}]")
        try:
            fn()
            print(f"  PASS\n")
        except AssertionError as e:
            print(f"  FAIL: {e}\n")
            failures += 1
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}\n")
            import traceback
            traceback.print_exc()
            failures += 1

    print("=" * 75)
    if failures == 0:
        print(f"RESULT: {len(tests)}/{len(tests)} tests passed")
        return 0
    print(f"RESULT: {failures} test(s) FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())