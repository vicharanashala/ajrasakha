"""Check answer text for banned and crop-restricted chemicals."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from normalizer import AnswerContext
from result_state import FAIL, NOT_EVALUATED, PASS, check_result, not_applicable_result


DATA_DIRECTORY = Path(__file__).resolve().parent.parent / "data"
BANNED_CHEMICALS_PATH = DATA_DIRECTORY / "quality_banned_chemicals.json"
RESTRICTED_CHEMICALS_PATH = DATA_DIRECTORY / "quality_restricted_chemicals.json"

# for the vegetable restriction in the CIB&RC data
VEGETABLE_CROPS = {
    "bhindi", "brinjal", "cabbage", "capsicum", "carrot", "cauliflower",
    "cucumber", "eggplant", "okra", "onion", "potato", "radish", "tomato",
    "turnip",
}

# crops usually eaten raw, for the "fruits and vegetables consumed raw" restriction
RAW_CONSUMED_CROPS = {
    "apple", "banana", "mango", "grape", "grapes", "guava", "papaya",
    "orange", "watermelon", "muskmelon", "pomegranate", "chikoo", "sapota",
    "litchi", "strawberry", "pineapple", "pear", "plum", "peach", "apricot",
    "fig", "sweet lime", "mausambi", "pomelo", "custard apple",
    "tomato", "cucumber", "carrot", "radish", "onion", "cabbage",
    "capsicum", "bell pepper", "lettuce", "beetroot", "spring onion",
}

# restrictions that depend on how the chemical is used, not the crop
OPERATOR_CONTEXT_KEYWORDS = (
    "operator", "licensed", "certified applicator", "pest control operator",
    "pco", "trained personnel", "professional applicator",
)
SEED_TREATMENT_KEYWORDS = (
    "seed treatment", "seed dressing", "seed dresser", "treat seed",
    "seed coating", "seed dress",
)
# words that show the answer is warning against a chemical, not recommending it
NEGATION_KEYWORDS = (
    "banned", "should not", "must not", "do not", "avoid",
    "prohibited", "not permitted", "not recommended", "not be recommended",
    "not allowed", "no longer permitted", "discontinued", "not be used",
    "withdrawn", "illegal",
)
FORMULATION_PATTERN = re.compile(
    r"\d+(?:\.\d+)?\s*%?\s*(?:WP|EC|CG|SC|WG|GR|SL|D\.?S\.?|G)\b",
    re.IGNORECASE,
)


def _load_json(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


BANNED_CHEMICALS = _load_json(BANNED_CHEMICALS_PATH)
RESTRICTED_CHEMICALS = _load_json(RESTRICTED_CHEMICALS_PATH)


def _chemical_pattern(name: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![\w]){re.escape(name)}(?![\w])", re.IGNORECASE)


def _evidence_sentence(answer_text: str, match: re.Match[str]) -> str:
    """Return the sentence or line containing a chemical match."""
    boundaries = [
        boundary
        for boundary_match in re.finditer(r"[.!?](?=\s|$)", answer_text)
        if (boundary := boundary_match.end())
    ]
    previous_boundaries = [boundary for boundary in boundaries if boundary <= match.start()]
    next_boundaries = [boundary for boundary in boundaries if boundary >= match.end()]
    start = previous_boundaries[-1] if previous_boundaries else 0
    end = next_boundaries[0] if next_boundaries else len(answer_text)
    return answer_text[start:end].strip()


def _crop_is_restricted(crop: str, restrictions: list[str]) -> bool:
    normalized_crop = crop.strip().casefold()
    normalized_restrictions = {item.strip().casefold() for item in restrictions}

    if normalized_crop in normalized_restrictions:
        return True
    if "vegetables" in normalized_restrictions and normalized_crop in VEGETABLE_CROPS:
        return True
    if (
        "fruits and vegetables consumed raw" in normalized_restrictions
        and normalized_crop in RAW_CONSUMED_CROPS
    ):
        return True
    if "all agriculture except locust control" in normalized_restrictions:
        return True
    if "all crops except wheat" in normalized_restrictions:
        return normalized_crop != "wheat"
    return False


def _nearby_keyword(evidence: str, keywords: tuple[str, ...]) -> bool:
    lowered = evidence.casefold()
    return any(keyword in lowered for keyword in keywords)


NEGATION_WINDOW_CHARS = 200


def _first_recommending_match(
    name: str, answer_text: str
) -> re.Match[str] | None:
    """First mention of the chemical that isn't a warning against it, or None.

    Looks at a window around the mention, since the warning is often in the
    next sentence.
    """
    for match in _chemical_pattern(name).finditer(answer_text):
        window_start = max(0, match.start() - NEGATION_WINDOW_CHARS)
        window_end = min(len(answer_text), match.end() + NEGATION_WINDOW_CHARS)
        window = answer_text[window_start:window_end]
        if not _nearby_keyword(window, NEGATION_KEYWORDS):
            return match
    return None


def _restriction_kind_status(
    chemical: dict[str, Any], evidence: str
) -> tuple[str, str] | None:
    """Status and detail for a usage-based restriction, or None for a normal crop restriction."""
    kind = chemical.get("restriction_kind")
    name = chemical["name"]
    if kind == "blanket_ban":
        return FAIL, chemical.get("detail") or f"{name}: use in agriculture withdrawn"
    if kind == "operator_only":
        if _nearby_keyword(evidence, OPERATOR_CONTEXT_KEYWORDS):
            return PASS, f"{name} is scoped to licensed-operator use as required"
        return FAIL, (
            f"{name} is restricted to licensed-operator use; the answer "
            "does not scope it to an operator"
        )
    if kind == "seed_treatment_only":
        if _nearby_keyword(evidence, SEED_TREATMENT_KEYWORDS):
            return PASS, f"{name} is scoped to seed-treatment use as required"
        return FAIL, (
            f"{name} is banned as a foliar spray and permitted only as a "
            "seed treatment; the answer does not scope it to seed treatment"
        )
    if kind == "formulation_only":
        allowed = chemical.get("allowed_formulation", "")
        formulation_match = FORMULATION_PATTERN.search(evidence)
        if formulation_match is None:
            return NOT_EVALUATED, (
                f"Cannot confirm the formulation used for {name}; only "
                f"{allowed} is permitted"
            )
        found_formulation = formulation_match.group(0)
        # ignore spaces and "%" ("3 CG" is the same as "3% CG")
        normalize = lambda text: text.replace(" ", "").replace("%", "").casefold()
        if allowed and normalize(allowed) in normalize(found_formulation):
            return PASS, f"{name} uses the permitted {allowed} formulation"
        return FAIL, (
            f"{name} is banned in all formulations except {allowed}; the "
            f"answer uses {found_formulation}"
        )
    return None


_STATUS_PRIORITY = {FAIL: 2, NOT_EVALUATED: 1, PASS: 0}


def check_banned_chemicals(context: AnswerContext) -> dict[str, Any]:
    """Return banned and crop-restricted chemical checks for an answer."""
    answer_text = context["answer_text"]
    crop = context["crop"]
    banned_result = check_result(
        PASS,
        "No banned chemical found",
        found=None,
        evidence=None,
    )
    restricted_result = check_result(
        PASS,
        "No crop-restricted chemical found",
        found=None,
        restricted_for=[],
        answer_crop=crop,
        evidence=None,
    )

    for chemical in BANNED_CHEMICALS:
        match = _first_recommending_match(chemical["name"], answer_text)
        if match:
            banned_result = check_result(
                FAIL,
                chemical.get("detail") or "Banned chemical found",
                found=chemical["name"],
                evidence=_evidence_sentence(answer_text, match),
            )
            break

    best_priority = _STATUS_PRIORITY[PASS]
    for chemical in RESTRICTED_CHEMICALS:
        match = _first_recommending_match(chemical["name"], answer_text)
        if not match:
            continue
        evidence = _evidence_sentence(answer_text, match)

        kind_result = _restriction_kind_status(chemical, evidence)
        if kind_result is not None:
            status, detail = kind_result
        elif _crop_is_restricted(crop, chemical["restricted_crops"]):
            status, detail = FAIL, (
                chemical.get("detail") or "Chemical is restricted for this crop"
            )
        else:
            continue

        if status == PASS:
            continue
        if _STATUS_PRIORITY[status] > best_priority:
            best_priority = _STATUS_PRIORITY[status]
            extra_fields = dict(
                found=chemical["name"],
                restricted_for=[crop] if status == FAIL else [],
                answer_crop=crop,
                evidence=evidence,
            )
            restricted_result = (
                not_applicable_result(detail, **extra_fields)
                if status == NOT_EVALUATED
                else check_result(status, detail, **extra_fields)
            )
            if status == FAIL:
                break

    return {
        "banned_chemical": banned_result,
        "restricted_chemical": restricted_result,
    }


if __name__ == "__main__":
    examples = [
        ("spray Monocrotophos at 1.6ml per litre\non tomato crop", "Tomato"),
        ("use Chlorpyriphos on Citrus at 2ml/L", "Citrus"),
    ]
    for answer, answer_crop in examples:
        from normalizer import normalize_answer

        context = normalize_answer({"answer_text": answer, "crop": answer_crop})
        print(json.dumps(check_banned_chemicals(context), indent=2))
