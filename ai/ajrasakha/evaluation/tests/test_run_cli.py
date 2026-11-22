"""CLI tests for the live-mode judge preflight and quality opt-out."""

import sys

import pytest

from ajrasakha.evaluation import run as run_module


def _patch_main_dependencies(monkeypatch):
    calls = []

    monkeypatch.setattr(
        run_module,
        "TEST_CASES",
        [{"name": "stable_case", "stable": True}],
    )

    def fake_run_case(case, mode, *, answer_quality=None):
        calls.append(
            {
                "case": case,
                "mode": mode,
                "answer_quality": answer_quality,
            }
        )
        return {}

    monkeypatch.setattr(run_module, "run_case", fake_run_case)
    monkeypatch.setattr(run_module, "write_csv_report", lambda *a, **k: None)
    monkeypatch.setattr(run_module, "build_summary", lambda *a, **k: {})
    return calls


def _set_argv(monkeypatch, *args):
    monkeypatch.setattr(sys, "argv", ["run.py", *args])


def test_live_skip_answer_quality_does_not_require_judge(monkeypatch):
    def judge_must_not_be_read():
        raise AssertionError("judge configuration must not be read")

    monkeypatch.setattr(run_module, "get_judge_model", judge_must_not_be_read)
    calls = _patch_main_dependencies(monkeypatch)
    _set_argv(
        monkeypatch,
        "--mode",
        "live",
        "--stable-only",
        "--skip-answer-quality",
    )

    run_module.main()

    assert len(calls) == 1
    assert calls[0]["mode"] == "live"
    assert calls[0]["answer_quality"] is False


def test_live_quality_still_requires_a_working_judge(monkeypatch):
    judge_calls = []

    def missing_judge():
        judge_calls.append(True)
        raise run_module.JudgeSetupError("JUDGE_API_KEY is not set")

    monkeypatch.setattr(run_module, "get_judge_model", missing_judge)
    calls = _patch_main_dependencies(monkeypatch)
    _set_argv(monkeypatch, "--mode", "live")

    with pytest.raises(SystemExit) as exc_info:
        run_module.main()

    assert exc_info.value.code == 2
    assert judge_calls == [True]
    assert calls == []


def test_mock_mode_never_reads_judge_configuration(monkeypatch):
    def judge_must_not_be_read():
        raise AssertionError("judge configuration must not be read")

    monkeypatch.setattr(run_module, "get_judge_model", judge_must_not_be_read)
    calls = _patch_main_dependencies(monkeypatch)
    _set_argv(monkeypatch, "--mode", "mock")

    run_module.main()

    assert len(calls) == 1
    assert calls[0]["answer_quality"] is False
