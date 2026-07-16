"""Deterministic, source-only selection for extractive answer shortening.

The model is allowed to rank opaque segment IDs.  It is never allowed to
provide answer text: every emitted character belonging to a segment comes
from an offset-verified slice of the normalized source.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Iterable, Sequence


_NEWLINE_RE = re.compile(r"\r\n|\r|\n")
_SENTENCE_END_RE = re.compile(
    r"[.!?\u0964\u0965\u061f\u3002\uff01\uff1f]+"
    r"(?:[\"'\u201d\u2019\u00bb)\]\}])*"
    r"(?=\s|$)"
)
_OUTER_JSON_FENCE_RE = re.compile(
    r"\A```(?:json)?[ \t]*\r?\n(?P<body>.*)\r?\n```[ \t]*\Z",
    re.IGNORECASE | re.DOTALL,
)


class ExtractionSelectionError(ValueError):
    """A model selection that cannot safely be used.

    ``code`` and ``safe_message`` contain no source text and are suitable for
    structured logging or an API error response.
    """

    def __init__(self, code: str, safe_message: str) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message


class MandatorySpanMappingError(ExtractionSelectionError):
    """A mandatory source span is not wholly contained by one segment."""


class ExtractiveRangeNotFeasibleError(RuntimeError):
    """No source-segment subset can satisfy the requested character range."""

    code = "EXTRACTIVE_RANGE_NOT_FEASIBLE"
    safe_message = "No extractive segment selection fits the requested range"

    def __init__(
        self,
        *,
        lower_bound: int,
        target: int,
        upper_bound: int,
        closest_achievable_lengths: Sequence[int],
    ) -> None:
        super().__init__(self.safe_message)
        self.lower_bound = lower_bound
        self.target = target
        self.upper_bound = upper_bound
        self.closest_achievable_lengths = tuple(closest_achievable_lengths)


@dataclass(frozen=True, slots=True)
class ExtractionSegment:
    """A meaningful, exact slice of the normalized source."""

    segment_id: str
    start: int
    end: int
    text: str

    @property
    def id(self) -> str:
        """Short compatibility alias for callers that use ``segment.id``."""

        return self.segment_id


@dataclass(frozen=True, slots=True)
class ExtractiveSelection:
    """The fitted segments in source order and their assembled output."""

    segments: tuple[ExtractionSegment, ...]
    text: str

    @property
    def segment_ids(self) -> tuple[str, ...]:
        return tuple(segment.segment_id for segment in self.segments)

    @property
    def character_count(self) -> int:
        return len(self.text)


def _trim_slice(source: str, start: int, end: int) -> tuple[int, int]:
    while start < end and source[start].isspace():
        start += 1
    while end > start and source[end - 1].isspace():
        end -= 1
    return start, end


def split_source_into_segments(source: str) -> tuple[ExtractionSegment, ...]:
    """Split a normalized source at newlines and sentence boundaries.

    Boundary whitespace is excluded, but ``segment.text`` is always exactly
    ``source[segment.start:segment.end]``.  Blank/whitespace-only pieces are
    ignored.  IDs are stable for a given normalized source and begin at
    ``s0001``.
    """

    if not isinstance(source, str):
        raise TypeError("source must be a string")

    offsets: list[tuple[int, int]] = []

    def add_line(line_start: int, line_end: int) -> None:
        piece_start = line_start
        for match in _SENTENCE_END_RE.finditer(source, line_start, line_end):
            start, end = _trim_slice(source, piece_start, match.end())
            if start < end:
                offsets.append((start, end))
            piece_start = match.end()

        start, end = _trim_slice(source, piece_start, line_end)
        if start < end:
            offsets.append((start, end))

    line_start = 0
    for newline in _NEWLINE_RE.finditer(source):
        add_line(line_start, newline.start())
        line_start = newline.end()
    add_line(line_start, len(source))

    return tuple(
        ExtractionSegment(
            segment_id=f"s{index:04d}",
            start=start,
            end=end,
            text=source[start:end],
        )
        for index, (start, end) in enumerate(offsets, start=1)
    )


class _DuplicateJSONKey(ValueError):
    pass


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateJSONKey
        result[key] = value
    return result


def _selection_error(code: str, safe_message: str) -> ExtractionSelectionError:
    return ExtractionSelectionError(code, safe_message)


def parse_ranked_segment_ids(
    response: str,
    known_segment_ids: Iterable[str],
) -> tuple[str, ...]:
    """Parse the model's strict JSON ranking and validate a full permutation."""

    if not isinstance(response, str):
        raise _selection_error(
            "INVALID_SELECTION_JSON",
            "The model selection must be a JSON object",
        )

    payload = response.strip()
    if payload.startswith("```") or payload.endswith("```"):
        fence_match = _OUTER_JSON_FENCE_RE.fullmatch(payload)
        if fence_match is None:
            raise _selection_error(
                "INVALID_SELECTION_JSON",
                "The model selection contains an invalid JSON fence",
            )
        payload = fence_match.group("body").strip()

    try:
        decoded = json.loads(
            payload,
            object_pairs_hook=_object_without_duplicate_keys,
        )
    except (json.JSONDecodeError, _DuplicateJSONKey, TypeError, ValueError) as exc:
        raise _selection_error(
            "INVALID_SELECTION_JSON",
            "The model selection is not valid strict JSON",
        ) from exc

    if not isinstance(decoded, dict) or set(decoded) != {"ranked_segment_ids"}:
        raise _selection_error(
            "INVALID_SELECTION_SCHEMA",
            "The model selection must contain only ranked_segment_ids",
        )

    ranked = decoded["ranked_segment_ids"]
    if not isinstance(ranked, list) or any(not isinstance(item, str) for item in ranked):
        raise _selection_error(
            "INVALID_SELECTION_SCHEMA",
            "ranked_segment_ids must be a JSON array of strings",
        )

    known = tuple(known_segment_ids)
    if any(not isinstance(item, str) for item in known) or len(set(known)) != len(known):
        raise _selection_error(
            "INVALID_KNOWN_SEGMENTS",
            "Known segment IDs must be unique strings",
        )

    if len(ranked) != len(known) or len(set(ranked)) != len(ranked) or set(ranked) != set(known):
        raise _selection_error(
            "INVALID_SEGMENT_RANKING",
            "The ranking must contain every known segment ID exactly once",
        )

    return tuple(ranked)


