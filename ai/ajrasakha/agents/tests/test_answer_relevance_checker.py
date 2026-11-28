"""Unit tests for the answer relevance checker.

The LLM is always mocked, so these tests need no network or API keys. They cover
the input guards, the short-answer heuristic (and its boundaries), the LLM path,
the fail-open fallback, prompt truncation, and ``should_add_disclaimer``.
"""

from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from ajrasakha.agents.answer_relevance_checker import (
    RelevanceCheckOutput,
    check_answer_relevance,
    should_add_disclaimer,
)

MODULE = "ajrasakha.agents.answer_relevance_checker"

LONG_QUERY = "What crops are best for the current weather in Pathankot"  # 10 words
SHORT_QUERY = "price of wheat"  # 3 words
LONG_ANSWER = " ".join(["word"] * 25)  # 25 words, above the heuristic threshold


@contextmanager
def mocked_llm(result=None, error=None):
    """Patch the LLM factory and tracing; yield the ``ainvoke`` mock."""
    ainvoke = AsyncMock(return_value=result, side_effect=error)
    llm = MagicMock()
    llm.ainvoke = ainvoke
    model = MagicMock()
    model.with_structured_output.return_value = llm
    with (
        patch(f"{MODULE}.get_minimax_chat_model", return_value=model),
        patch(f"{MODULE}.trace_llm_request"),
        patch(f"{MODULE}.trace_llm_response"),
    ):
        yield ainvoke


# --- input guards ---------------------------------------------------------


async def test_empty_query_defaults_to_sufficient_without_llm():
    with mocked_llm() as ainvoke:
        result = await check_answer_relevance("", LONG_ANSWER)

    assert result.is_sufficient is True
    assert result.reason == "No query provided"
    ainvoke.assert_not_called()


async def test_whitespace_query_defaults_to_sufficient_without_llm():
    with mocked_llm() as ainvoke:
        result = await check_answer_relevance("   \n", LONG_ANSWER)

    assert result.is_sufficient is True
    ainvoke.assert_not_called()


async def test_empty_answer_is_insufficient_without_llm():
    with mocked_llm() as ainvoke:
        result = await check_answer_relevance(LONG_QUERY, "")

    assert result.is_sufficient is False
    assert result.reason == "No answer generated"
    assert result.missing_aspects == ["Complete answer"]
    ainvoke.assert_not_called()


async def test_whitespace_answer_is_insufficient_without_llm():
    with mocked_llm() as ainvoke:
        result = await check_answer_relevance(LONG_QUERY, "  \t ")

    assert result.is_sufficient is False
    ainvoke.assert_not_called()


async def test_empty_query_is_checked_before_empty_answer():
    """Query guard runs first, so both empty -> sufficient (nothing to judge)."""
    with mocked_llm():
        result = await check_answer_relevance("", "")

    assert result.is_sufficient is True


# --- short-answer heuristic ----------------------------------------------


async def test_complex_query_with_very_short_answer_is_insufficient():
    with mocked_llm() as ainvoke:
        result = await check_answer_relevance(LONG_QUERY, "Temperature 25C")

    assert result.is_sufficient is False
    assert result.missing_aspects == ["Detailed answer"]
    assert "10 words" in result.reason  # query word count
    assert "2 words" in result.reason  # answer word count
    ainvoke.assert_not_called()


async def test_heuristic_does_not_fire_when_query_has_five_words():
    """Boundary: heuristic needs query_words > 5, so 5 words goes to the LLM."""
    llm_result = RelevanceCheckOutput(is_sufficient=True, reason="ok")
    with mocked_llm(result=llm_result) as ainvoke:
        result = await check_answer_relevance("one two three four five", "short")

    ainvoke.assert_awaited_once()
    assert result.is_sufficient is True


async def test_heuristic_does_not_fire_when_answer_has_twenty_words():
    """Boundary: heuristic needs answer_words < 20, so 20 words goes to the LLM."""
    llm_result = RelevanceCheckOutput(is_sufficient=True, reason="ok")
    answer = " ".join(["word"] * 20)
    with mocked_llm(result=llm_result) as ainvoke:
        await check_answer_relevance(LONG_QUERY, answer)

    ainvoke.assert_awaited_once()


async def test_heuristic_fires_when_query_has_six_words_and_answer_nineteen():
    with mocked_llm() as ainvoke:
        result = await check_answer_relevance(
            "one two three four five six", " ".join(["word"] * 19)
        )

    assert result.is_sufficient is False
    ainvoke.assert_not_called()


# --- LLM path -------------------------------------------------------------


async def test_llm_verdict_is_returned_unchanged():
    llm_result = RelevanceCheckOutput(
        is_sufficient=False,
        reason="Only weather data",
        missing_aspects=["Crop recommendation"],
    )
    with mocked_llm(result=llm_result):
        result = await check_answer_relevance(LONG_QUERY, LONG_ANSWER)

    assert result is llm_result


async def test_llm_failure_fails_open_to_sufficient():
    """If the LLM errors we must not push a disclaimer onto a valid answer."""
    with mocked_llm(error=RuntimeError("boom")):
        result = await check_answer_relevance(LONG_QUERY, LONG_ANSWER)

    assert result.is_sufficient is True
    assert result.reason == "LLM check failed: RuntimeError"


async def test_answer_is_truncated_to_2000_chars_in_prompt():
    llm_result = RelevanceCheckOutput(is_sufficient=True, reason="ok")
    long_answer = "x" * 2500  # one "word", so the short-answer heuristic is skipped
    with mocked_llm(result=llm_result) as ainvoke:
        await check_answer_relevance(SHORT_QUERY, long_answer)

    messages = ainvoke.await_args.args[0]
    prompt = messages[-1].content
    assert "x" * 2000 in prompt
    assert "x" * 2001 not in prompt
    assert SHORT_QUERY in prompt


# --- should_add_disclaimer ------------------------------------------------


def test_should_add_disclaimer_true_for_insufficient_answer():
    assert should_add_disclaimer(
        RelevanceCheckOutput(is_sufficient=False, reason="partial")
    ) is True


def test_should_add_disclaimer_false_for_sufficient_answer():
    assert should_add_disclaimer(
        RelevanceCheckOutput(is_sufficient=True, reason="complete")
    ) is False


def test_relevance_output_defaults_missing_aspects_to_empty_list():
    out = RelevanceCheckOutput(is_sufficient=True, reason="ok")

    assert out.missing_aspects == []
