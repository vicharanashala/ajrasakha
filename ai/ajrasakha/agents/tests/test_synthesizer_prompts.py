"""Contract tests: GDB synthesizer prompts forbid LLM footers (code appends them)."""

from __future__ import annotations

from ajrasakha.agents.synthesizer import (
    EXACT_MATCH_REPHRASE_PROMPT,
    SIMILAR_MATCH_SYNTHESIS_PROMPT,
    _SYNTHESIS_BODY_ONLY_REMINDER,
)

_FORBIDDEN_MARKERS = [
    "OUTPUT CONTRACT",
    "FORBIDDEN",
    "The answer I provided is sourced only from the following approved materials",
    "testing version",
    "Answers synthesized from",
    "SKUAST",
    "📚 Source",
    "👨‍🌾 Agri Expert",
    "DO NOT include source attribution",
    "appended automatically",
]

_BODY_ONLY_MARKERS = [
    "ONLY the answer body",
    "Zero lines after",
    "system appends AFTER",
]


def _assert_prompt_contract(prompt: str, *, label: str) -> None:
    for marker in _FORBIDDEN_MARKERS + _BODY_ONLY_MARKERS:
        assert marker in prompt, f"{label} missing: {marker!r}"


def test_exact_match_prompt_forbids_llm_footers() -> None:
    _assert_prompt_contract(EXACT_MATCH_REPHRASE_PROMPT, label="EXACT_MATCH_REPHRASE_PROMPT")


def test_similar_match_prompt_forbids_llm_footers() -> None:
    _assert_prompt_contract(
        SIMILAR_MATCH_SYNTHESIS_PROMPT, label="SIMILAR_MATCH_SYNTHESIS_PROMPT"
    )


def test_body_only_reminder_for_human_message() -> None:
    assert "body only" in _SYNTHESIS_BODY_ONLY_REMINDER.lower()
    assert "system appends" in _SYNTHESIS_BODY_ONLY_REMINDER.lower()
    assert "sources" in _SYNTHESIS_BODY_ONLY_REMINDER.lower()
    assert "disclaimers" in _SYNTHESIS_BODY_ONLY_REMINDER.lower()
    assert "footers" in _SYNTHESIS_BODY_ONLY_REMINDER.lower()
