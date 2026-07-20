"""Tests for final LangGraph answer-shortener integration."""

from __future__ import annotations

import asyncio

from langchain_core.messages import AIMessage, HumanMessage

from ajrasakha.agents import answer_shortener


def _state(answer: str) -> dict:
    return {
        "messages": [
            HumanMessage(content="How should I manage pea germination?"),
            AIMessage(content=answer),
        ]
    }


def test_shortener_returns_pair_without_replacing_messages(monkeypatch):
    full_answer = "Use certified seed.\n\n👤 Answered by: Expert"

    async def fake_request(settings, *, original_query, answer):
        assert settings.base_url == "http://shortener.test"
        assert settings.api_key == "client-secret"
        assert original_query == "How should I manage pea germination?"
        assert answer == full_answer
        return {
            "short_answer": "Use certified seed.\n\n👤 Answered by: Expert",
            "full_answer": full_answer,
            "status": "shortened",
        }

    monkeypatch.setenv("ANSWER_SHORTENER_BASE_URL", "http://shortener.test")
    monkeypatch.setenv("ANSWER_SHORTENER_CLIENT_API_KEY", "client-secret")
    monkeypatch.setattr(answer_shortener, "_request_shortening", fake_request)

    result = asyncio.run(answer_shortener.answer_shortener_node(_state(full_answer), {}))

    assert result == {
        "short_answer": "Use certified seed.\n\n👤 Answered by: Expert",
        "full_answer": full_answer,
        "answer_shortening_status": "shortened",
    }
    assert "messages" not in result


def test_shortener_missing_configuration_falls_back_to_full_answer(monkeypatch):
    full_answer = "Complete final advisory."
    monkeypatch.delenv("ANSWER_SHORTENER_BASE_URL", raising=False)

    result = asyncio.run(answer_shortener.answer_shortener_node(_state(full_answer), {}))

    assert result["short_answer"] == full_answer
    assert result["full_answer"] == full_answer
    assert result["answer_shortening_status"] == "fallback_shortener_not_configured"


def test_shortener_service_error_falls_back_to_full_answer(monkeypatch):
    full_answer = "Complete final advisory with a footer.\n\n👤 Answered by: Expert"

    async def fake_request(*args, **kwargs):
        raise answer_shortener.AnswerShortenerError("shortener returned HTTP 422")

    monkeypatch.setenv("ANSWER_SHORTENER_BASE_URL", "http://shortener.test")
    monkeypatch.setattr(answer_shortener, "_request_shortening", fake_request)

    result = asyncio.run(answer_shortener.answer_shortener_node(_state(full_answer), {}))

    assert result["short_answer"] == full_answer
    assert result["full_answer"] == full_answer
    assert result["answer_shortening_status"] == "fallback_shortener_unavailable"


def test_shortener_without_a_farmer_question_falls_back():
    answer = "A final answer."
    state = {"messages": [AIMessage(content=answer)]}

    result = asyncio.run(answer_shortener.answer_shortener_node(state, {}))

    assert result["short_answer"] == answer
    assert result["full_answer"] == answer
    assert result["answer_shortening_status"] == "fallback_no_original_query"
