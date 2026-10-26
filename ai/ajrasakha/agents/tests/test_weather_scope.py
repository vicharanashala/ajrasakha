"""Out-of-scope weather questions get a capability menu instead of the expert-queue reply."""

import json

import pytest

from ajrasakha.agents.new_weather_agent import (
    BEYOND_FORECAST_RANGE,
    LONG_TERM_HISTORY,
    UNSUPPORTED_PARAMETER,
    WEATHER_CAPABILITY_MENU,
    _normalize_weather_intent,
    detect_unsupported_weather_query,
    new_weather,
)


@pytest.mark.parametrize(
    "query, reason",
    [
        ("What is the UV index today?", UNSUPPORTED_PARAMETER),
        ("AQI in my area", UNSUPPORTED_PARAMETER),
        ("sunrise time tomorrow", UNSUPPORTED_PARAMETER),
        ("weather next month", BEYOND_FORECAST_RANGE),
        ("rain forecast for next 15 days", BEYOND_FORECAST_RANGE),
        ("weather after 2 weeks", BEYOND_FORECAST_RANGE),
        ("rainfall last year", LONG_TERM_HISTORY),
        ("temperature in last 2 months", LONG_TERM_HISTORY),
    ],
)
def test_out_of_scope_queries_are_detected(query, reason):
    assert detect_unsupported_weather_query(query) == reason


@pytest.mark.parametrize(
    "query",
    [
        "Will it rain tomorrow?",
        "5 day forecast",
        "next week weather",
        "weather for next 1 week",
        "next 7 days forecast",
        "past 24 hours rain",
        "rain in the next 2 hours",
        "how much rain in past 3 days",
        "wind speed yesterday",
        "hottest day this week",
    ],
)
def test_supported_queries_are_not_declined(query):
    assert detect_unsupported_weather_query(query) is None


def test_llm_flag_ignored_for_in_scope_query():
    raw = {"tool": "get_rainfall_and_monsoon_info", "unsupported_reason": BEYOND_FORECAST_RANGE}
    assert "unsupported_reason" not in _normalize_weather_intent(raw, "Will it rain tomorrow?")


def test_llm_flag_kept_for_query_without_weather_keywords():
    raw = {"tool": "get_current_and_forecast_info", "unsupported_reason": BEYOND_FORECAST_RANGE}
    intent = _normalize_weather_intent(raw, "Will it snow this winter?")
    assert intent["unsupported_reason"] == BEYOND_FORECAST_RANGE


@pytest.mark.asyncio
async def test_new_weather_returns_capability_menu_without_failure_flag():
    out = json.loads(await new_weather.ainvoke({"query": "What is the AQI today?", "district": "Karnal", "state": "Haryana"}))
    assert out["status"] == "unsupported"
    assert out["reason"] == UNSUPPORTED_PARAMETER
    assert WEATHER_CAPABILITY_MENU in out["answer"]
    # success=false would route to the "weather unavailable" reply.
    assert "success" not in out
