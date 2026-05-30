"""Planner prompt must forbid substituting farmer agricultural terms during rephrase."""

from ajrasakha.agents.prompts import PLANNER_SYSTEM_PROMPT


def test_planner_prompt_forbids_disease_term_substitution():
    prompt = PLANNER_SYSTEM_PROMPT.lower()
    assert "bauna" in prompt
    assert "blast" in prompt
    assert "do not add" in prompt or "do not add, remove" in prompt
    assert "substitut" in prompt
    assert "original_query_en" in prompt
