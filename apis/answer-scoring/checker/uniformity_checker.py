"""Find inconsistent chemical doses across the complete answer batch."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from result_state import FAIL, PASS, check_result, deferred_result, not_applicable_result

# Doses are only compared when chemical name, crop, unit, and basis (e.g.
# "per acre") all match exactly -- no unit conversion is attempted, so a
# mismatch here never risks a wrong comparison; it just stays
# NOT_EVALUATED. This is deliberately conservative: two doses must differ
# by at least this ratio (2.0 = one is double the other) before being
# flagged, to avoid flagging routine formulation-driven variance as an
# error. Revisit this threshold once real reviewer feedback validates it.
MIN_RATIO_FOR_INCONSISTENCY = 2.0


PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
ANSWERS_PATH = PROJECT_DIRECTORY / "data" / "sample_answers.json"

# The chemical name must be a single, properly-capitalized word (matching
# how real active-ingredient names actually appear in these answers, e.g.
# "Hexaconazole", "Carboxin", "Urea") -- deliberately case-SENSITIVE, unlike
# the rest of this pattern. An earlier version allowed up to 4 loosely-
# matched words, which absorbed connector prose in sentences like "diluted
# in 400 litres" or fertilizer lists ("...and 40 kg of Muriate of Potash"),
# producing fake chemicals like "acre", "and", and "dissolve". Requiring a
# single capitalized word immediately before the (optional formulation /
# optional connector phrase / optional "at") / dose / unit sequence rules
# those out at the pattern level, not via an ever-growing word denylist.
CHEMICAL_DOSE_PATTERN = re.compile(
    r"\b(?P<chemical>[A-Z][a-zA-Z-]*)\s+"
    r"(?:(?i:\d+(?:\.\d+)?\s*%?\s*(?:WP|EC|CG|SC|WG|WDG|GR|SL|DS|DP|SP|WS|CS|OD|FS|TB|ZC|ME)\s*))?"
    r"(?:(?i:(?:diluted|dissolved|mixed)\s+(?:in|into)\s+))?"
    r"(?:(?i:at|@)\s*)?"
    r"(?P<dose>\d+(?:\.\d+)?)\s*"
    r"(?i:(?P<unit>ml|kg|g|litres?|l))\b"
    r"(?:\s*(?:per|/)\s*(?i:(?P<per>[A-Za-z]+)))?"
)

# A final safety net: even a single capitalized word immediately before a
# dose can occasionally be a non-chemical proper noun (a place, a heading).
# Kept small and specific rather than trying to enumerate every case.
FORMULATION_CODE_WORDS = {
    "wp", "ec", "cg", "sc", "wg", "wdg", "gr", "sl", "ds", "dp", "sp",
    "ws", "cs", "od", "fs", "tb", "zc", "me", "ppm",
}
NON_CHEMICAL_CAPITALIZED_WORDS = {
    "apply", "spray", "use", "then", "next", "also", "note", "step",
    "take", "mix", "dissolve", "prepare", "keep", "make",
}


def _load_answers() -> list[dict[str, Any]]:
    with ANSWERS_PATH.open(encoding="utf-8") as source:
        answers = json.load(source)
    if not isinstance(answers, list):
        raise ValueError(f"Expected a JSON array in {ANSWERS_PATH}")
    return answers


def _clean_chemical(value: str) -> str:
    """The regex only ever captures a single capitalized word now; reject
    it (return empty, so the caller skips the occurrence) if it's a bare
    formulation code or one of a small set of known non-chemical words.
    """
    word = value.strip()
    if word.casefold() in FORMULATION_CODE_WORDS:
        return ""
    if word.casefold() in NON_CHEMICAL_CAPITALIZED_WORDS:
        return ""
    return word


def _sentence_at(text: str, position: int) -> str:
    start = max(text.rfind(".", 0, position), text.rfind("!", 0, position),
                text.rfind("?", 0, position), text.rfind("\n", 0, position))
    ends = [index for token in ".!?\n" if (index := text.find(token, position)) >= 0]
    end = min(ends) + 1 if ends else len(text)
    return text[start + 1:end].strip()


def extract_chemical_doses(answer: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract chemical/dose occurrences and their evidence sentences."""
    text = str(answer.get("answer_text") or "")
    occurrences: list[dict[str, Any]] = []
    for match in CHEMICAL_DOSE_PATTERN.finditer(text):
        chemical = _clean_chemical(match.group("chemical"))
        if not chemical:
            continue
        unit = match.group("unit").casefold()
        if unit.startswith("litre"):
            unit = "litre"
        elif unit == "l":
            unit = "L"
        occurrences.append(
            {
                "answer_id": str(answer.get("answer_id") or ""),
                "crop": str(answer.get("crop") or "").strip(),
                "chemical": chemical,
                "dose": match.group("dose"),
                "unit": unit,
                "per": str(match.group("per") or "").strip(),
                "evidence": _sentence_at(text, match.start()),
            }
        )
    return occurrences


