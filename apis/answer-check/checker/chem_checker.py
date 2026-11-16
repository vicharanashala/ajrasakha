"""Check answer text for banned and crop-restricted chemicals."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from chem_dose import EXCEEDS, WITHIN, dose_verdict, rule_text
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
# warnings that only count right before the chemical, in the same sentence: words like "never"
# also appear in advice that has nothing to do with the chemical ("never mix new grain with old")
TIGHT_NEGATION_BEFORE = re.compile(
    r"\b(?:never|don't|dont|shall not|cannot|can't|refrain from|stop using|not advisable to use)\b[^.!?\n]{0,40}$",
    re.IGNORECASE,
)
TIGHT_NEGATION_AFTER = re.compile(
    r"^[^.!?\n]{0,40}\b(?:was phased out|is phased out|not advised|not advisable|is not safe|no longer (?:allowed|used|permitted|recommended))\b",
    re.IGNORECASE,
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
    # a name may be followed by a number or formulation code ("Aldrin10G"), but not by more letters
    return re.compile(rf"(?<![\w]){re.escape(name)}(?![^\W\d_])", re.IGNORECASE)


def _evidence_sentence(answer_text: str, match: re.Match[str]) -> str:
    """Return the sentence or line containing a chemical match."""
    return _evidence_sentence_at(answer_text, match.start(), match.end())


def _evidence_sentence_at(answer_text: str, start: int, end: int) -> str:
    """Return the sentence or line containing the words at start:end."""
    boundaries = [
        boundary
        for boundary_match in re.finditer(r"[.!?](?=\s|$)", answer_text)
        if (boundary := boundary_match.end())
    ]
    previous_boundaries = [boundary for boundary in boundaries if boundary <= start]
    next_boundaries = [boundary for boundary in boundaries if boundary >= end]
    sentence_start = previous_boundaries[-1] if previous_boundaries else 0
    sentence_end = next_boundaries[0] if next_boundaries else len(answer_text)
    return answer_text[sentence_start:sentence_end].strip()


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


def _is_warning(answer_text: str, start: int, end: int) -> bool:
    """Whether the words at start:end sit next to wording that warns against the chemical.

    Looks at a window around the mention, since the warning is often in the
    next sentence.
    """
    window = answer_text[
        max(0, start - NEGATION_WINDOW_CHARS):min(len(answer_text), end + NEGATION_WINDOW_CHARS)
    ]
    if _nearby_keyword(window, NEGATION_KEYWORDS):
        return True
    before = answer_text[max(0, start - 60):start]
    after = answer_text[end:end + 60]
    return bool(TIGHT_NEGATION_BEFORE.search(before) or TIGHT_NEGATION_AFTER.search(after))


def _first_recommending_match(
    name: str, answer_text: str
) -> re.Match[str] | None:
    """First mention of the chemical that isn't a warning against it, or None."""
    for match in _chemical_pattern(name).finditer(answer_text):
        if not _is_warning(answer_text, match.start(), match.end()):
            return match
    return None


def _first_recommending_mention(
    name: str,
    answer_text: str,
    model_mentions: list[tuple] | None = None,
) -> tuple[int, int] | None:
    """Where the chemical is first mentioned without a warning, as (start, end), or None.

    The exact-name lookup comes first, with the warning-word window. Then the words the
    model pointed at (a misspelling, an alias, a name joined to a formulation). When the
    model also read the context and says the answer does not warn against the chemical,
    that counts even next to a warning word such as "avoid" about something else. A
    mention without a stance is held to the warning-word window, as before.
    """
    match = _first_recommending_match(name, answer_text)
    if match:
        return match.start(), match.end()
    for quote, chemical, *rest in model_mentions or ():
        if chemical.casefold() != name.casefold():
            continue
        stance = rest[0] if rest else None
        if stance == "warns_against":
            continue
        for found in re.finditer(re.escape(quote), answer_text, re.IGNORECASE):
            if stance is not None or not _is_warning(answer_text, found.start(), found.end()):
                return found.start(), found.end()
    return None


def _restriction_kind_status(
    chemical: dict[str, Any],
    evidence: str,
    answer_text: str = "",
    span: tuple[int, int] | None = None,
) -> tuple[str, str] | None:
    """Status and detail for a usage-based restriction, or None for a normal crop restriction."""
    kind = chemical.get("restriction_kind")
    name = chemical["name"]
    if kind == "dose_limit" and chemical.get("permitted_dose") and span is not None:
        rule = chemical["permitted_dose"]
        verdict, written = dose_verdict(rule, answer_text, span)
        if verdict == WITHIN:
            return PASS, f"{name} is within the permitted dose of {rule_text(rule)}"
        if verdict == EXCEEDS:
            return FAIL, f"{name} is permitted only up to {rule_text(rule)}; the answer uses {written}"
        return NOT_EVALUATED, (
            f"Cannot confirm the dose of {name}; it is permitted only up to {rule_text(rule)}"
        )
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


