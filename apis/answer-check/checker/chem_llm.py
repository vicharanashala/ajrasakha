"""Find banned and restricted chemicals the exact-name lookup can miss.

The model gets the full list and the answer, and returns the exact words that
name a listed chemical: a misspelling, an alias, a name joined to a formulation.
Each quote is checked against the answer, so a made-up quote is dropped. The
list, not the model, decides what is banned; the model only points at words.
"""

from __future__ import annotations

import logging
import os
import re
from functools import lru_cache

from chem_checker import BANNED_CHEMICALS, RESTRICTED_CHEMICALS
from llm_client import LLMCallFailed, call_llm

logger = logging.getLogger("answer_scoring")

LISTED_NAMES = [item["name"] for item in BANNED_CHEMICALS + RESTRICTED_CHEMICALS]
_NAME_BY_KEY = {name.casefold(): name for name in LISTED_NAMES}
# notes in the data files that tell similar names apart, for example two salts of one chemical
LIST_NOTES = [
    (item["name"], item["note"])
    for item in BANNED_CHEMICALS + RESTRICTED_CHEMICALS
    if item.get("note")
]

MAX_ANSWER_CHARS = 16000

# result of the model step, stored on the chemical checks
OK = "ok"
FAILED = "failed"
OFF = "off"

STANCES = ("recommends", "warns_against", "neutral")


def _enabled() -> bool:
    # follow the same mock switch as the other model checks, read at call time
    import llm_checker

    switch = os.getenv("CHEMICAL_MODEL_CHECK", "true").strip().casefold() in {"1", "true", "yes", "on"}
    return switch and not llm_checker.USE_MOCK_LLM


def _notes_block() -> str:
    if not LIST_NOTES:
        return ""
    lines = "\n".join(f"- {name}: {note}" for name, note in LIST_NOTES)
    return f"\nNOTES ON SIMILAR NAMES (follow these):\n{lines}\n"


def build_prompt(answer_text: str) -> str:
    return f"""You check agricultural advice for mentions of chemicals on a fixed list of banned or restricted pesticides.

LIST:
{"; ".join(LISTED_NAMES)}
{_notes_block()}
TEXT:
<<<
{answer_text[:MAX_ANSWER_CHARS]}
>>>

Find every place where the TEXT refers to a chemical from the LIST. Count any of these:
- the exact name, in any letter case
- a common alias, short name or trade name of that chemical
- a misspelling or a phonetic spelling of the name
- the name joined to a formulation, a number, a hyphen or another word
- a shortened or reordered form of the name

Do NOT count:
- ordinary words that only look similar to a listed name
- fertilisers, nutrients, villages, people, places or crops
- chemicals that are not on the LIST, even if they have a similar name
- a different form, salt or compound of the same family that only shares part of a listed name: count it only when the LIST names that exact form

For each one, give:
- "quote": the words that name the chemical exactly as they appear in the TEXT, only the name and not the dose or the rest of the sentence
- "chemical": the name exactly as written in the LIST
- "stance": read the words around the mention and choose one:
  "recommends" if the TEXT advises using it or offers it as an option to use;
  "warns_against" if the TEXT says not to use it, to avoid it, or that it is banned, withdrawn or not recommended;
  "neutral" if it is only mentioned or described, without advising either way.
A word like "avoid" elsewhere in the TEXT, about something else (for example avoiding over-irrigation), is not a warning against this chemical.

Return ONLY JSON, with an empty list if there is none:
{{"mentions": [{{"quote": "...", "chemical": "...", "stance": "recommends"}}]}}"""


def _valid(result) -> bool:
    return (
        isinstance(result, dict)
        and isinstance(result.get("mentions"), list)
        and all(
            isinstance(m, dict) and isinstance(m.get("quote"), str) and isinstance(m.get("chemical"), str)
            for m in result["mentions"]
        )
    )


