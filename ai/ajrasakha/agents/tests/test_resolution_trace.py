"""Tests for resolution trace formatting."""

from ajrasakha.agents.resolution_trace import trace_resolution


def test_trace_resolution_formats_value_and_source(caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="ajrasakha.agents.thread_trace"):
        trace_resolution(
            "tool_call_batch",
            state="Kerala",
            state_source="plan.entities.state",
            district="all",
            district_source="default_all_when_state_known",
        )

    assert "resolve_tool_call_batch" in caplog.text
    assert "Kerala" in caplog.text
    assert "plan.entities.state" in caplog.text
    assert "default_all_when_state_known" in caplog.text


def test_trace_resolution_lat_long_source(caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="ajrasakha.agents.thread_trace"):
        trace_resolution(
            "geocode",
            latitude=25.3,
            longitude=83.0,
            lat_long_source="nominatim_forward_geocode",
        )

    assert "resolve_geocode" in caplog.text
    assert "nominatim_forward_geocode" in caplog.text
    assert "25.3" in caplog.text
