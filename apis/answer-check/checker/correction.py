"""Draft a corrected answer for a reviewer, from the answer and the problems found in it.

The model makes the smallest edit that fixes each problem, using only what is in the
answer or in the source pages it cites. The draft is then checked on its own: it is thrown
away if it keeps the problem, changes too much, or brings in a dose or number that is not
in the answer or the sources. A reviewer always decides; nothing here changes an answer.
"""

from __future__ import annotations

import difflib
import re
from typing import Any

from chem_checker import check_banned_chemicals
from llm_client import LLMCallFailed, call_llm
from normalizer import normalize_answer
from officer_checker import OFFICER_NAME_PATTERN
from source_fidelity import fetch_source_text, source_budget
from uniformity_checker import extract_chemical_doses

# problems a rewrite can address; a missing page number or a dose that differs from other
# answers needs someone to look something up, and a wrong crop or topic is not an edit
FIXABLE = {
    "banned_chemical": "Banned chemical",
    "restricted_chemical": "Chemical restricted for this crop",
    "officer_name": "Personal officer name",
    "private_product_name": "Brand name used instead of the generic name",
    "source_fidelity": "Dose or claim not supported by the cited source",
    "answer_structure": "Missing content the answer should have",
    "query_properly_answered": "Part of the question is not answered",
    "sequence": "Information is in a confusing order",
    "local_name_mismatch": "Local name used incorrectly",
}
# these may need facts from the sources
NEEDS_SOURCES = {
    "banned_chemical", "restricted_chemical", "private_product_name",
    "source_fidelity", "answer_structure", "query_properly_answered", "local_name_mismatch",
}

PLACEHOLDER = "[REVIEWER TO CHOOSE"
MAX_SOURCE_CHARS = 2500
SHORT_SOURCE_CHARS = 1200
MIN_SIMILARITY = 0.6
MAX_REMOVED_SHARE = 0.2
MAX_PLACEHOLDERS = 3
MAX_COMPLETION_TOKENS = 4096

_MEASURE = re.compile(r"\d+(?:\.\d+)?\s*(?:ml|g|kg|l|litres?|liters?|%|days?|hours?|weeks?)\b", re.IGNORECASE)


def problems_for(checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The failed checks a rewrite can address, with the reason a reviewer sees."""
    return [
        {
            "name": check["parameter"],
            "label": FIXABLE[check["parameter"]],
            "reason": check["reason"],
            "words": check.get("highlight") or [],
        }
        for check in checks
        if check["result"] == "FAIL" and check["parameter"] in FIXABLE
    ]


def source_excerpts(sources: list[dict[str, Any]], answer_text: str) -> list[dict[str, str]]:
    """The cited pages of every source, trimmed so the prompt stays small."""
    excerpts = []
    share = min(MAX_SOURCE_CHARS, source_budget(len(sources)))
    for source in sources:
        text = fetch_source_text(str(source.get("source") or ""), source.get("page"), answer_text, budget=share)
        if text:
            excerpts.append({"name": str(source.get("sourceName") or source.get("source")), "text": text[:share]})
    return excerpts


def build_prompt(
    question: str,
    answer: str,
    crop: str,
    state: str,
    problems: list[dict[str, Any]],
    excerpts: list[dict[str, str]],
) -> str:
    listed = "\n".join(
        f"{number}. {item['label']}: {item['reason']}" for number, item in enumerate(problems, start=1)
    )
    if excerpts:
        pages = "\n\n".join(f"[{item['name']}]\n{item['text']}" for item in excerpts)
    else:
        pages = "(no source pages could be read)"
    return f"""You edit an agricultural answer so a reviewer can fix the problems found in it.
Make the SMALLEST edit that fixes each problem. Keep everything else word for word.

QUESTION: {question}
CROP: {crop} | STATE: {state}

ANSWER:
<<<
{answer}
>>>

PROBLEMS FOUND IN THE ANSWER:
{listed}

SOURCE PAGES CITED BY THE ANSWER (the only outside facts you may use):
<<<
{pages}
>>>

RULES:
- Change only what is needed for the problems above. Do not rewrite, shorten, reorder or reword anything else.
- Fix only the specific word, claim or number a problem points at. Never delete the other items next to it, such as the other chemicals in a list, even if you are unsure about them.
- A source page that does not mention something is NOT a reason to delete it. Change or remove a claim only when the SOURCE PAGES state something different. If they simply do not cover it, leave it unchanged and say so in "not_fixed".
- Use only facts, chemical names, doses and numbers that appear in the ANSWER or the SOURCE PAGES. Never invent a chemical, a dose, a timing or any number.
- If fixing a problem needs a chemical, dose or number that is in neither, write {PLACEHOLDER}: what is needed] at that spot instead.
- Banned or restricted chemical: remove the recommendation, or replace it with an alternative that appears in the ANSWER or SOURCE PAGES, with its dose from there. Otherwise use the placeholder.
- Personal officer name: remove the name and keep the rest, for example "the district agriculture office".
- Brand name: replace it with the generic chemical name only if the ANSWER or SOURCE PAGES give it. Otherwise use the placeholder.
- Missing content or an unanswered part of the question: add it only from the SOURCE PAGES. If they do not cover it, add nothing and say so in "not_fixed".
- Confusing order: move the existing sentences into a sensible order without changing them.
- KEEP THE FORMAT of the ANSWER exactly: the same paragraphs, line breaks and blank lines, the same bullet marker and numbering style, the same headings and capital letters. Do not merge or split paragraphs and do not turn a list into a paragraph or the other way round. If you remove a list item, renumber the items after it.

