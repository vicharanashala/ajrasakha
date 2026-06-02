"""Tests for synthesizer tool-result scoping (location must not count as specialist)."""

from __future__ import annotations

from langchain_core.messages import HumanMessage, ToolMessage

from ajrasakha.agents.synthesizer import _format_non_gdb_tool_results


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
            content="Rain expected",
            tool_call_id="w-1",
            name="weather",
        ),
    ]
    block = _format_non_gdb_tool_results(messages)
    assert "### weather" in block
    assert "Rain expected" in block