def _verify_segments_against_source(
    source: str,
    segments: Sequence[ExtractionSegment],
) -> None:
    previous_end = -1
    seen_ids: set[str] = set()
    for segment in sorted(segments, key=lambda item: (item.start, item.end)):
        if (
            not segment.segment_id
            or segment.segment_id in seen_ids
            or segment.start < 0
            or segment.end <= segment.start
            or segment.start < previous_end
            or segment.end > len(source)
            or source[segment.start : segment.end] != segment.text
        ):
            raise MandatorySpanMappingError(
                "INVALID_SEGMENT_OFFSETS",
                "Segments must be unique, non-overlapping exact source slices",
            )
        seen_ids.add(segment.segment_id)
        previous_end = segment.end


def map_mandatory_spans_to_segment_ids(
    source: str,
    segments: Sequence[ExtractionSegment],
    mandatory_spans: Iterable[str],
) -> tuple[str, ...]:
    """Map every exact mandatory span to one segment that fully contains it.

    A span that exists only across a segment boundary is rejected because
    requiring either neighboring segment alone would not preserve it exactly.
    """

    if not isinstance(source, str):
        raise TypeError("source must be a string")
    segment_tuple = tuple(segments)
    _verify_segments_against_source(source, segment_tuple)

    selected_ids: list[str] = []
    for span in mandatory_spans:
        if not isinstance(span, str) or not span:
            raise MandatorySpanMappingError(
                "MANDATORY_SPAN_NOT_FOUND",
                "A mandatory span was not found in the source",
            )

        occurrence_found = False
        contained_by: ExtractionSegment | None = None
        search_from = 0
        while True:
            span_start = source.find(span, search_from)
            if span_start < 0:
                break
            occurrence_found = True
            span_end = span_start + len(span)
            contained_by = next(
                (
                    segment
                    for segment in segment_tuple
                    if segment.start <= span_start and span_end <= segment.end
                ),
                None,
            )
            if contained_by is not None:
                break
            search_from = span_start + 1

        if contained_by is None:
            if occurrence_found:
                raise MandatorySpanMappingError(
                    "MANDATORY_SPAN_CROSSES_SEGMENTS",
                    "A mandatory span crosses a segment boundary",
                )
            raise MandatorySpanMappingError(
                "MANDATORY_SPAN_NOT_FOUND",
                "A mandatory span was not found in the source",
            )

        if contained_by.segment_id not in selected_ids:
            selected_ids.append(contained_by.segment_id)

    return tuple(selected_ids)