def _dose_label(item: dict[str, Any]) -> str:
    basis = f"/{item['per']}" if item["per"] else ""
    return f"{item['dose']}{item['unit']}{basis}"


def _group_key(item: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        item["chemical"].strip().casefold(),
        item["crop"].strip().casefold(),
        item["unit"],
        item["per"].strip().casefold(),
    )


def run_uniformity_checks(
    answers: list[dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Flag doses inconsistent with another answer for the same chemical,
    crop, unit, and basis. Full dose-correctness against authoritative
    ranges remains out of scope -- see module docstring; this only checks
    internal consistency across the answer batch, and only for cases that
    need no unit conversion.
    """
    answers = _load_answers() if answers is None else answers
    occurrences_by_answer: dict[str, list[dict[str, Any]]] = defaultdict(list)
    groups: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)

    for answer in answers:
        answer_id = str(answer.get("answer_id") or "")
        for occurrence in extract_chemical_doses(answer):
            occurrences_by_answer[answer_id].append(occurrence)
            groups[_group_key(occurrence)].append(occurrence)

    results: dict[str, dict[str, Any]] = {}
    for answer in answers:
        answer_id = str(answer.get("answer_id") or "")
        occurrences = occurrences_by_answer.get(answer_id, [])
        if not occurrences:
            results[answer_id] = {
                "uniformity_of_dose": not_applicable_result(
                    "No chemical dose was extracted from this answer",
                )
            }
            continue

        conflict = None
        for occurrence in occurrences:
            try:
                own_dose = float(occurrence["dose"])
            except ValueError:
                continue
            for other in groups[_group_key(occurrence)]:
                if other["answer_id"] == answer_id or other is occurrence:
                    continue
                try:
                    other_dose = float(other["dose"])
                except ValueError:
                    continue
                if own_dose <= 0 or other_dose <= 0:
                    continue
                ratio = max(own_dose, other_dose) / min(own_dose, other_dose)
                if ratio >= MIN_RATIO_FOR_INCONSISTENCY:
                    conflict = (occurrence, other)
                    break
            if conflict:
                break

        if conflict is not None:
            occurrence, other = conflict
            results[answer_id] = {
                "uniformity_of_dose": check_result(
                    FAIL,
                    (
                        f"{occurrence['chemical']} for {occurrence['crop']} is "
                        f"stated here as {_dose_label(occurrence)}, but answer "
                        f"{other['answer_id']} states {_dose_label(other)} for "
                        "the same chemical, crop, unit, and basis"
                    ),
                    evidence=occurrence["evidence"],
                    conflicting_answer_id=other["answer_id"],
                    conflicting_evidence=other["evidence"],
                )
            }
            continue

        has_comparable_peer = any(
            len(groups[_group_key(occurrence)]) > 1 for occurrence in occurrences
        )
        if has_comparable_peer:
            results[answer_id] = {
                "uniformity_of_dose": check_result(
                    PASS,
                    "Dose is consistent with other answers using the same "
                    "chemical, crop, unit, and basis",
                )
            }
        else:
            results[answer_id] = {
                "uniformity_of_dose": deferred_result(
                    "No other answer shares the same chemical, crop, unit, "
                    "and basis to compare against yet",
                )
            }
    return results


if __name__ == "__main__":
    print(json.dumps(run_uniformity_checks(), indent=2, ensure_ascii=False))
