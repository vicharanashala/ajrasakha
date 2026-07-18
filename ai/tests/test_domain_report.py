"""
test_domain_report.py — tests the per-domain quality report generator.

Verifies:
  - build_domain_report slices results by domain (from expected_metadata.domain
    set by the loader)
  - Per-domain stats are correct: case count, AR mean + pass rate, F skip
    count, CR skip count, gdb_match mean, agricultural mean + facets
  - "unspecified" bucket catches cases missing domain
  - render_markdown produces well-formed output with all required sections
  - Integration with the runner (via run_ground_truth_eval)
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_AI_ROOT = Path(__file__).resolve().parents[1]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

os.environ.setdefault("EVAL_JUDGE", "mock")

from ajrasakha.evaluation.domain_report import (
    build_domain_report,
    render_markdown,
)


def _make_result(
    qid: str,
    domain: str | None,
    ar_score: str = "0.8",
    ar_passed: str = "PASS",
    f_passed: str = "SKIPPED",
    cr_passed: str = "SKIPPED",
    gdb_score: str = "0.7",
    gdb_method: str = "seqmatch",
    agri_score: str = "1.0",
    agri_crop: str = "1.0",
    agri_treat: str = "1.0",
    agri_reg: str = "1.0",
    agri_assessed: str = "crop,treatment,regional",
) -> dict:
    return {
        "question_id": qid,
        "answerrelevancymetric_score":     ar_score,
        "answerrelevancymetric_passed":    ar_passed,
        "faithfulnessmetric_passed":       f_passed,
        "contextualrelevancymetric_passed": cr_passed,
        "gdb_match_score_score":           gdb_score,
        "gdb_match_score_method":          gdb_method,
        "agriculturalcorrectness_score":          agri_score,
        "agriculturalcorrectness_facets_crop":   agri_crop,
        "agriculturalcorrectness_facets_treatment": agri_treat,
        "agriculturalcorrectness_facets_regional": agri_reg,
        "agriculturalcorrectness_facets_assessed": agri_assessed,
        "expected_metadata": {"domain": domain} if domain else {},
    }


# ===========================================================================
# Part 1: build_domain_report
# ===========================================================================

def test_empty_results_returns_empty_report():
    report = build_domain_report([])
    assert report["domains"] == []
    assert report["by_domain"] == {}
    assert report["totals"]["case_count"] == 0
    print("  empty results → empty report, totals.case_count=0")


def test_single_domain_basic():
    results = [
        _make_result("q1", "weather"),
        _make_result("q2", "weather"),
        _make_result("q3", "weather"),
    ]
    report = build_domain_report(results)
    assert report["domains"] == ["weather"]
    s = report["by_domain"]["weather"]
    assert s["case_count"] == 3
    assert s["answer_relevancy"]["evaluated"] == 3
    assert s["answer_relevancy"]["passed"] == 3
    assert s["answer_relevancy"]["pass_rate"] == 1.0
    assert s["answer_relevancy"]["mean_score"] == 0.8
    assert s["faithfulness"]["skipped"] == 3
    assert s["contextual_relevancy"]["skipped"] == 3
    print("  single domain: 3 cases, all pass, mean=0.8")


def test_multiple_domains_sorted_alphabetically():
    results = [
        _make_result("s1", "soil"),
        _make_result("w1", "weather"),
        _make_result("m1", "market"),
        _make_result("g1", "gdb"),
    ]
    report = build_domain_report(results)
    assert report["domains"] == ["gdb", "market", "soil", "weather"]
    print(f"  4 domains: {report['domains']}")


def test_per_domain_pass_rate_differs():
    """Domain A has 2/3 pass, Domain B has 1/3 pass."""
    results = [
        _make_result("a1", "weather", ar_passed="PASS"),
        _make_result("a2", "weather", ar_passed="PASS"),
        _make_result("a3", "weather", ar_passed="FAIL"),
        _make_result("b1", "soil",    ar_passed="PASS"),
        _make_result("b2", "soil",    ar_passed="FAIL"),
        _make_result("b3", "soil",    ar_passed="FAIL"),
    ]
    report = build_domain_report(results)
    weather = report["by_domain"]["weather"]
    soil    = report["by_domain"]["soil"]
    assert weather["answer_relevancy"]["pass_rate"] == round(2/3, 4)
    assert soil["answer_relevancy"]["pass_rate"]    == round(1/3, 4)
    print(f"  weather pass_rate={weather['answer_relevancy']['pass_rate']}, "
          f"soil pass_rate={soil['answer_relevancy']['pass_rate']}")


def test_unspecified_domain_bucket():
    """Cases without domain go into an 'unspecified' bucket."""
    results = [
        _make_result("a", "weather"),
        _make_result("b", None),  # no domain
        _make_result("c", None),  # no domain
    ]
    report = build_domain_report(results)
    assert "unspecified" in report["domains"]
    assert "weather" in report["domains"]
    assert report["by_domain"]["unspecified"]["case_count"] == 2
    print(f"  3 cases: 1 weather + 2 unspecified")


def test_faithfulness_skip_count_per_domain():
    """Some domains run faithfulness, some don't."""
    results = [
        # weather: no context → SKIPPED
        _make_result("w1", "weather", f_passed="SKIPPED"),
        # gdb: context present → PASS
        _make_result("g1", "gdb", f_passed="PASS"),
        _make_result("g2", "gdb", f_passed="PASS"),
    ]
    report = build_domain_report(results)
    assert report["by_domain"]["weather"]["faithfulness"]["skipped"] == 1
    assert report["by_domain"]["gdb"]["faithfulness"]["skipped"] == 0
    print("  weather: 1 F-skipped, gdb: 0 F-skipped")