def _has_set_bit_in_range(bits: int, lower: int, upper: int) -> bool:
    if upper < lower or upper < 0:
        return False
    lower = max(0, lower)
    width = upper - lower + 1
    return bool((bits >> lower) & ((1 << width) - 1))


def _lowest_set_bit_in_range(bits: int, lower: int, upper: int) -> int | None:
    if upper < lower or upper < 0:
        return None
    lower = max(0, lower)
    shifted = (bits >> lower) & ((1 << (upper - lower + 1)) - 1)
    if not shifted:
        return None
    return lower + ((shifted & -shifted).bit_length() - 1)


def _highest_set_bit_at_most(bits: int, upper: int, *, minimum: int = 0) -> int | None:
    if upper < minimum:
        return None
    masked = bits & ((1 << (upper + 1)) - 1)
    if minimum:
        masked &= ~((1 << minimum) - 1)
    return masked.bit_length() - 1 if masked else None


def _closest_achievable_lengths(
    *,
    mandatory_weight: int,
    mandatory_count: int,
    optional_weights: Sequence[int],
    separator_length: int,
    lower_bound: int,
    upper_bound: int,
) -> tuple[int, ...]:
    """Return the nearest achievable length immediately below/above the range."""

    transformed_upper = upper_bound + separator_length
    below: int | None = None
    above: int | None = None

    if mandatory_weight > transformed_upper:
        above = mandatory_weight - separator_length
    else:
        residual_limit = transformed_upper - mandatory_weight
        mask = (1 << (residual_limit + 1)) - 1
        reachable = 1
        smallest_over: int | None = None

        for weight in optional_weights:
            crossing_residual = _lowest_set_bit_in_range(
                reachable,
                residual_limit - weight + 1,
                residual_limit,
            )
            if crossing_residual is not None:
                crossing_total = mandatory_weight + crossing_residual + weight
                if smallest_over is None or crossing_total < smallest_over:
                    smallest_over = crossing_total
            reachable = (reachable | (reachable << weight)) & mask

        if smallest_over is not None:
            above = smallest_over - separator_length

        transformed_lower = lower_bound + separator_length
        residual_below_limit = transformed_lower - mandatory_weight - 1
        minimum_residual = 0 if mandatory_count else 1
        residual_below = _highest_set_bit_at_most(
            reachable,
            residual_below_limit,
            minimum=minimum_residual,
        )
        if residual_below is not None:
            below = mandatory_weight + residual_below - separator_length

        if mandatory_count == 0 and 0 < lower_bound:
            below = max(0, below) if below is not None else 0

    return tuple(value for value in (below, above) if value is not None)


def _validate_fit_inputs(
    segments: Sequence[ExtractionSegment],
    ranked_segment_ids: Sequence[str],
    mandatory_segment_ids: Sequence[str],
    lower_bound: int,
    target: int,
    upper_bound: int,
    separator: str,
) -> dict[str, ExtractionSegment]:
    if (
        any(isinstance(value, bool) or not isinstance(value, int) for value in (lower_bound, target, upper_bound))
        or lower_bound < 0
        or not lower_bound <= target <= upper_bound
    ):
        raise ValueError("character bounds must satisfy 0 <= lower <= target <= upper")
    if not isinstance(separator, str):
        raise TypeError("separator must be a string")

    by_id: dict[str, ExtractionSegment] = {}
    source_order = sorted(segments, key=lambda item: (item.start, item.end))
    previous_end = -1
    for segment in source_order:
        if (
            not isinstance(segment, ExtractionSegment)
            or not segment.segment_id
            or segment.segment_id in by_id
            or segment.start < 0
            or segment.end <= segment.start
            or segment.start < previous_end
            or len(segment.text) == 0
            or segment.end - segment.start != len(segment.text)
        ):
            raise _selection_error(
                "INVALID_SEGMENTS",
                "Segments must be unique, ordered, non-overlapping source slices",
            )
        by_id[segment.segment_id] = segment
        previous_end = segment.end

    ranked = tuple(ranked_segment_ids)
    if (
        any(not isinstance(item, str) for item in ranked)
        or len(ranked) != len(by_id)
        or len(set(ranked)) != len(ranked)
        or set(ranked) != set(by_id)
    ):
        raise _selection_error(
            "INVALID_SEGMENT_RANKING",
            "The ranking must contain every known segment ID exactly once",
        )

    mandatory = tuple(mandatory_segment_ids)
    if (
        any(not isinstance(item, str) for item in mandatory)
        or len(set(mandatory)) != len(mandatory)
        or not set(mandatory) <= set(by_id)
    ):
        raise _selection_error(
            "INVALID_MANDATORY_SEGMENTS",
            "Mandatory segment IDs must be unique known IDs",
        )
    return by_id


