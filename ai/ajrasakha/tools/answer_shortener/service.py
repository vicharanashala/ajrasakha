"""Query-guided, source-only answer extraction orchestration."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

from .extraction import (
    ExtractionSelectionError,
    ExtractiveRangeNotFeasibleError,
    MandatorySpanMappingError,
    fit_ranked_segments,
    map_mandatory_spans_to_segment_ids,
    parse_ranked_segment_ids,
    split_source_into_segments,
)
from .prompts import SEGMENT_RANKING_SYSTEM_PROMPT, build_segment_ranking_prompt
from .validation import ProtectedContent


logger = logging.getLogger(__name__)

_EXTRACTION_SEPARATOR = "\n\n"
_MAX_INVALID_RESPONSE_FEEDBACK_CHARACTERS = 12_000


class ClaudeGateway(Protocol):
    async def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> str: ...


class ShorteningError(RuntimeError):
    pass


class TargetRequiresExpansionError(ShorteningError):
    pass


class ProtectedContentTooLargeError(ShorteningError):
    pass


class ModelSelectionError(ShorteningError):
    """Raised when Claude never returns a safe full segment-ID ranking."""

    def __init__(self, *, attempts: int, failure_codes: tuple[str, ...]) -> None:
        super().__init__("Claude could not return a valid source-segment ranking")
        self.attempts = attempts
        self.failure_codes = failure_codes


@dataclass(frozen=True)
class ShorteningOutcome:
    shortened_answer: str
    status: str
    original_character_count: int
    expected_character_count: int
    minimum_character_count: int
    maximum_character_count: int
    actual_character_count: int
    tolerance: int
    within_tolerance: bool
    changed: bool
    rewrite_attempts: int
    model: str


class AnswerShorteningService:
    def __init__(
        self,
        gateway: ClaudeGateway,
        *,
        model: str,
        tolerance: int = 50,
        max_attempts: int = 3,
        max_output_tokens: int = 32768,
    ) -> None:
        self._gateway = gateway
        self._model = model
        self._tolerance = tolerance
        self._max_attempts = max_attempts
        self._max_output_tokens = max_output_tokens

    async def shorten(
        self,
        *,
        original_query: str,
        answer: str,
        expected_character_count: int,
    ) -> ShorteningOutcome:
        lower_bound = max(1, expected_character_count - self._tolerance)
        upper_bound = expected_character_count + self._tolerance
        original_count = len(answer)

        if original_count < lower_bound:
            raise TargetRequiresExpansionError(
                "The requested range is longer than the source answer; this API only shortens text"
            )

        if original_count <= upper_bound:
            return self._outcome(
                text=answer,
                status="unchanged_within_tolerance",
                original_count=original_count,
                target=expected_character_count,
                lower_bound=lower_bound,
                upper_bound=upper_bound,
                attempts=0,
            )

        protected = ProtectedContent.from_text(answer)
        segments = split_source_into_segments(answer)
        if not segments:
            raise TargetRequiresExpansionError("The source answer has no extractable text")

        try:
            mandatory_segment_ids = map_mandatory_spans_to_segment_ids(
                answer,
                segments,
                protected.safety_spans,
            )
        except MandatorySpanMappingError as exc:
            logger.error(
                "mandatory extractive safety mapping failed failure_code=%s",
                exc.code,
            )
            raise ProtectedContentTooLargeError(
                "Mandatory safety text cannot be preserved as whole source segments"
            ) from exc

        by_id = {segment.segment_id: segment for segment in segments}
        mandatory_segments = tuple(
            segment
            for segment in segments
            if segment.segment_id in set(mandatory_segment_ids)
        )
        mandatory_text = _EXTRACTION_SEPARATOR.join(
            segment.text for segment in mandatory_segments
        )
        if len(mandatory_text) > upper_bound:
            raise ProtectedContentTooLargeError(
                "The target is too small to preserve mandatory safety source segments"
            )

        known_segment_ids = tuple(segment.segment_id for segment in segments)

        # Feasibility is independent of relevance order. Fail before paying for a
        # model call when no whole-source-segment combination can fit the range.
        fit_ranked_segments(
            segments,
            known_segment_ids,
            lower_bound=lower_bound,
            target=expected_character_count,
            upper_bound=upper_bound,
            mandatory_segment_ids=mandatory_segment_ids,
            separator=_EXTRACTION_SEPARATOR,
        )

        prompt_segments = tuple(
            {
                "id": segment.segment_id,
                "text": segment.text,
                "character_count": len(segment.text),
                "source_order": source_order,
            }
            for source_order, segment in enumerate(segments)
        )
        max_tokens = min(
            self._max_output_tokens,
            max(256, 128 + (len(segments) * 16)),
        )

        previous_invalid_response: str | None = None
        safe_validation_error: str | None = None
        failure_codes: list[str] = []

        for attempt in range(1, self._max_attempts + 1):
            user_prompt = build_segment_ranking_prompt(
                original_query=original_query,
                segments=prompt_segments,
                target=expected_character_count,
                lower_bound=lower_bound,
                upper_bound=upper_bound,
                mandatory_segment_ids=mandatory_segment_ids,
                previous_invalid_response=previous_invalid_response,
                safe_validation_error=safe_validation_error,
            )
            raw_selection = await self._gateway.generate(
                system_prompt=SEGMENT_RANKING_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                max_tokens=max_tokens,
            )

            try:
                ranked_segment_ids = parse_ranked_segment_ids(
                    raw_selection,
                    known_segment_ids,
                )
            except ExtractionSelectionError as exc:
                failure_codes.append(exc.code)
                previous_invalid_response = raw_selection[
                    :_MAX_INVALID_RESPONSE_FEEDBACK_CHARACTERS
                ]
                safe_validation_error = exc.safe_message
                logger.info(
                    "source segment ranking rejected model=%s attempt=%d "
                    "failure_code=%s",
                    self._model,
                    attempt,
                    exc.code,
                )
                continue

            selection = fit_ranked_segments(
                segments,
                ranked_segment_ids,
                lower_bound=lower_bound,
                target=expected_character_count,
                upper_bound=upper_bound,
                mandatory_segment_ids=mandatory_segment_ids,
                separator=_EXTRACTION_SEPARATOR,
            )

            # Defense in depth: the final body is reconstructed exclusively from
            # offset-backed source slices. The model response itself is never returned.
            expected_text = _EXTRACTION_SEPARATOR.join(
                answer[segment.start : segment.end]
                for segment in selection.segments
            )
            if selection.text != expected_text:
                raise AssertionError("extractive source provenance invariant failed")
            if not lower_bound <= len(selection.text) <= upper_bound:
                raise AssertionError("extractive character-range invariant failed")
            if any(span not in selection.text for span in protected.safety_spans):
                raise AssertionError("mandatory safety extraction invariant failed")
            if any(segment.segment_id not in by_id for segment in selection.segments):
                raise AssertionError("unknown extractive segment invariant failed")

            logger.info(
                "extractive answer shortening succeeded model=%s original_chars=%d "
                "target_chars=%d output_chars=%d selected_segments=%d "
                "selection_attempts=%d",
                self._model,
                original_count,
                expected_character_count,
                len(selection.text),
                len(selection.segments),
                attempt,
            )
            return self._outcome(
                text=selection.text,
                status="shortened",
                original_count=original_count,
                target=expected_character_count,
                lower_bound=lower_bound,
                upper_bound=upper_bound,
                attempts=attempt,
            )

        safe_codes = tuple(dict.fromkeys(failure_codes))
        logger.warning(
            "source segment ranking failed model=%s original_chars=%d "
            "target_chars=%d selection_attempts=%d failure_codes=%s",
            self._model,
            original_count,
            expected_character_count,
            self._max_attempts,
            safe_codes,
        )
        raise ModelSelectionError(
            attempts=self._max_attempts,
            failure_codes=safe_codes,
        )

    def _outcome(
        self,
        *,
        text: str,
        status: str,
        original_count: int,
        target: int,
        lower_bound: int,
        upper_bound: int,
        attempts: int,
    ) -> ShorteningOutcome:
        actual = len(text)
        return ShorteningOutcome(
            shortened_answer=text,
            status=status,
            original_character_count=original_count,
            expected_character_count=target,
            minimum_character_count=lower_bound,
            maximum_character_count=upper_bound,
            actual_character_count=actual,
            tolerance=self._tolerance,
            within_tolerance=lower_bound <= actual <= upper_bound,
            changed=attempts > 0,
            rewrite_attempts=attempts,
            model=self._model,
        )