def test_gdb_match_score_only_counts_assessed():
    """gdb_match_score is method='not_applicable' on live runs; those don't count."""
    results = [
        _make_result("a", "weather", gdb_method="seqmatch", gdb_score="0.9"),
        _make_result("b", "weather", gdb_method="not_applicable", gdb_score=""),
        _make_result("c", "weather", gdb_method="seqmatch", gdb_score="0.5"),
    ]
    report = build_domain_report(results)
    s = report["by_domain"]["weather"]
    assert s["gdb_match_score"]["evaluated"] == 2
    assert s["gdb_match_score"]["mean_score"] == round((0.9 + 0.5) / 2, 4)
    print(f"  2/3 cases have gdb_match_score; mean={(0.9+0.5)/2:.4f}")


def test_agricultural_correctness_per_facet():
    """Each facet's pass rate is computed independently."""
    results = [
        # Case 1: all 3 facets assessed, all pass
        _make_result("q1", "weather",
                     agri_score="1.0", agri_crop="1.0",
                     agri_treat="1.0", agri_reg="1.0",
                     agri_assessed="crop,treatment,regional"),
        # Case 2: only crop assessed, fails
        _make_result("q2", "weather",
                     agri_score="0.0", agri_crop="0.0",
                     agri_treat="", agri_reg="",
                     agri_assessed="crop"),
    ]
    report = build_domain_report(results)
    s = report["by_domain"]["weather"]
    facets = s["agricultural_correctness"]["facets"]
    assert facets["crop"]["assessed"] == 2
    assert facets["crop"]["passed"] == 1
    assert facets["crop"]["pass_rate"] == 0.5
    assert facets["treatment"]["assessed"] == 1
    assert facets["treatment"]["passed"] == 1
    assert facets["treatment"]["pass_rate"] == 1.0
    assert facets["regional"]["assessed"] == 1
    assert facets["regional"]["passed"] == 1
    print(f"  crop: {facets['crop']['pass_rate']} (1/2)")
    print(f"  treatment: {facets['treatment']['pass_rate']} (1/1)")
    print(f"  regional: {facets['regional']['pass_rate']} (1/1)")


def test_totals_equals_population_aggregate():
    """totals should equal the aggregate of by_domain entries (sanity check)."""
    results = [
        _make_result("a1", "weather", ar_score="0.5", ar_passed="FAIL"),
        _make_result("a2", "weather", ar_score="0.9", ar_passed="PASS"),
        _make_result("b1", "gdb",     ar_score="1.0", ar_passed="PASS"),
    ]
    report = build_domain_report(results)
    pop_mean = report["totals"]["answer_relevancy"]["mean_score"]
    # Manual mean: (0.5 + 0.9 + 1.0) / 3 = 0.8
    assert pop_mean == round((0.5 + 0.9 + 1.0) / 3, 4)
    assert report["totals"]["case_count"] == 3
    print(f"  totals.mean_score={pop_mean} matches manual {(0.5+0.9+1.0)/3:.4f}")


# ===========================================================================
# Part 2: render_markdown
# ===========================================================================

