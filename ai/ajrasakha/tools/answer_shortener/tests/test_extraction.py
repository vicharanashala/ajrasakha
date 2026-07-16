from __future__ import annotations

import pytest

from ajrasakha.tools.answer_shortener.extraction import (
    ExtractionSegment,
    ExtractionSelectionError,
    ExtractiveRangeNotFeasibleError,
    MandatorySpanMappingError,
    fit_ranked_segments,
    map_mandatory_spans_to_segment_ids,
    parse_ranked_segment_ids,
    split_source_into_segments,
)


def test_segments_are_exact_unicode_source_slices_with_stable_offsets():
    source = "  पहली बात।  दूसरी बात!\r\n\nThird line\n  अंतिम  "

    segments = split_source_into_segments(source)

    assert [segment.segment_id for segment in segments] == [
        "s0001",
        "s0002",
        "s0003",
        "s0004",
    ]
    assert [segment.text for segment in segments] == [
        "पहली बात।",
        "दूसरी बात!",
        "Third line",
        "अंतिम",
    ]
    assert all(segment.text == source[segment.start : segment.end] for segment in segments)
    assert [segment.start for segment in segments] == sorted(
        segment.start for segment in segments
    )


def test_sentence_split_preserves_internal_whitespace_and_skips_blank_pieces():
    source = "One sentence.  Two words without punctuation\n   \nLast?"

    segments = split_source_into_segments(source)

    assert [segment.text for segment in segments] == [
        "One sentence.",
        "Two words without punctuation",
        "Last?",
    ]


def test_parses_plain_and_optionally_fenced_strict_json_ranking():
    known = ("s0001", "s0002", "s0003")

    assert parse_ranked_segment_ids(
        '{"ranked_segment_ids":["s0002","s0001","s0003"]}',
        known,
    ) == ("s0002", "s0001", "s0003")
    assert parse_ranked_segment_ids(
        '```json\n{"ranked_segment_ids":["s0003","s0002","s0001"]}\n```',
        known,
    ) == ("s0003", "s0002", "s0001")


@pytest.mark.parametrize(
    ("response", "expected_code"),
    [
        ("Here is the ranking: {\"ranked_segment_ids\":[\"s0001\",\"s0002\"]}", "INVALID_SELECTION_JSON"),
        ("{not-json}", "INVALID_SELECTION_JSON"),
        ('{"ranked_segment_ids":["s0001","s0002"],"note":"extra"}', "INVALID_SELECTION_SCHEMA"),
        ('{"ranked_segment_ids":"s0001"}', "INVALID_SELECTION_SCHEMA"),
        ('{"ranked_segment_ids":["s0001","unknown"]}', "INVALID_SEGMENT_RANKING"),
        ('{"ranked_segment_ids":["s0001"]}', "INVALID_SEGMENT_RANKING"),
        ('{"ranked_segment_ids":["s0001","s0001"]}', "INVALID_SEGMENT_RANKING"),
        ('{"ranked_segment_ids":["s0001","s0002"],"ranked_segment_ids":["s0002","s0001"]}', "INVALID_SELECTION_JSON"),
    ],
)
def test_rejects_prose_malformed_schema_unknown_missing_and_duplicate_ids(
    response: str,
    expected_code: str,
):
    with pytest.raises(ExtractionSelectionError) as exc_info:
        parse_ranked_segment_ids(response, ("s0001", "s0002"))

    assert exc_info.value.code == expected_code
    assert "unknown" not in str(exc_info.value)


def test_fitter_prefers_high_rank_feasible_packing_then_assembles_in_source_order():
    source = "AAAA\nBBBBB\nCCCCCC"
    segments = split_source_into_segments(source)

    result = fit_ranked_segments(
        segments,
        ("s0003", "s0002", "s0001"),
        lower_bound=12,
        target=12,
        upper_bound=12,
    )

    # s0003 is highest ranked and can fit with s0001.  s0002 cannot then fit.
    assert result.segment_ids == ("s0001", "s0003")
    assert result.text == "AAAA\n\nCCCCCC"
    assert result.character_count == 12


def test_fitter_includes_each_higher_ranked_id_when_a_completion_exists():
    source = "aa\nbbb\ncccc\nddddd"
    segments = split_source_into_segments(source)

    result = fit_ranked_segments(
        segments,
        ("s0004", "s0003", "s0002", "s0001"),
        lower_bound=9,
        target=10,
        upper_bound=10,
        separator="",
    )

    assert result.segment_ids == ("s0003", "s0004")
    assert result.text == "ccccddddd"


def test_mandatory_safety_span_is_mapped_and_forced_into_selection():
    source = "General note.\nDo not spray before harvest.\nOther details."
    segments = split_source_into_segments(source)
    mandatory = map_mandatory_spans_to_segment_ids(
        source,
        segments,
        ("Do not spray before harvest.",),
    )

    result = fit_ranked_segments(
        segments,
        ("s0001", "s0003", "s0002"),
        lower_bound=28,
        target=28,
        upper_bound=28,
        mandatory_segment_ids=mandatory,
    )

    assert mandatory == ("s0002",)
    assert result.segment_ids == ("s0002",)
    assert result.text == "Do not spray before harvest."


def test_mandatory_span_crossing_segments_is_rejected_safely():
    source = "First sentence. Second sentence."
    segments = split_source_into_segments(source)

    with pytest.raises(MandatorySpanMappingError) as exc_info:
        map_mandatory_spans_to_segment_ids(
            source,
            segments,
            (source,),
        )

    assert exc_info.value.code == "MANDATORY_SPAN_CROSSES_SEGMENTS"
    assert "First sentence" not in str(exc_info.value)


def test_missing_mandatory_span_is_rejected_safely():
    source = "Source sentence."
    segments = split_source_into_segments(source)

    with pytest.raises(MandatorySpanMappingError) as exc_info:
        map_mandatory_spans_to_segment_ids(source, segments, ("Not present.",))

    assert exc_info.value.code == "MANDATORY_SPAN_NOT_FOUND"
    assert "Not present" not in str(exc_info.value)


def test_infeasible_range_reports_only_neighboring_achievable_lengths():
    segments = (
        ExtractionSegment("s0001", 0, 5, "aaaaa"),
        ExtractionSegment("s0002", 6, 13, "bbbbbbb"),
    )

    with pytest.raises(ExtractiveRangeNotFeasibleError) as exc_info:
        fit_ranked_segments(
            segments,
            ("s0001", "s0002"),
            lower_bound=6,
            target=6,
            upper_bound=6,
            separator="",
        )

    error = exc_info.value
    assert error.code == "EXTRACTIVE_RANGE_NOT_FEASIBLE"
    assert error.closest_achievable_lengths == (5, 7)
    assert "aaaaa" not in str(error)
    assert "bbbbbbb" not in str(error)


def test_oversized_mandatory_selection_reports_its_achievable_length():
    segments = (ExtractionSegment("s0001", 0, 8, "required"),)

    with pytest.raises(ExtractiveRangeNotFeasibleError) as exc_info:
        fit_ranked_segments(
            segments,
            ("s0001",),
            lower_bound=4,
            target=5,
            upper_bound=6,
            mandatory_segment_ids=("s0001",),
        )

    assert exc_info.value.closest_achievable_lengths == (8,)
