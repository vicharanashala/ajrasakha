from __future__ import annotations

import json

import pytest

from ajrasakha.tools.answer_shortener.extraction import (
    ExtractiveRangeNotFeasibleError,
    split_source_into_segments,
)
from ajrasakha.tools.answer_shortener.service import (
    AnswerShorteningService,
    ModelSelectionError,
    ProtectedContentTooLargeError,
    TargetRequiresExpansionError,
)


class FakeGateway:
    def __init__(self, responses: list[str]) -> None:
        self.responses = list(responses)
        self.calls: list[dict] = []

    async def generate(self, **kwargs) -> str:
        self.calls.append(kwargs)
        return self.responses.pop(0)


def make_service(gateway: FakeGateway, *, attempts: int = 3) -> AnswerShorteningService:
    return AnswerShorteningService(
        gateway,
        model="claude-test-sonnet",
        tolerance=50,
        max_attempts=attempts,
        max_output_tokens=8192,
    )


def sized_sentence(label: str, length: int = 70) -> str:
    prefix = f"{label} "
    return prefix + ("x" * (length - len(prefix) - 1)) + "."


def source_with_four_segments(*, safety_third: bool = False) -> tuple[str, list[str]]:
    labels = [
        "Relevant wheat recommendation",
        "Supporting irrigation condition",
        "Do not spray before harvest" if safety_third else "Optional background detail",
        "Least relevant historical context",
    ]
    texts = [sized_sentence(label) for label in labels]
    return "\n".join(texts), texts


def ranking_response(source: str, order: tuple[int, ...] | None = None) -> str:
    ids = [segment.segment_id for segment in split_source_into_segments(source)]
    if order is not None:
        ids = [ids[index] for index in order]
    return json.dumps({"ranked_segment_ids": ids})


@pytest.mark.asyncio
async def test_returns_unchanged_answer_already_within_tolerance():
    gateway = FakeGateway([])
    answer = "a" * 120

    result = await make_service(gateway).shorten(
        original_query="query",
        answer=answer,
        expected_character_count=100,
    )

    assert result.shortened_answer == answer
    assert result.status == "unchanged_within_tolerance"
    assert result.changed is False
    assert result.rewrite_attempts == 0
    assert result.within_tolerance is True
    assert gateway.calls == []


@pytest.mark.asyncio
async def test_rejects_target_that_requires_expanding_source():
    gateway = FakeGateway([])

    with pytest.raises(TargetRequiresExpansionError):
        await make_service(gateway).shorten(
            original_query="query",
            answer="too short",
            expected_character_count=100,
        )


@pytest.mark.asyncio
async def test_model_ranks_ids_and_python_returns_only_exact_source_slices():
    source, texts = source_with_four_segments()
    expected = texts[0] + "\n\n" + texts[1]
    gateway = FakeGateway([ranking_response(source, (1, 0, 2, 3))])

    result = await make_service(gateway).shorten(
        original_query="How should I manage wheat irrigation?",
        answer=source,
        expected_character_count=len(expected),
    )

    assert result.shortened_answer == expected
    assert result.actual_character_count == len(expected)
    assert result.within_tolerance is True
    assert result.status == "shortened"
    assert result.rewrite_attempts == 1
    assert "How should I manage wheat irrigation?" in gateway.calls[0]["user_prompt"]
    assert "ranked_segment_ids" in gateway.calls[0]["user_prompt"]
    assert "source-segment relevance ranker" in gateway.calls[0]["system_prompt"]
    for block in result.shortened_answer.split("\n\n"):
        assert block in source


@pytest.mark.asyncio
async def test_invalid_model_prose_is_never_returned_and_ranking_is_retried():
    source, texts = source_with_four_segments()
    expected = texts[0] + "\n\n" + texts[1]
    invented = "Claude-authored prose that does not occur in the source."
    gateway = FakeGateway(
        [invented, ranking_response(source, (0, 1, 2, 3))]
    )

    result = await make_service(gateway).shorten(
        original_query="What is relevant?",
        answer=source,
        expected_character_count=len(expected),
    )

    assert result.shortened_answer == expected
    assert invented not in result.shortened_answer
    assert result.rewrite_attempts == 2
    retry_prompt = gateway.calls[1]["user_prompt"]
    assert "INVALID_SELECTION_JSON" not in retry_prompt
    assert "not valid strict JSON" in retry_prompt
    assert invented in retry_prompt


@pytest.mark.asyncio
async def test_all_invalid_model_rankings_fail_without_returning_model_text():
    source, texts = source_with_four_segments()
    gateway = FakeGateway(["invented one", "invented two", "invented three"])

    with pytest.raises(ModelSelectionError) as exc_info:
        await make_service(gateway).shorten(
            original_query="What is relevant?",
            answer=source,
            expected_character_count=len(texts[0] + "\n\n" + texts[1]),
        )

    assert len(gateway.calls) == 3
    assert exc_info.value.attempts == 3
    assert exc_info.value.failure_codes == ("INVALID_SELECTION_JSON",)


@pytest.mark.asyncio
async def test_no_feasible_whole_segment_combination_returns_error_before_model_call():
    source = sized_sentence("Only very long source segment", length=400)
    gateway = FakeGateway([])

    with pytest.raises(ExtractiveRangeNotFeasibleError) as exc_info:
        await make_service(gateway).shorten(
            original_query="query",
            answer=source,
            expected_character_count=300,
        )

    assert gateway.calls == []
    assert exc_info.value.lower_bound == 250
    assert exc_info.value.upper_bound == 350
    assert exc_info.value.closest_achievable_lengths == (0, 400)


@pytest.mark.asyncio
async def test_mandatory_safety_source_segment_is_forced_even_when_ranked_last():
    source, texts = source_with_four_segments(safety_third=True)
    expected = texts[0] + "\n\n" + texts[2]
    gateway = FakeGateway([ranking_response(source, (0, 1, 3, 2))])

    result = await make_service(gateway).shorten(
        original_query="Tell me only the wheat recommendation.",
        answer=source,
        expected_character_count=len(expected),
    )

    assert result.shortened_answer == expected
    assert texts[2] in result.shortened_answer
    assert texts[2] == result.shortened_answer.split("\n\n")[1]


@pytest.mark.asyncio
async def test_rejects_target_smaller_than_mandatory_safety_source_segment():
    safety = sized_sentence("Do not spray before harvest", length=180)
    source = safety + "\n" + sized_sentence("Background", length=180)
    gateway = FakeGateway([])

    with pytest.raises(ProtectedContentTooLargeError):
        await make_service(gateway).shorten(
            original_query="Can I spray now?",
            answer=source,
            expected_character_count=100,
        )

    assert gateway.calls == []


@pytest.mark.asyncio
async def test_unicode_source_segments_are_returned_verbatim():
    texts = [
        "गेहूं की पहली सटीक सलाह।",
        "सिंचाई की दूसरी सटीक सलाह।",
        "तीसरी पृष्ठभूमि जानकारी।",
        "चौथी पृष्ठभूमि जानकारी।",
    ]
    source = "\n".join(texts)
    expected = texts[0] + "\n\n" + texts[1]
    gateway = FakeGateway([ranking_response(source, (0, 1, 2, 3))])

    result = await AnswerShorteningService(
        gateway,
        model="claude-test-sonnet",
        tolerance=5,
        max_attempts=3,
    ).shorten(
        original_query="गेहूं की सिंचाई कैसे करें?",
        answer=source,
        expected_character_count=len(expected),
    )

    assert result.shortened_answer == expected
    assert result.actual_character_count == len(expected)
    assert all(block in source for block in result.shortened_answer.split("\n\n"))
