"""Deterministic terminal reply when live weather data is unavailable."""

from __future__ import annotations

from langchain_core.messages import AIMessage

from ajrasakha.agents.answer_footers import build_weather_unavailable_content
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.thread_logging import end_conversation_turn
from ajrasakha.agents.thread_trace import trace_event
from ajrasakha.agents.translation_catalog import language_pair_from_plan


async def weather_unavailable_reply_node(state: AjraSakhaState) -> dict:
    """Return localized catalog text and testing notice without invoking an LLM."""
    script, vocal = language_pair_from_plan(state.get("plan"))
    content = build_weather_unavailable_content(script, vocal)

    trace_event(
        "weather_unavailable_reply",
        script_language=script,
        vocal_language=vocal,
    )
    end_conversation_turn(content, outcome="weather_unavailable")
    return {
        "messages": [AIMessage(content=content)],
        "location": state.get("location"),
    }
