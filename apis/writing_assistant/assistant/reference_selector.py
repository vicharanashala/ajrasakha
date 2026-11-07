"""Picks the matching Golden Database structure for a question, or reports
needs_clarification rather than guessing. The LLM only classifies matches;
all precedence rules below are deterministic Python, not LLM judgment:

- A crop-specific variant wins outright when exactly one clearly applies
  (its own step list is used verbatim - never merged with a base).
- A named-topic (Direct Topic) structure wins over the generic domain
  structure only when exactly one topic confidently and unambiguously
  matches.
- Two or more plausible crop variants, or two or more plausible direct
  topics, is a conflict - reported as needs_clarification, never resolved
  by picking one.
- Team Question.csv is never a selection candidate (no domain/code key -
  it is calibration-only, per the Writing Assistant Build Plan).
"""

from . import llm_client
from .models import LLMUnavailableError, ReferenceDataset, ReferenceStructure, SourceType, StructuralValidationStatus


class SelectionOutcome:
    """Either structure is set (a resolved match) or status/reason are set
    (a terminal outcome - currently always NEEDS_CLARIFICATION)."""

    def __init__(self, structure: ReferenceStructure | None = None, status=None, reason: str | None = None):
        self.structure = structure
        self.status = status
        self.reason = reason


def select_reference(question: str, dataset: ReferenceDataset) -> SelectionOutcome:
    domain_structures = [s for s in dataset.structures if s.source_type == SourceType.DOMAIN]
    topic_structures = [s for s in dataset.structures if s.source_type == SourceType.DIRECT_TOPIC]
    crop_structures = [s for s in dataset.structures if s.source_type == SourceType.CROP_VARIANT]

    known_domains = sorted({s.domain for s in domain_structures if s.domain})

    try:
        classification = llm_client.classify_and_select(
            question=question,
            known_domains=known_domains,
            direct_topic_candidates=[(s.domain, s.code, s.question) for s in topic_structures],
            crop_variant_candidates=[(s.domain, s.code, s.crop, s.question) for s in crop_structures],
        )
    except LLMUnavailableError as exc:
        return SelectionOutcome(
            status=StructuralValidationStatus.NEEDS_CLARIFICATION,
            reason=f"Could not classify the question's domain: {exc}",
        )

    if classification.domain is None or classification.domain not in known_domains:
        return SelectionOutcome(
            status=StructuralValidationStatus.NEEDS_CLARIFICATION,
            reason="No confident reference match found for this question.",
        )

    # Crop-specific variant takes precedence outright when exactly one
    # applies - never merged with the base structure (see module docstring).
    matched_crop_indices = [i for i in classification.matched_crop_variants if 0 <= i < len(crop_structures)]
    if len(matched_crop_indices) > 1:
        return SelectionOutcome(
            status=StructuralValidationStatus.NEEDS_CLARIFICATION,
            reason="More than one crop-specific structure could apply - crop-specific applicability is unclear.",
        )
    if len(matched_crop_indices) == 1:
        return SelectionOutcome(structure=crop_structures[matched_crop_indices[0]])

    # Two or more plausible named-topic (Direct Topic) matches is a genuine
    # conflict between specific references - report it, never pick one.
    ambiguous = [i for i in classification.ambiguous_direct_topics if 0 <= i < len(topic_structures)]
    if len(ambiguous) >= 2:
        names = ", ".join(f"{topic_structures[i].domain}/{topic_structures[i].code}" for i in ambiguous)
        return SelectionOutcome(
            status=StructuralValidationStatus.NEEDS_CLARIFICATION,
            reason=f"Multiple specific reference topics could apply and conflict: {names}.",
        )

    # Exactly one confident named-topic match wins over the generic domain
    # structure.
    if classification.matched_direct_topic is not None:
        idx = classification.matched_direct_topic
        if 0 <= idx < len(topic_structures):
            return SelectionOutcome(structure=topic_structures[idx])

    generic = next(
        (
            s
            for s in domain_structures
            if s.domain == classification.domain and s.question_type == classification.question_type
        ),
        None,
    )
    if generic is not None:
        return SelectionOutcome(structure=generic)

    return SelectionOutcome(
        status=StructuralValidationStatus.NEEDS_CLARIFICATION,
        reason="No confident reference match found for this question.",
    )
