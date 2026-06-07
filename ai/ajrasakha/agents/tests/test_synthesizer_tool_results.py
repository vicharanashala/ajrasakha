"""Tests for synthesizer tool-result scoping (location must not count as specialist)."""

from __future__ import annotations

from langchain_core.messages import HumanMessage, ToolMessage

from ajrasakha.agents.answer_body import format_non_gdb_tool_results as _format_non_gdb_tool_results


def test_format_non_gdb_skips_location_information_tool_in_current_turn():
    messages = [
        HumanMessage(content="Jivamrut for onion in Maharashtra?"),
        ToolMessage(
            content='{"state": "Uttar Pradesh", "display_name": "Maharajganj"}',
            tool_call_id="loc-1",
            name="location_information_tool",
        ),
        ToolMessage(
            content='{"is_similar": true, "similar_pair1": {"answer": "x"}}',
            tool_call_id="gdb-1",
            name="gdb",
        ),
    ]
    assert _format_non_gdb_tool_results(messages) == ""


def test_format_non_gdb_includes_weather_in_current_turn():
    messages = [
        HumanMessage(content="Weather tomorrow?"),
        ToolMessage(
            content='{"success": true, "data_type": "forecast", "result": {"success": true, "today": {"station": "Delhi", "date": "2026-01-01", "forecast": "Clear", "forecast_min_temp": "10", "forecast_max_temp": "20", "distance_to_station_km": 5}, "forecast": []}}',
            tool_call_id="w-1",
            name="weather",
        ),
    ]
    block = _format_non_gdb_tool_results(messages)
    assert "Delhi" in block
    assert "Clear" in block
    assert "{" not in block