Return ONLY JSON:
{{"corrected_answer": "the full corrected answer", "changes": ["one short line per change"], "not_fixed": ["each problem that could not be fixed from the ANSWER or SOURCE PAGES"]}}"""


_BULLET = re.compile(r"^\s*([-*\u2022\u2013])\s+")
_NUMBERED = re.compile(r"^\s*\(?\d+([.)])\s+")
_HEADING = re.compile(r"^\s*(?:#{1,6}\s+\S|\*\*[^*]{2,80}\*\*\s*:?\s*$|[A-Z][A-Za-z /&,()-]{2,60}:\s*$)")
# problems whose fix adds content, so the answer may gain a paragraph or a list item
ADDS_CONTENT = {"answer_structure", "query_properly_answered", "sequence"}


def format_profile(text: str) -> dict[str, Any]:
    """What the layout of an answer is made of: paragraphs, list items, headings and how they are marked."""
    bullets = numbered = headings = 0
    bullet_marks: set[str] = set()
    number_marks: set[str] = set()
    paragraphs = 0
    in_paragraph = False
    for line in text.replace("\r\n", "\n").split("\n"):
        if not line.strip():
            in_paragraph = False
            continue
        if not in_paragraph:
            paragraphs += 1
            in_paragraph = True
        if (match := _BULLET.match(line)):
            bullets += 1
            bullet_marks.add(match.group(1))
        elif (match := _NUMBERED.match(line)):
            numbered += 1
            number_marks.add(match.group(1))
        elif _HEADING.match(line):
            headings += 1
    return {
        "paragraphs": paragraphs, "bullets": bullets, "numbered": numbered, "headings": headings,
        "bullet_marks": bullet_marks, "number_marks": number_marks,
    }


def format_changes(original: str, corrected: str, may_add: bool = False) -> list[str]:
    """How the draft's layout differs from the original's, in words; empty when the format is kept.

    Removing or adding one item is allowed, because fixing a problem can mean deleting a
    list item or (for a missing part) adding one. Anything larger, a different bullet or
    numbering style, or a merged or split paragraph is a change of format.
    """
    before, after = format_profile(original), format_profile(corrected)
    found: list[str] = []
    for key, label in (("paragraphs", "paragraphs"), ("bullets", "bullet points"), ("numbered", "numbered items"), ("headings", "headings")):
        low = before[key] - 1
        high = before[key] + (3 if may_add else 1)
        if not low <= after[key] <= high:
            found.append(f"{label}: {before[key]} before, {after[key]} after")
    for key, label in (("bullet_marks", "bullet marker"), ("number_marks", "numbering style")):
        if before[key] and after[key] and before[key] != after[key]:
            found.append(f"{label} changed")
        if before[key] and not after[key]:
            found.append(f"the {label} is gone")
    return found


def _valid(result: Any) -> bool:
    return (
        isinstance(result, dict)
        and isinstance(result.get("corrected_answer"), str)
        and isinstance(result.get("changes", []), list)
        and isinstance(result.get("not_fixed", []), list)
    )


def _doses(text: str) -> set[tuple[str, str, str, str]]:
    return {
        (o["chemical"].casefold(), o["dose"], o["unit"].casefold(), o["per"].casefold())
        for o in extract_chemical_doses({"answer_text": text})
    }


_UNIT_SPELLINGS = {"litre": "l", "litres": "l", "liter": "l", "liters": "l", "day": "days", "hour": "hours", "week": "weeks"}


def _measures(text: str) -> set[str]:
    """Numbers with a unit, such as 2ml or 15days, with unit spellings made alike."""
    found = set()
    for match in _MEASURE.finditer(text):
        number, unit = re.match(r"(\d+(?:\.\d+)?)\s*(.+)", match.group(0)).groups()
        unit = _UNIT_SPELLINGS.get(unit.casefold(), unit.casefold())
        if number == "1" and unit == "l":
            continue  # "per litre" and "per 1 L" say the same thing
        found.add(f"{number}{unit}")
    return found


def ungrounded(original: str, corrected: str, source_text: str) -> list[str]:
    """Doses and numbers in the draft that are in neither the answer nor the sources."""
    known_text = original + "\n" + source_text
    known_lower = known_text.casefold()
    known_doses, known_measures = _doses(known_text), _measures(known_text)
    # a placeholder is the reviewer's to fill, so numbers inside it are not a claim
    claim_text = re.sub(re.escape(PLACEHOLDER) + r"[^\]]*\]", " ", corrected)
    new = []
    for chemical, dose, unit, _ in sorted(_doses(claim_text) - known_doses):
        if chemical in known_lower and f"{dose}{unit}" in known_measures:
            continue  # same chemical and same amount, only written in a different letter case
        new.append(f"{chemical} {dose}{unit}")
    new += sorted(_measures(claim_text) - known_measures)
    return new


def _strip_markers(text: str, original: str) -> str:
    """The model sometimes copies the <<< and >>> markers of the prompt into its answer."""
    for marker in ("<<<", ">>>"):
        if marker not in original:
            text = text.replace(marker, "")
    return text.strip()


def removed_share(original: str, corrected: str) -> float:
    """The share of the original words that the draft deletes or replaces."""
    before, after = original.split(), corrected.split()
    matcher = difflib.SequenceMatcher(None, before, after, autojunk=False)
    removed = sum(i2 - i1 for tag, i1, i2, _, _ in matcher.get_opcodes() if tag in ("delete", "replace"))
    return removed / max(1, len(before))


def similarity(original: str, corrected: str) -> float:
    return difflib.SequenceMatcher(None, original.split(), corrected.split(), autojunk=False).ratio()


def still_has_problem(corrected: str, crop: str, problems: list[dict[str, Any]]) -> str | None:
    """Run the checks that need no model on the draft. Returns what is still wrong, or None."""
    names = {p["name"] for p in problems}
    if "banned_chemical" in names or "restricted_chemical" in names:
        context = normalize_answer({"answer_text": corrected, "crop": crop})
        result = check_banned_chemicals(context)
        for name in ("banned_chemical", "restricted_chemical"):
            if name in names and result[name]["status"] == "FAIL":
                return f"the draft still has {result[name].get('found')}"
        # the words the model found in the original, such as a misspelling or a brand
        for problem in problems:
            if problem["name"] in ("banned_chemical", "restricted_chemical"):
                for word in problem["words"]:
                    if re.search(rf"(?<![A-Za-z]){re.escape(word)}(?![A-Za-z])", corrected, re.IGNORECASE):
                        return f"the draft still has '{word}'"
    if "officer_name" in names and OFFICER_NAME_PATTERN.search(corrected):
        return "the draft still names an officer"
    return None


def write_correction(doc: dict[str, Any]) -> dict[str, Any]:
    """Draft a correction for one stored answer. Returns a result with a status:
    ok (a draft to show), skipped (nothing a rewrite can fix), rejected (the draft failed a
    check, with the reason) or failed (the model could not be reached)."""
    problems = problems_for(doc["checks"])
    if not problems:
        return {"status": "skipped", "note": "no problem a rewrite can fix"}

    excerpts = source_excerpts(doc.get("sources") or [], doc["answer"]) if any(p["name"] in NEEDS_SOURCES for p in problems) else []
    result = None
    last_error = ""
    # the model server often fails on long prompts, so the next tries use shorter excerpts, then none
    for limit in (MAX_SOURCE_CHARS, SHORT_SOURCE_CHARS, 0) if excerpts else (MAX_SOURCE_CHARS,):
        excerpts = [{**e, "text": e["text"][:limit]} for e in excerpts] if limit else []
        prompt = build_prompt(doc["question"], doc["answer"], doc["crop"], doc["state"], problems, excerpts)
        try:
            result = call_llm(prompt, _valid, max_completion_tokens=MAX_COMPLETION_TOKENS)
            break
        except LLMCallFailed as exc:
            last_error = str(exc)[:120]
    if result is None:
        return {"status": "failed", "note": last_error}

    original = doc["answer"]
    corrected = _strip_markers(result["corrected_answer"], original)
    changes = [str(c) for c in result.get("changes", [])]
    not_fixed = [str(n) for n in result.get("not_fixed", [])]

    if not corrected or corrected == original.strip():
        return {"status": "rejected", "note": "the draft changed nothing", "notFixed": not_fixed}
    if similarity(original, corrected) < MIN_SIMILARITY:
        return {"status": "rejected", "note": "the draft changes too much of the answer", "draft": corrected}
    if removed_share(original, corrected) > MAX_REMOVED_SHARE:
        return {"status": "rejected", "note": "the draft removes too much of the answer", "draft": corrected}
    layout = format_changes(original, corrected, may_add=any(p["name"] in ADDS_CONTENT for p in problems))
    if layout:
        return {"status": "rejected", "note": f"the draft changes the format of the answer ({'; '.join(layout)})", "draft": corrected}
    if corrected.count(PLACEHOLDER) > MAX_PLACEHOLDERS:
        return {"status": "rejected", "note": "the draft leaves too many spots for the reviewer", "draft": corrected}
    invented = ungrounded(original, corrected, "\n".join(e["text"] for e in excerpts))
    if invented:
        return {
            "status": "rejected",
            "note": f"the draft brings in something not in the answer or its sources: {', '.join(invented[:4])}",
            "draft": corrected,
        }
    wrong = still_has_problem(corrected, doc["crop"], problems)
    if wrong:
        return {"status": "rejected", "note": wrong, "draft": corrected}

    return {
        "status": "ok",
        "correctedAnswer": corrected,
        "changes": changes,
        "notFixed": not_fixed,
        "needsReviewer": PLACEHOLDER in corrected,
        "usedSources": [e["name"] for e in excerpts],
    }