def check_banned_chemicals(
    context: AnswerContext,
    model_mentions: list[tuple] | None = None,
    model_check: str | None = None,
) -> dict[str, Any]:
    """Return banned and crop-restricted chemical checks for an answer.

    The exact-name lookup always runs. model_mentions are extra (quote, chemical)
    pairs from chem_llm, for names the lookup cannot see; they go through the same
    warning and crop rules. model_check says how the model step went (ok, failed,
    off) and is kept on the result, so a reviewer can tell it did not run.
    """
    answer_text = context["answer_text"]
    crop = context["crop"]
    extra = {"model_check": model_check} if model_check else {}
    banned_result = check_result(
        PASS,
        "No banned chemical found",
        found=None,
        evidence=None,
        **extra,
    )
    restricted_result = check_result(
        PASS,
        "No crop-restricted chemical found",
        found=None,
        restricted_for=[],
        answer_crop=crop,
        evidence=None,
        **extra,
    )

    banned_hits: list[tuple[str, str, str, str, tuple[int, int]]] = []
    for chemical in BANNED_CHEMICALS:
        span = _first_recommending_mention(chemical["name"], answer_text, model_mentions)
        if span:
            detail = chemical.get("detail") or "Banned chemical found"
            rule = chemical.get("permitted_dose")
            if rule:
                verdict, written = dose_verdict(rule, answer_text, span)
                if verdict == WITHIN:
                    continue  # allowed at this dose, so it is not a banned use
                detail = (
                    f"{chemical['name']} is permitted only up to {rule_text(rule)}; "
                    + (f"the answer uses {written}" if verdict == EXCEEDS else "the answer gives no dose that can be compared")
                )
            written_as = answer_text[span[0]:span[1]]
            if written_as.casefold() != chemical["name"].casefold() and len(written_as) <= 40:
                detail += f" (written as '{written_as}')"
            banned_hits.append((chemical["name"], written_as, detail, _evidence_sentence_at(answer_text, *span), span))

    # a name inside a longer listed name is the same mention ("Ethyl Mercury Chloride" in
    # "Methoxy Ethyl Mercury Chloride"), so only the longer one is kept
    banned_hits = [
        hit for hit in banned_hits
        if not any(
            other is not hit and other[4][0] <= hit[4][0] and hit[4][1] <= other[4][1]
            and (other[4][1] - other[4][0]) > (hit[4][1] - hit[4][0])
            for other in banned_hits
        )
    ]

    if banned_hits:
        # the first one fills the usual fields; every one found is listed in found_all
        name, written_as, detail, evidence, _ = banned_hits[0]
        banned_result = check_result(
            FAIL,
            detail,
            found=name,
            matched_text=written_as,
            evidence=evidence,
            found_all=[hit[0] for hit in banned_hits],
            matched_texts=[hit[1] for hit in banned_hits],
            evidence_all=[hit[3] for hit in banned_hits],
            **extra,
        )

    best_priority = _STATUS_PRIORITY[PASS]
    restricted_hits: list[tuple[str, str, str]] = []
    for chemical in RESTRICTED_CHEMICALS:
        span = _first_recommending_mention(chemical["name"], answer_text, model_mentions)
        if not span:
            continue
        evidence = _evidence_sentence_at(answer_text, *span)

        kind_result = _restriction_kind_status(chemical, evidence, answer_text, span)
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
        if status == FAIL:
            restricted_hits.append((chemical["name"], answer_text[span[0]:span[1]], evidence))
        if _STATUS_PRIORITY[status] > best_priority:
            best_priority = _STATUS_PRIORITY[status]
            extra_fields = dict(
                found=chemical["name"],
                matched_text=answer_text[span[0]:span[1]],
                restricted_for=[crop] if status == FAIL else [],
                answer_crop=crop,
                evidence=evidence,
                **extra,
            )
            restricted_result = (
                not_applicable_result(detail, **extra_fields)
                if status == NOT_EVALUATED
                else check_result(status, detail, **extra_fields)
            )

    if len(restricted_hits) > 1 and restricted_result.get("status") == FAIL:
        # every restricted chemical found is listed; the first fills the usual fields
        restricted_result = {
            **restricted_result,
            "found_all": [hit[0] for hit in restricted_hits],
            "matched_texts": [hit[1] for hit in restricted_hits],
            "evidence_all": [hit[2] for hit in restricted_hits],
        }

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
