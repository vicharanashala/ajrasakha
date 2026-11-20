"""Detect titled personal officer names in answer text."""

from __future__ import annotations

import json
import re
from typing import Any

from normalizer import AnswerContext
from result_state import FAIL, PASS, check_result


OFFICER_NAME_PATTERN = re.compile(
    # the full stop after the title is optional: "Dr. Singh" and "Dr Singh" are both names.
    # "Sri" is left out on purpose: it is also part of place names (Sri Muktsar Sahib).
    r"\b(?:Dr|Mr|Mrs|Ms|Sh|Shri|Smt|Prof)\b\.?\s+"
    # initials may come first (Dr M. S. Randhawa), then one to three capitalised name words
    r"(?:[A-Z]\.?\s+)*[A-Z][A-Za-z'-]+(?:\s+(?:[A-Z]\.?\s+)*[A-Z][A-Za-z'-]+){0,2}\b"
)
# a titled name used as the name of a preparation ("Dr. Dalal Mixture", "Dr. Dalal Ghol") is not a person
PREPARATION_WORD = re.compile(
    r"(?:mixture|ghol|solution|formula|formulation|tonic|mix|kit|method|technique)$",
    re.IGNORECASE,
)


def _names_a_person(answer_text: str, match: re.Match[str]) -> bool:
    """False when the matched name, or the word right after it, names a preparation."""
    next_word = re.match(r"\s+([A-Za-z]+)", answer_text[match.end():])
    words = [match.group(0).split()[-1]] + ([next_word.group(1)] if next_word else [])
    return not any(PREPARATION_WORD.match(word) for word in words)


def _evidence_sentence(answer_text: str, match: re.Match[str]) -> str:
    """Return the exact sentence containing the matched name."""
    boundaries = [
        boundary_match.end()
        for boundary_match in re.finditer(r"[.!?](?=\s|$)", answer_text)
    ]
    previous_boundaries = [boundary for boundary in boundaries if boundary <= match.start()]
    next_boundaries = [boundary for boundary in boundaries if boundary >= match.end()]
    start = previous_boundaries[-1] if previous_boundaries else 0
    end = next_boundaries[0] if next_boundaries else len(answer_text)
    return answer_text[start:end].strip()


def check_officer_name(context: AnswerContext) -> dict[str, Any]:
    """Check an answer for a titled, capitalized personal name."""
    answer_text = context["answer_text"]
    match = next(
        (m for m in OFFICER_NAME_PATTERN.finditer(answer_text) if _names_a_person(answer_text, m)),
        None,
    )
    if match:
        return {
            "officer_name": check_result(
                FAIL,
                "Personal officer name found",
                found=match.group(0),
                evidence=_evidence_sentence(answer_text, match),
            )
        }

    return {
        "officer_name": check_result(
            PASS,
            "No personal officer name found",
            found=None,
            evidence=None,
        )
    }


if __name__ == "__main__":
    test_cases = {
        "named_officer": (
            "Please contact Dr. Ramesh Kumar, District Agriculture Officer "
            "for more details."
        ),
        "role_only": "Contact District Agriculture Officer for more details.",
        "clean_answer": "Apply the recommended treatment according to the label.",
    }

    for case_name, answer in test_cases.items():
        print(f"{case_name}:")
        from normalizer import normalize_answer

        context = normalize_answer({"answer_text": answer})
        print(json.dumps(check_officer_name(context), indent=2))
