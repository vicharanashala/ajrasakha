"""Tests for LLM trace formatting."""

from langchain_core.messages import HumanMessage, SystemMessage

from ajrasakha.agents.llm_trace import messages_to_trace, trace_llm_request, trace_llm_response


def test_messages_to_trace_roles(caplog):
    import logging

    msgs = [
        SystemMessage(content="You are a planner."),
        HumanMessage(content="Farmer asks about wheat."),
    ]
    traced = messages_to_trace(msgs)
    assert traced[0]["role"] == "system"
    assert traced[1]["role"] == "human"
    assert "wheat" in traced[1]["content"]


def test_trace_llm_request_and_response(caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="ajrasakha.agents.thread_trace"):
        trace_llm_request(
            "planner",
            model="claude-test",
            messages=[SystemMessage(content="sys"), HumanMessage(content="hi")],
        )
        trace_llm_response(
            "planner",
            output={"domains": ["weather"], "reasoning": "greeting"},
            reasoning="greeting",
        )

    assert "llm_planner_request" in caplog.text
    assert "llm_planner_response" in caplog.text
    assert "claude-test" in caplog.text
    assert "You are a planner" not in caplog.text  # we used "sys"
    assert "sys" in caplog.text
    assert "greeting" in caplog.text
    assert "weather" in caplog.text
