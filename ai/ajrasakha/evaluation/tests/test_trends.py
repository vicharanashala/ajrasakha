import pytest

from ajrasakha.evaluation.trends_store import log_run, fetch_history
from ajrasakha.evaluation.generate_trend_report import (
    generate_trend_report,
    _detect_regressions,
    render_html,
)


@pytest.fixture(autouse=True)
def force_sqlite_backend(monkeypatch):
    """These tests assert against an isolated tmp_path SQLite file. Without this,
    a real DATABASE_URL in the environment (e.g. ai/.env, used for the actual
    Postgres backend - see test_trends_postgres_backend.py) would divert
    log_run/fetch_history to Postgres and silently ignore db_path."""
    monkeypatch.delenv("DATABASE_URL", raising=False)


def test_two_runs_logged_to_temp_db_produce_ordered_history(tmp_path):
    db_path = tmp_path / "history.db"

    log_run(
        {"Weather": {"FaithfulnessMetric": 0.91, "AnswerRelevancyMetric": 0.88}},
        mode="live",
        db_path=db_path,
        run_timestamp="2026-07-20T10:00:00+00:00",
    )
    log_run(
        {"Weather": {"FaithfulnessMetric": 0.74, "AnswerRelevancyMetric": 0.85}},
        mode="live",
        db_path=db_path,
        run_timestamp="2026-07-21T10:00:00+00:00",
    )

    runs = fetch_history(db_path=db_path)

    assert len(runs) == 2
    assert runs[0]["run_timestamp"] == "2026-07-20T10:00:00+00:00"
    assert runs[1]["run_timestamp"] == "2026-07-21T10:00:00+00:00"
    assert runs[0]["domains"]["Weather"]["FaithfulnessMetric"] == 0.91
    assert runs[1]["domains"]["Weather"]["FaithfulnessMetric"] == 0.74


def test_regression_detected_on_drop_over_threshold(tmp_path):
    db_path = tmp_path / "history.db"

    log_run(
        {"Weather": {"FaithfulnessMetric": 0.91}},
        db_path=db_path,
        run_timestamp="2026-07-20T10:00:00+00:00",
    )
    log_run(
        {"Weather": {"FaithfulnessMetric": 0.74}},
        db_path=db_path,
        run_timestamp="2026-07-21T10:00:00+00:00",
    )

    runs = fetch_history(db_path=db_path)
    regressions = _detect_regressions(runs)

    assert len(regressions) == 1
    assert regressions[0]["domain"] == "Weather"
    assert regressions[0]["metric"] == "FaithfulnessMetric"
    assert regressions[0]["prev_score"] == 0.91
    assert regressions[0]["new_score"] == 0.74


def test_no_regression_when_drop_under_threshold(tmp_path):
    db_path = tmp_path / "history.db"

    log_run({"Weather": {"FaithfulnessMetric": 0.90}}, db_path=db_path, run_timestamp="t1")
    log_run({"Weather": {"FaithfulnessMetric": 0.85}}, db_path=db_path, run_timestamp="t2")  # ~5.6% drop

    runs = fetch_history(db_path=db_path)
    regressions = _detect_regressions(runs)

    assert regressions == []


def test_improvement_is_never_flagged_as_regression(tmp_path):
    db_path = tmp_path / "history.db"

    log_run({"Weather": {"FaithfulnessMetric": 0.60}}, db_path=db_path, run_timestamp="t1")
    log_run({"Weather": {"FaithfulnessMetric": 0.95}}, db_path=db_path, run_timestamp="t2")

    runs = fetch_history(db_path=db_path)
    regressions = _detect_regressions(runs)

    assert regressions == []


def test_generate_trend_report_writes_html_with_both_data_points_and_alert(tmp_path):
    db_path = tmp_path / "history.db"
    output_path = tmp_path / "quality_trends.html"

    log_run(
        {"Weather": {"FaithfulnessMetric": 0.91}},
        db_path=db_path,
        run_timestamp="2026-07-20T10:00:00+00:00",
    )
    log_run(
        {"Weather": {"FaithfulnessMetric": 0.74}},
        db_path=db_path,
        run_timestamp="2026-07-21T10:00:00+00:00",
    )

    result_path = generate_trend_report(db_path=db_path, output_path=output_path)

    assert result_path == output_path
    content = output_path.read_text(encoding="utf-8")

    assert "0.91" in content
    assert "0.74" in content
    assert "Quality regressions detected" in content
    assert "Weather" in content
    assert "FaithfulnessMetric" in content
    assert "dropped 0.91 → 0.74" in content


def test_generate_trend_report_shows_ok_banner_when_no_regressions(tmp_path):
    db_path = tmp_path / "history.db"
    output_path = tmp_path / "quality_trends.html"

    log_run({"Weather": {"FaithfulnessMetric": 0.90}}, db_path=db_path, run_timestamp="t1")

    generate_trend_report(db_path=db_path, output_path=output_path)
    content = output_path.read_text(encoding="utf-8")

    assert "No regressions detected." in content


def test_render_html_handles_empty_history():
    html_content = render_html([], [])

    assert "No quality data logged yet." in html_content


def test_log_run_with_empty_breakdown_writes_no_rows_but_does_not_crash(tmp_path):
    db_path = tmp_path / "history.db"

    timestamp = log_run({}, mode="mock", db_path=db_path)

    assert timestamp
    runs = fetch_history(db_path=db_path)
    assert runs == []
