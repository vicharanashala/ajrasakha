"""Detect titled personal officer names in answer text."""

from __future__ import annotations

import json
import re
from typing import Any

from normalizer import AnswerContext
from result_state import FAIL, PASS, check_result


OFFICER_NAME_PATTERN = re.compile(
    r"\b(?:Dr|Mr|Mrs|Ms|Sh|Shri)\.\s+"
    r"[A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2}\b"
)


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
    match = OFFICER_NAME_PATTERN.search(answer_text)
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