def test_render_markdown_includes_all_sections():
    results = [
        _make_result("q1", "weather"),
        _make_result("q2", "soil",    gdb_method="not_applicable", gdb_score=""),
    ]
    report = build_domain_report(results)
    md = render_markdown(report)

    # All three sections present
    assert "# Per-Domain Quality Report" in md
    assert "## Per-domain rollup" in md
    assert "## Agricultural correctness facets by domain" in md
    assert "## Totals (all domains combined)" in md

    # All domains named
    assert "weather" in md
    assert "soil" in md

    # Facet pass rates shown
    assert "crop pass%" in md
    assert "treatment pass%" in md
    assert "regional pass%" in md
    print("  markdown contains all 4 sections + 2 domains + 3 facets")


def test_render_markdown_handles_no_domains():
    report = build_domain_report([])
    md = render_markdown(report)
    assert "no results to report" in md
    print("  empty results → markdown says 'no results to report'")


def test_render_markdown_handles_no_assessed_facets():
    """When no facets are assessed across all domains, the section is omitted."""
    results = [
        _make_result("q1", "weather",
                     agri_score="", agri_crop="", agri_treat="", agri_reg="",
                     agri_assessed=""),
    ]
    report = build_domain_report(results)
    md = render_markdown(report)
    # Section omitted when there's nothing to report
    assert "## Agricultural correctness facets by domain" not in md
    # But the totals still mention it's not assessed
    assert "agricultural_correctness: evaluated=0" in md
    print("  no facets assessed → section omitted, totals mention 'evaluated=0'")


# ===========================================================================
# Part 3: integration with the runner
# ===========================================================================

def test_runner_produces_domain_report_via_run_ground_truth_eval():
    """End-to-end: runner calls build_domain_report and prints it."""
    from ajrasakha.evaluation.run_ground_truth import run_ground_truth_eval
    from ajrasakha.evaluation import judge as jm
    jm._JUDGE_CACHE = None
    import importlib
    if "ajrasakha.evaluation.answer_eval" in sys.modules:
        importlib.reload(sys.modules["ajrasakha.evaluation.answer_eval"])
    if "ajrasakha.evaluation.run_ground_truth" in sys.modules:
        importlib.reload(sys.modules["ajrasakha.evaluation.run_ground_truth"])

    tmp = Path(tempfile.gettempdir()) / "ps3_domain_report_test.md"
    if tmp.exists():
        tmp.unlink()

    results = run_ground_truth_eval(
        fixture_path=_AI_ROOT / "tests" / "fixtures" / "gdb_ground_truth_sample_multidomain.json",
        judge="mock",
        db_url=None,
        readback=0,
        domain_report_md=str(tmp),
    )
    assert len(results) == 6

    # Markdown file written
    assert tmp.exists(), f"domain report not written to {tmp}"
    md = tmp.read_text(encoding="utf-8")
    assert "# Per-Domain Quality Report" in md
    # 3 distinct domains in multidomain fixture
    for d in ("weather", "market", "soil"):
        assert d in md, f"domain {d!r} not in report"
    print(f"  runner produced markdown report at {tmp}")
    print(f"  file size: {len(md)} chars; 3 domains covered")

    tmp.unlink()


def test_6domain_fixture_covers_all_ps3_brief_domains():
    """PS3 brief requires baseline report covering Weather, Market, Soil,
    Schemes, GDB Queries, Greetings. The 6-domain fixture must cover all 6."""
    from ajrasakha.evaluation.run_ground_truth import run_ground_truth_eval
    from ajrasakha.evaluation import judge as jm
    jm._JUDGE_CACHE = None
    import importlib
    if "ajrasakha.evaluation.answer_eval" in sys.modules:
        importlib.reload(sys.modules["ajrasakha.evaluation.answer_eval"])
    if "ajrasakha.evaluation.run_ground_truth" in sys.modules:
        importlib.reload(sys.modules["ajrasakha.evaluation.run_ground_truth"])

    from ajrasakha.evaluation.domain_report import build_domain_report
    results = run_ground_truth_eval(
        fixture_path=_AI_ROOT / "tests" / "fixtures" / "gdb_ground_truth_sample_6domains.json",
        judge="mock",
        db_url=None,
        readback=0,
        domain_report_md=None,
    )
    report = build_domain_report(results)
    domains = set(report["domains"])

    required = {"gdb", "weather", "market", "soil", "schemes", "greetings"}
    missing = required - domains
    extra = domains - required
    assert not missing, f"6-domain fixture missing domains: {missing}"
    # No extras expected — the fixture is curated for PS3 brief
    assert not extra, f"6-domain fixture has unexpected domains: {extra}"

    # Each domain should have >= 1 case for a meaningful per-domain stat
    for d in required:
        assert report["by_domain"][d]["case_count"] >= 1, (
            f"domain {d!r} has 0 cases in 6-domain fixture"
        )
    print(f"  all 6 PS3-brief domains covered with >=1 case each: {sorted(domains)}")


