"""Draft a GDB answer from library passages, using only those passages.

Passages come from anara_client.search_library. The model is the MiniMax client
the checks already use (checker/llm_client.py), so the same retry and key
settings apply.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# checker modules import each other by plain name, so their folder must be on the path
sys.path.insert(0, str(Path(__file__).resolve().parent / "checker"))

load_dotenv(Path(__file__).resolve().parent / ".env")

from llm_client import call_llm  # noqa: E402

# the model's reasoning time grows with the passages it is given (about 30 s for 8, about 70 s for 12)
MAX_PASSAGES = 8
# a reviewer is waiting on the button, so a draft gives up after at most 3.5 minutes
# (3 attempts of up to 70 seconds) instead of retrying for as long as the checks do
DRAFT_ATTEMPTS = 3
DRAFT_ATTEMPT_TIMEOUT_SECONDS = 70
# the model reasons before it answers, and the reasoning counts against this budget: at 2048 it
# often used all of it and returned no answer text (finish_reason "length")
DRAFT_MAX_COMPLETION_TOKENS = 6000
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

Return only JSON in this form:
{{"answer": "...", "used_passages": [3, 5], "note": ""}}

Question: {question}

Passages:
{passages}
"""


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


def draft_answer(question: str, passages: list[dict[str, Any]], crop: str | None = None) -> dict[str, Any]:
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
    prompt = PROMPT_TEMPLATE.format(question=question, passages=_format_passages(chosen), crop_rule=crop_rule)
    result = call_llm(
        prompt,
        validate=lambda r: isinstance(r, dict) and "answer" in r,
        model=DRAFT_MODEL,
        url=DRAFT_URL,
        api_key=DRAFT_API_KEY,
        max_completion_tokens=DRAFT_MAX_COMPLETION_TOKENS,
        max_retries=DRAFT_ATTEMPTS - 1,
        timeout=DRAFT_ATTEMPT_TIMEOUT_SECONDS,
    )

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