def fit_ranked_segments(
    segments: Sequence[ExtractionSegment],
    ranked_segment_ids: Sequence[str],
    *,
    lower_bound: int,
    target: int,
    upper_bound: int,
    mandatory_segment_ids: Sequence[str] = (),
    separator: str = "\n\n",
) -> ExtractiveSelection:
    """Fit a lexicographically relevance-maximal source-only selection.

    Each higher-ranked optional segment is included whenever any completion
    using lower-ranked segments can still satisfy the range.  The selected
    segments are then restored to source order for assembly.  Length fitting
    uses a suffix subset-sum bitset bounded by ``upper_bound``.
    """

    segment_tuple = tuple(segments)
    ranked = tuple(ranked_segment_ids)
    mandatory = tuple(mandatory_segment_ids)
    by_id = _validate_fit_inputs(
        segment_tuple,
        ranked,
        mandatory,
        lower_bound,
        target,
        upper_bound,
        separator,
    )

    separator_length = len(separator)
    weights = {
        segment_id: len(segment.text) + separator_length
        for segment_id, segment in by_id.items()
    }
    mandatory_set = set(mandatory)
    mandatory_weight = sum(weights[segment_id] for segment_id in mandatory_set)
    mandatory_count = len(mandatory_set)
    optional_ids = tuple(
        segment_id for segment_id in ranked if segment_id not in mandatory_set
    )
    optional_weights = tuple(weights[segment_id] for segment_id in optional_ids)

    transformed_lower = lower_bound + separator_length
    transformed_upper = upper_bound + separator_length
    residual_cap = max(0, transformed_upper - mandatory_weight)
    suffix_mask = (1 << (residual_cap + 1)) - 1
    suffix_reachable = [0] * (len(optional_ids) + 1)
    suffix_reachable[-1] = 1
    for index in range(len(optional_ids) - 1, -1, -1):
        following = suffix_reachable[index + 1]
        suffix_reachable[index] = (
            following | (following << optional_weights[index])
        ) & suffix_mask

    def has_completion(
        fixed_weight: int,
        fixed_count: int,
        remaining_reachable: int,
    ) -> bool:
        if fixed_count == 0 and lower_bound <= 0 <= upper_bound:
            return True
        minimum_residual = transformed_lower - fixed_weight
        maximum_residual = transformed_upper - fixed_weight
        if fixed_count == 0:
            minimum_residual = max(1, minimum_residual)
        return _has_set_bit_in_range(
            remaining_reachable,
            minimum_residual,
            maximum_residual,
        )

    if not has_completion(
        mandatory_weight,
        mandatory_count,
        suffix_reachable[0],
    ):
        raise ExtractiveRangeNotFeasibleError(
            lower_bound=lower_bound,
            target=target,
            upper_bound=upper_bound,
            closest_achievable_lengths=_closest_achievable_lengths(
                mandatory_weight=mandatory_weight,
                mandatory_count=mandatory_count,
                optional_weights=optional_weights,
                separator_length=separator_length,
                lower_bound=lower_bound,
                upper_bound=upper_bound,
            ),
        )

    selected_ids = set(mandatory_set)
    fixed_weight = mandatory_weight
    fixed_count = mandatory_count
    for index, segment_id in enumerate(optional_ids):
        candidate_weight = weights[segment_id]
        if has_completion(
            fixed_weight + candidate_weight,
            fixed_count + 1,
            suffix_reachable[index + 1],
        ):
            selected_ids.add(segment_id)
            fixed_weight += candidate_weight
            fixed_count += 1

    selected_segments = tuple(
        segment
        for segment in sorted(segment_tuple, key=lambda item: (item.start, item.end))
        if segment.segment_id in selected_ids
    )
    output = separator.join(segment.text for segment in selected_segments)
    if not lower_bound <= len(output) <= upper_bound:
        raise AssertionError("internal extractive fitter length invariant failed")
    return ExtractiveSelection(segments=selected_segments, text=output)


# Readable aliases for integration call sites.
segment_source = split_source_into_segments
fit_extractive_selection = fit_ranked_segments
map_mandatory_spans = map_mandatory_spans_to_segment_ids