def _squash(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def verify_mentions(answer_text: str, mentions: list[dict]) -> list[tuple[str, str, str]]:
    """Keep a mention only when its quote is really in the answer and the chemical is on the list.

    Returns (quote, chemical, stance). A missing or unknown stance counts as neutral,
    which is still flagged, so a model slip never hides a chemical.
    """
    haystack = _squash(answer_text)
    kept = []
    for mention in mentions:
        chemical = _NAME_BY_KEY.get(_squash(mention["chemical"]))
        quote = mention["quote"].strip()
        stance = str(mention.get("stance") or "").strip().casefold()
        if stance not in STANCES:
            stance = "neutral"
        if chemical and quote and _squash(quote) in haystack:
            kept.append((quote, chemical, stance))
    return kept


def _letters(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def _edit_distance(a: str, b: str) -> int:
    """Number of single-letter edits (insert, delete, change, swap two neighbours) between two words."""
    rows = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        rows[i][0] = i
    for j in range(len(b) + 1):
        rows[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            rows[i][j] = min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                rows[i][j] = min(rows[i][j], rows[i - 2][j - 2] + 1)
    return rows[len(a)][len(b)]


def _spelling_key(value: str) -> str:
    return _letters(value).replace("ph", "f")


def is_close_spelling(quote: str, chemical: str) -> bool:
    """A typo of the listed name (a letter changed, missing or swapped), not a different or shortened name.

    "Triazofos" and "Triazophs" are close to "Triazophos". "Azophos" is not: it is a different word.
    """
    wanted = _spelling_key(chemical)
    allowed = max(1, int(len(wanted) * 0.2))
    candidates = [_spelling_key(quote)] + [_spelling_key(word) for word in re.findall(r"[A-Za-z][A-Za-z-]+", quote)]
    return any(c and _edit_distance(c, wanted) <= allowed for c in candidates)


def needs_confirmation(quote: str, chemical: str) -> bool:
    """A quote that holds the whole listed name ("Mancozeb 75 WP") is the chemical itself.

    Anything else (a misspelling, an alias, a brand name) is a guess by the model and
    gets a second look, because two different chemicals can share part of a name.
    """
    return _letters(chemical) not in _letters(quote)


def build_confirmation_prompt(quote: str, chemical: str) -> str:
    note = next((n for name, n in LIST_NOTES if name == chemical), "")
    extra = f"\nNote: {note}" if note else ""
    return f"""Two names from agricultural advice. Are they the same chemical?

Name in the text: "{quote}"
Name on our list: "{chemical}"{extra}

Count them as the same chemical only if one is a misspelling, a spelling variant, an alternative name or a trade name of the other.
Answer "no" if they are different chemicals, even when the names look alike or belong to the same family. A name that is only a part of the listed name (for example "azophos" inside "triazophos") is NOT the same chemical. Answer "unsure" only if you really cannot tell.

Return ONLY JSON: {{"same": "yes"}} or {{"same": "no"}} or {{"same": "unsure"}}"""


def _valid_confirmation(result) -> bool:
    return isinstance(result, dict) and str(result.get("same", "")).strip().casefold() in {"yes", "no", "unsure"}


@lru_cache(maxsize=4096)
def confirm_same_chemical(quote: str, chemical: str) -> str:
    """Ask the model whether the quote is the listed chemical: yes, no or unsure.

    A failed call counts as unsure. An unsure answer does not confirm a match that is not a close spelling.
    """
    try:
        result = call_llm(build_confirmation_prompt(quote, chemical), _valid_confirmation)
    except LLMCallFailed as exc:
        logger.warning("chemical confirmation failed, not confirming the match: %s", str(exc)[:120])
        return "unsure"
    return str(result["same"]).strip().casefold()


def confirm_mentions(mentions: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """Keep a match that holds the whole name or is a close misspelling of it; any other name must be confirmed as the same chemical."""
    return [
        m for m in mentions
        if not needs_confirmation(m[0], m[1])
        or is_close_spelling(m[0], m[1])
        or confirm_same_chemical(m[0].strip().casefold(), m[1]) == "yes"
    ]


def find_chemical_mentions(answer_text: str) -> tuple[list[tuple[str, str, str]], str]:
    """Return the verified (quote, chemical, stance) triples and how the model step went (ok, failed or off)."""
    if not _enabled() or not answer_text.strip():
        return [], OFF
    try:
        result = call_llm(build_prompt(answer_text), _valid)
    except LLMCallFailed as exc:
        logger.warning("chemical model check failed, using the exact lookup only: %s", str(exc)[:120])
        return [], FAILED
    return confirm_mentions(verify_mentions(answer_text, result["mentions"])), OK
