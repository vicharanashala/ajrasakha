"""Draft a GDB answer from library passages, using only those passages.

Passages come from anara_client.search_library. The model is the MiniMax client
the checks already use (checker/llm_client.py), so the same retry and key
settings apply.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# checker modules import each other by plain name, so their folder must be on the path
sys.path.insert(0, str(Path(__file__).resolve().parent / "checker"))

load_dotenv(Path(__file__).resolve().parent / ".env")

from llm_client import LLMCallFailed, call_llm  # noqa: E402

# the model's reasoning time grows with the passages it is given (about 30 s for 8, about 70 s for 12)
MAX_PASSAGES = 8
# a reviewer is waiting on the button, so a draft gives up after at most 3.5 minutes
# (3 attempts of up to 70 seconds) instead of retrying for as long as the checks do
DRAFT_ATTEMPTS = 3
DRAFT_ATTEMPT_TIMEOUT_SECONDS = 70
# the model reasons before it answers, and the reasoning counts against this budget: at 2048 it
# often used all of it and returned no answer text (finish_reason "length")
DRAFT_MAX_COMPLETION_TOKENS = 6000
DRAFT_MODEL = os.getenv("DRAFT_MINIMAX_MODEL", "MiniMax-M3")
DRAFT_URL = os.getenv(
    "DRAFT_MINIMAX_URL", "https://samagama.in/platform/proxy/v1/chat/completions"
)
# empty means the drafter uses MINIMAX_API_KEY, the same key as the checks
DRAFT_API_KEY = os.getenv("DRAFT_MINIMAX_API_KEY", "").strip() or None
# MiniMax: with thinking on, about half the drafts spent the whole budget deliberating and returned no
# answer (65 s, nothing written); with it off a draft takes about 7 s. DRAFT_THINKING=on turns it back on.
# Gemini (the URL is Google's): reasoning stays on but low, which is about 8 s a draft.
if "googleapis.com" in DRAFT_URL:
    DRAFT_EXTRA = {"reasoning_effort": os.getenv("DRAFT_REASONING_EFFORT", "low")}
elif os.getenv("DRAFT_THINKING", "off").strip().lower() == "on":
    DRAFT_EXTRA = {}
else:
    DRAFT_EXTRA = {"thinking": {"type": "disabled"}}

PROMPT_TEMPLATE = """You are drafting an agricultural answer for a farmer-facing database.

Use ONLY the numbered passages below. Do not add facts that are not in them.
Do not name a crop, variety, disease, chemical or dose unless a passage names it.
{crop_rule}Cite each sentence with the passage number it came from, like [P3].
If the passages do not answer the question, return an empty answer and say so in "note".

{shape}
Return only JSON in this form:
{{"answer": "...", "used_passages": [3, 5], "note": ""}}

Question: {question}

Some passages are tables whose columns have run together. Read them row by row (crop, disease or
pest, product, dose, waiting period or interval in days) and use the figures of the row for the
crop asked.

