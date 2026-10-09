from unittest.mock import patch

from ajrasakha.evaluation.gdb_match import evaluate_gdb_match, resolve_expected_answer


def test_resolve_expected_answer_prefers_static_pin():
    case = {
        "expected_answer": "Sow paddy nursery in June, transplant after 25-30 days.",
        "fetch_gdb_ground_truth": True,
        "query": "how to grow paddy",
    }

    assert resolve_expected_answer(case) == case["expected_answer"]


def test_resolve_expected_answer_returns_none_when_not_applicable():
    case = {"query": "what's the weather today"}

    assert resolve_expected_answer(case) is None


@patch("ajrasakha.evaluation.gdb_match.fetch_gdb_ground_truth")
def test_resolve_expected_answer_fetches_live_when_flagged(mock_fetch):
    async def _fake_fetch(*args, **kwargs):
        return "Live GDB answer text."

    mock_fetch.side_effect = _fake_fetch

    case = {
        "fetch_gdb_ground_truth": True,
        "query": "how to grow paddy in punjab",
        "location": {"state": "Punjab"},
        "expected_plan": {"crop": "Paddy"},
    }

    result = resolve_expected_answer(case)

    assert result == "Live GDB answer text."
    mock_fetch.assert_called_once()


def test_evaluate_gdb_match_not_applicable_without_ground_truth():
    result = evaluate_gdb_match("query", "some answer", expected_answer=None)

    assert result["score"] is None
    assert result["passed"] is None
    assert result["reason"] == "no_gdb_ground_truth_for_this_case"


def test_evaluate_gdb_match_flags_missing_answer():
    result = evaluate_gdb_match("query", "", expected_answer="expert answer")

    assert result["score"] == 0.0
    assert result["passed"] is False
