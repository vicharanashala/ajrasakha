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
# with thinking on, about half the drafts spent the whole budget deliberating and returned no answer
# (65 s, nothing written); with it off a draft takes about 7 s. DRAFT_THINKING=on turns it back on.
DRAFT_EXTRA = {} if os.getenv("DRAFT_THINKING", "off").strip().lower() == "on" else {"thinking": {"type": "disabled"}}
# drafting has its own model, so the checks keep MINIMAX_MODEL and MINIMAX_URL from .env
DRAFT_MODEL = os.getenv("DRAFT_MINIMAX_MODEL", "MiniMax-M3")
DRAFT_URL = os.getenv(
    "DRAFT_MINIMAX_URL", "https://samagama.in/platform/proxy/v1/chat/completions"
)
# empty means the drafter uses MINIMAX_API_KEY, the same key as the checks
DRAFT_API_KEY = os.getenv("DRAFT_MINIMAX_API_KEY", "").strip() or None

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


def answer_shape(domain: str | None) -> str:
    entry = structure_for(domain)
    if entry is None:
        return GENERIC_SHAPE
    return SHAPE_TEMPLATE.format(
        domain=entry["domain"], broad=_outline(entry["broad"]), narrow=_outline(entry["narrow"])
    )


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
    question: str, passages: list[dict[str, Any]], crop: str | None = None, domain: str | None = None
) -> dict[str, Any]:
    """Return the draft plus the passages it cites, with document and page for each.

    Passage numbers in the answer map back to the passage list, so every citation
    points to a document and PDF page the reviewer can open.
    """
    chosen = passages[:MAX_PASSAGES]
    if not chosen:
        note = f"The library has no documents for {crop}" if crop else "No library passages found"
        return {"answer": "", "citations": [], "note": note}

    crop_rule = (
        f"The question is about the crop: {crop}. A passage about a different crop does not answer it.\n"
        if crop else ""
    )
    def ask(shape: str, attempts: int) -> dict[str, Any]:
        prompt = PROMPT_TEMPLATE.format(
            question=question, passages=_format_passages(chosen), crop_rule=crop_rule, shape=shape
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

    shape = answer_shape(domain)
    if shape == GENERIC_SHAPE:
        result = ask(shape, DRAFT_ATTEMPTS)
    else:
        # an outline can make the model reason until its budget is gone and return no answer, and
        # trying the same prompt again does the same, so one try is followed by the plain format
        try:
            result = ask(shape, 1)
        except LLMCallFailed:
            result = ask(GENERIC_SHAPE, DRAFT_ATTEMPTS - 1)

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