Passages:
{passages}
"""

# When Anara's agent did the research, its write-up is the content and the model only lays it out: the model
# used to write its own, shorter answer from the passages and dropped methods the agent had found.
LAYOUT_TEMPLATE = """You are laying out an agricultural answer for a farmer-facing database. The research write-up below was
written by a library agent from the passages listed after it; [P#] marks the passage holding each fact.

Do not summarise, shorten or drop anything. Every method, product, dose, figure, timing, specification and
condition in the write-up stays in the answer, arranged in the layout below. Remove only: statements about what the
library lacks, mentions of other states' documents or of another crop, talk about the searching, and repeated facts.
Keep each fact's passage numbers (one to three per sentence) and add no fact that neither the write-up nor the
passages hold. {crop_rule}If the write-up holds nothing that answers the question, return an empty answer and say so in "note".

{shape}
Return only JSON in this form:
{{"answer": "...", "used_passages": [3, 5], "note": ""}}

Question: {question}

Research write-up:
{notes}

Passages:
{passages}
"""


STRUCTURES_PATH = Path(__file__).resolve().parent / "answer_structures.json"

GENERIC_SHAPE = (
    "Write the answer in sections, each with a short title on its own line and then its text: "
    "the direct answer to the question first, then the steps or reasons, then a short conclusion "
    "that points the farmer to the local KVK if their case differs. Leave out anything the "
    "passages do not cover.\n"
)

SHAPE_TEMPLATE = """Write the answer in sections, each with a short title on its own line and then its text.
The usual sections of an answer in the domain "{domain}" are listed below. Use the Narrow list for
a question about one specific thing (a dose, a timing, one fix), otherwise the Broad list. Keep
their order, but give each section a plain title that fits this question. Leave a section out
completely when the passages have nothing for it: never write that something is not given, and
never repeat a fact in a second section. Put the direct answer first and end with a short
conclusion that points the farmer to the local KVK if their case differs. The lists only give the
sections: every fact comes from the passages.

Broad: {broad}
Narrow: {narrow}
"""

# the writing rules are on by default; DRAFT_PROMPT=v1 turns them off (the layout alone)
WRITING_RULES_ON = os.getenv("DRAFT_PROMPT", "v4").strip().lower() != "v1"

WRITING_RULES = """Rules for writing the answer:
- Name the disease, pest or subject in the first sentence.
- If a title in the list names a crop, disease, pest or chemical other than the one asked, give it a plain title for the one asked.
- For chemicals, give the products the passages list for this crop, each with the dose and waiting period of ITS OWN table row. Never mix figures from different rows. If a waiting period is missing or not credible (for example over 100 days), leave it out. When products with different modes of action are given, suggest rotating them.
- Never write that a passage lacks something, and never mention "the passages". Leave that point out.
- After each sentence put only the one to three passage numbers that hold its facts, never a long run of numbers.
- Mark advice that is optional or depends on the farmer's case.

"""

_structures: dict[str, Any] | None = None


def _load_structures() -> dict[str, Any]:
    global _structures
    if _structures is None:
        try:
            _structures = json.loads(STRUCTURES_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _structures = {}
    return _structures


def _normal(text: str | None) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).split())


def structure_for(domain: str | None) -> dict[str, Any] | None:
    """The answer outlines of a record's domain, found by its code (PDM) or by its name."""
    wanted = _normal(domain)
    if not wanted:
        return None
    structures = _load_structures()
    for code, entry in structures.items():
        if wanted == _normal(code) or wanted == _normal(entry["domain"]):
            return entry
    for entry in structures.values():  # a name that only contains, or is part of, the full one
        name = _normal(entry["domain"])
        if len(wanted) > 5 and (wanted in name or name in wanted):
            return entry
    return None


def _outline(steps: list[dict[str, str]]) -> str:
    # titles only: the notes made the model spend its whole budget deciding how to follow them
    return "; ".join(f"{number}. {step['step']}" for number, step in enumerate(steps, start=1))


def answer_shape(domain: str | None, rules: bool | None = None) -> str:
    rules_text = WRITING_RULES if (WRITING_RULES_ON if rules is None else rules) else ""
    entry = structure_for(domain)
    if entry is None:
        return rules_text + GENERIC_SHAPE
    return rules_text + SHAPE_TEMPLATE.format(
        domain=entry["domain"], broad=_outline(entry["broad"]), narrow=_outline(entry["narrow"])
    )


# an answer that uses less than this share of the passages the agent's findings rest on is written again, at most twice
LAYOUT_MIN_COVERAGE = 0.6
LAYOUT_RETRIES = 2


def _coverage(result: dict[str, Any], wanted: set[int]) -> float:
    """The share of the passages the findings rest on that the answer cites."""
    if not wanted:
        return 1.0
    used = {number for number in result.get("used_passages", []) if isinstance(number, int)}
    return len(used & wanted) / len(wanted)


def _format_passages(passages: list[dict[str, Any]]) -> str:
    lines = []
    for number, passage in enumerate(passages, start=1):
        source_pages = passage.get("sourcePages") or []
        where = f"PDF page {passage.get('pageNumber')}" if passage.get("pageNumber") else ""
        if source_pages:
            pages = ", ".join(str(p) for p in source_pages)
            where = f"{where} (source page {pages})" if where else f"source page {pages}"
        where = where or "page unknown"
        lines.append(
            f"[P{number}] {passage.get('documentName', 'unknown document')}, "
            f"{where}:\n{passage.get('text', '')}"
        )
    return "\n\n".join(lines)


def draft_answer(
    question: str, passages: list[dict[str, Any]], crop: str | None = None, domain: str | None = None,
    rules: bool | None = None, notes: str | None = None, max_passages: int | None = None,
) -> dict[str, Any]:
    """Return the draft plus the passages it cites, with document and page for each.

    Passage numbers in the answer map back to the passage list, so every citation
    points to a document and PDF page the reviewer can open.
    """
    chosen = passages[:max_passages or MAX_PASSAGES]
    if not chosen:
        note = f"The library has no documents for {crop}" if crop else "No library passages found"
        return {"answer": "", "citations": [], "note": note}

    crop_rule = (
        f"The question is about the crop: {crop}. A passage about a different crop does not answer it.\n"
        if crop else ""
    )
    def ask(shape: str, attempts: int) -> dict[str, Any]:
        template = LAYOUT_TEMPLATE if notes else PROMPT_TEMPLATE
        prompt = template.format(
            question=question, passages=_format_passages(chosen), crop_rule=crop_rule, shape=shape, notes=notes or "",
        )
        return call_llm(
            prompt,
            validate=lambda r: isinstance(r, dict) and "answer" in r,
            model=DRAFT_MODEL,
            url=DRAFT_URL,
            api_key=DRAFT_API_KEY,
            max_completion_tokens=DRAFT_MAX_COMPLETION_TOKENS,
            max_retries=attempts - 1,
            timeout=DRAFT_ATTEMPT_TIMEOUT_SECONDS,
            extra=DRAFT_EXTRA,
        )

    shape = answer_shape(domain, rules)
    plain = answer_shape(None, rules)
    if shape == plain:
        result = ask(shape, DRAFT_ATTEMPTS)
    else:
        # an outline can make the model reason until its budget is gone and return no answer, and
        # trying the same prompt again does the same, so one try is followed by the plain format
        try:
            result = ask(shape, 1)
        except LLMCallFailed:
            result = ask(plain, DRAFT_ATTEMPTS - 1)

    if notes and result.get("answer"):
        # the writer sometimes lays out only a few of the agent's findings; try again and keep the fullest answer
        wanted = {int(n) for n in re.findall(r"\[P(\d+)\]", notes) if int(n) <= len(chosen)}
        for _ in range(LAYOUT_RETRIES):
            if _coverage(result, wanted) >= LAYOUT_MIN_COVERAGE:
                break
            try:
                again = ask(shape, 1)
            except LLMCallFailed:
                break
            if again.get("answer") and _coverage(again, wanted) > _coverage(result, wanted):
                result = again

    citations = []
    for number in result.get("used_passages", []):
        if isinstance(number, int) and 1 <= number <= len(chosen):
            passage = chosen[number - 1]
            citations.append({
                "passageNumber": number,
                "documentName": passage.get("documentName"),
                "documentId": passage.get("documentId"),
                "pageNumber": passage.get("pageNumber"),
                "sourcePages": passage.get("sourcePages") or [],
                "passageId": passage.get("passageId"),
            })
    return {"answer": result.get("answer", ""), "citations": citations, "note": result.get("note", "")}


if __name__ == "__main__":
    sample = [{
        "documentName": "sample POP", "documentId": "test", "pageNumber": 4,
        "passageId": "p1",
        "text": "Malathion 50 EC at 2 ml per litre of water controls aphids on mustard.",
    }]
    print(json.dumps(draft_answer("What dose of malathion for aphids on mustard?", sample), indent=2))
