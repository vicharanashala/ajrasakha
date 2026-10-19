"""Normalize raw answer documents into one shared checker context."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, TypedDict


DATA_DIRECTORY = Path(__file__).resolve().parent.parent / "data"
TITLE_NAME_PATTERN = re.compile(
    r"\b(?:Dr|Mr|Mrs|Ms|Sh|Shri)\.\s+"
    r"[A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2}\b"
)
SECTION_PATTERN = re.compile(
    r"(?im)^\s*(introduction|problem|solution|precautions?)\s*:?[ \t]*$"
)


class AnswerContext(TypedDict):
    answer_id: str
    question_id: str
    answer_text: str
    question_text: str
    crop: str
    state: str
    sources: list[dict[str, Any]]
    chemicals_mentioned: list[str]
    names_mentioned: list[str]
    sections: list[str]


def _chemical_names() -> list[str]:
    names: list[str] = []
    for filename in (
        "quality_banned_chemicals.json",
        "quality_restricted_chemicals.json",
    ):
        with (DATA_DIRECTORY / filename).open(encoding="utf-8") as source:
            for chemical in json.load(source):
                if chemical["name"] not in names:
                    names.append(chemical["name"])
    return names


CHEMICAL_NAMES = _chemical_names()


def normalize_answer(raw_answer: dict[str, Any]) -> AnswerContext:
    """Extract checker inputs and reusable mentions once from a raw document."""
    answer_text = str(raw_answer.get("answer_text") or "")
    sources = raw_answer.get("sources")
    source_list = sources if isinstance(sources, list) else []
    chemicals = [
        name
        for name in CHEMICAL_NAMES
        if re.search(rf"(?<![\w]){re.escape(name)}(?![\w])", answer_text, re.I)
    ]
    return {
        "answer_id": str(raw_answer.get("answer_id") or ""),
        "question_id": str(raw_answer.get("question_id") or ""),
        "answer_text": answer_text,
        "question_text": str(raw_answer.get("question_text") or ""),
        "crop": str(raw_answer.get("crop") or "Unknown"),
        "state": str(raw_answer.get("state") or "Unknown"),
        "sources": source_list,
        "chemicals_mentioned": chemicals,
        "names_mentioned": TITLE_NAME_PATTERN.findall(answer_text),
        "sections": [match.group(1) for match in SECTION_PATTERN.finditer(answer_text)],
    }
