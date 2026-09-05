"""Tests that ACC keeps tool calls and final answers isolated per question."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from ajrasakha.agents.acc_agent import nodes


WHITEFLY_QUERY = {
    "query": "How should I manage whitefly in cotton?",
    "crop": "Cotton",
    "standardized_domains": ["Insect - Pest Management"],
}
WEATHER_QUERY = {
    "query": "Will it rain today?",
    "crop": None,
    "standardized_domains": ["Climate, Weather & Stress Management"],
}


class _FakeAssemblerModel:
    def __init__(self):
        self.contexts: list[str] = []

    async def ainvoke(self, messages):
        context = str(messages[-1].content)
        self.contexts.append(context)
        if "whitefly" in context.lower():
            return SimpleNamespace(content="Use the relevant whitefly management steps.")
        if "rain" in context.lower():
            return SimpleNamespace(content="Rain is forecast for today.")
        raise AssertionError(f"Unexpected assembler context: {context}")


class AccAgentMultiAnswerTests(unittest.IsolatedAsyncioTestCase):
    async def test_tool_execution_scopes_each_tool_to_its_question(self):
        gdb_invoke = AsyncMock(return_value="whitefly tool result")
        weather_invoke = AsyncMock(return_value="weather tool result")
        state = {
            "selected_tools": ["gdb", "weather"],
            "extracted_state": "Maharashtra",
            "extracted_district": "Yavatmal",
            "extracted_queries": [WHITEFLY_QUERY, WEATHER_QUERY],
        }

        with (
            patch.object(nodes, "gdb", SimpleNamespace(ainvoke=gdb_invoke)),
            patch.object(nodes, "weather", SimpleNamespace(ainvoke=weather_invoke)),
        ):
            result = await nodes.tool_execution_node(state)

        self.assertEqual(gdb_invoke.await_count, 1)
        self.assertEqual(weather_invoke.await_count, 1)
        self.assertEqual(
            gdb_invoke.await_args.args[0]["rephrased_query"],
            WHITEFLY_QUERY["query"],
        )
        self.assertEqual(
            weather_invoke.await_args.args[0]["query"],
            WEATHER_QUERY["query"],
        )
        self.assertEqual(
            result["query_tool_responses"][0]["tool_responses"],
            {"gdb": "whitefly tool result"},
        )
        self.assertEqual(
            result["query_tool_responses"][1]["tool_responses"],
            {"weather": "weather tool result"},
        )

    async def test_assembler_returns_one_isolated_answer_per_question(self):
        model = _FakeAssemblerModel()
        state = {
            "query_tool_responses": [
                {
                    "query_index": 0,
                    "query": WHITEFLY_QUERY,
                    "tool_responses": {"gdb": "whitefly tool result"},
                },
                {
                    "query_index": 1,
                    "query": WEATHER_QUERY,
                    "tool_responses": {"weather": "weather tool result"},
                },
            ]
        }

        with patch.object(nodes, "get_minimax_chat_model", return_value=model):
            result = await nodes.assembler_node(state)

        self.assertEqual(
            result["final_answers"],
            [
                {
                    **WHITEFLY_QUERY,
                    "answer": "Use the relevant whitefly management steps.",
                },
                {
                    **WEATHER_QUERY,
                    "answer": "Rain is forecast for today.",
                },
            ],
        )
        self.assertIsNone(json.loads(result["final_answer"])["final_answer"])
        whitefly_context = next(context for context in model.contexts if "whitefly" in context.lower())
        weather_context = next(context for context in model.contexts if "rain" in context.lower())
        self.assertNotIn("weather tool result", whitefly_context)
        self.assertNotIn("whitefly tool result", weather_context)

    async def test_single_question_keeps_the_legacy_final_answer(self):
        model = _FakeAssemblerModel()
        state = {
            "query_tool_responses": [
                {
                    "query_index": 0,
                    "query": WHITEFLY_QUERY,
                    "tool_responses": {"gdb": "whitefly tool result"},
                }
            ]
        }

        with patch.object(nodes, "get_minimax_chat_model", return_value=model):
            result = await nodes.assembler_node(state)

        legacy_output = json.loads(result["final_answer"])
        self.assertEqual(
            legacy_output["final_answer"],
            "Use the relevant whitefly management steps.",
        )
        self.assertEqual(legacy_output["gdb"], "whitefly tool result")
        self.assertEqual(legacy_output["answers"], result["final_answers"])


if __name__ == "__main__":
    unittest.main()