def test_6domain_fixture_markdown_report_has_all_domains():
    """The markdown file written via --domain-report-md must list all 6 domains."""
    from ajrasakha.evaluation.run_ground_truth import run_ground_truth_eval
    from ajrasakha.evaluation import judge as jm
    jm._JUDGE_CACHE = None
    import importlib
    if "ajrasakha.evaluation.answer_eval" in sys.modules:
        importlib.reload(sys.modules["ajrasakha.evaluation.answer_eval"])
    if "ajrasakha.evaluation.run_ground_truth" in sys.modules:
        importlib.reload(sys.modules["ajrasakha.evaluation.run_ground_truth"])

    tmp = Path(tempfile.gettempdir()) / "ps3_6domain_report_test.md"
    if tmp.exists():
        tmp.unlink()
    run_ground_truth_eval(
        fixture_path=_AI_ROOT / "tests" / "fixtures" / "gdb_ground_truth_sample_6domains.json",
        judge="mock",
        db_url=None,
        readback=0,
        domain_report_md=str(tmp),
    )
    md = tmp.read_text(encoding="utf-8")
    tmp.unlink()
    for d in ("gdb", "weather", "market", "soil", "schemes", "greetings"):
        assert d in md, f"domain {d!r} missing from markdown report"
    print("  markdown report lists all 6 PS3-brief domains")


# ===========================================================================
# Entry point
# ===========================================================================

def main() -> int:
    print("=" * 75)
    print("domain_report test suite")
    print("=" * 75)
    print()

    build_tests = [
        ("empty results",                        test_empty_results_returns_empty_report),
        ("single domain basic",                 test_single_domain_basic),
        ("multiple domains sorted",              test_multiple_domains_sorted_alphabetically),
        ("per-domain pass rate differs",         test_per_domain_pass_rate_differs),
        ("unspecified bucket",                   test_unspecified_domain_bucket),
        ("faithfulness skip count",              test_faithfulness_skip_count_per_domain),
        ("gdb_match_score only counted when assessed", test_gdb_match_score_only_counts_assessed),
        ("agricultural per-facet",               test_agricultural_correctness_per_facet),
        ("totals == population aggregate",        test_totals_equals_population_aggregate),
    ]
    render_tests = [
        ("markdown has all sections",            test_render_markdown_includes_all_sections),
        ("markdown no-domains edge case",         test_render_markdown_handles_no_domains),
        ("markdown no-facets edge case",          test_render_markdown_handles_no_assessed_facets),
    ]
    integration_tests = [
        ("runner produces markdown",              test_runner_produces_domain_report_via_run_ground_truth_eval),
        ("6-domain fixture covers all PS3 brief domains", test_6domain_fixture_covers_all_ps3_brief_domains),
        ("6-domain markdown report lists all domains", test_6domain_fixture_markdown_report_has_all_domains),
    ]

    failures = 0

    print("--- build_domain_report ---")
    for name, fn in build_tests:
        print(f"[{name}]")
        try:
            fn()
            print(f"  PASS\n")
        except AssertionError as e:
            print(f"  FAIL: {e}\n")
            failures += 1
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}\n")
            failures += 1

    print("--- render_markdown ---")
    for name, fn in render_tests:
        print(f"[{name}]")
        try:
            fn()
            print(f"  PASS\n")
        except AssertionError as e:
            print(f"  FAIL: {e}\n")
            failures += 1
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}\n")
            failures += 1

    print("--- integration ---")
    for name, fn in integration_tests:
        print(f"[{name}]")
        try:
            fn()
            print(f"  PASS\n")
        except AssertionError as e:
            print(f"  FAIL: {e}\n")
            failures += 1
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}\n")
            failures += 1

    print("=" * 75)
    total = len(build_tests) + len(render_tests) + len(integration_tests)
    if failures == 0:
        print(f"RESULT: {total}/{total} tests passed")
        return 0
    print(f"RESULT: {failures} test(s) FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())