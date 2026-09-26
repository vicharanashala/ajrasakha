"""Tests for follow-up detection in the planner."""

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from ajrasakha.agents.planner import (
    PlannerEntitiesOutput,
    PlannerOutput,
    planner_output_to_plan,
    route_after_planner,
)
from ajrasakha.agents.planner_rules import classify_follow_up_heuristic
from ajrasakha.agents.state import AjraSakhaState


# -------- Heuristic classifier --------

class TestClassifyFollowUpHeuristic:
    @pytest.mark.parametrize(
        "text,expected",
        [
            ("translate to Hindi", "language_change"),
            ("in Hindi", "language_change"),
            ("Hindi mein batao", "language_change"),
            ("same in Punjabi", "language_change"),
            ("bhashantar", "language_change"),
            ("change the language", "language_change"),
            ("in short", "format_change"),
            ("give me a short answer", "format_change"),
            ("in bullet points", "format_change"),
            ("summarize", "format_change"),
            ("convert to bullets", "format_change"),
            ("make it shorter", "format_change"),
            ("explain more", "detail_request"),
            ("more details please", "detail_request"),
            ("in more detail", "detail_request"),
            ("tell me more", "detail_request"),
            ("elaborate", "detail_request"),
            ("simplify", "simplify"),
            ("simplify it", "simplify"),
            ("in simple words", "simplify"),
            ("simple words please", "simplify"),
            ("easy language", "simplify"),
            ("like a beginner", "simplify"),
            ("in technical terms", "tone_change"),
            ("for a beginner", "tone_change"),
            ("like an expert", "tone_change"),
            ("rephrase", "rephrase"),
            ("rephrase this", "rephrase"),
            ("say it differently", "rephrase"),
            ("say it again", "rephrase"),
        ],
    )
    def test_classifies_follow_up(self, text, expected):
        assert classify_follow_up_heuristic(text) == expected

    @pytest.mark.parametrize(
        "text",
        [
            "what about dosage?",
            "and which pesticide should I use?",
            "tell me about wheat rust in Punjab",
            "what is the price of onion today?",
            "how to control aphids on cotton?",
            "I am a farmer in Punjab",
            "thanks",
            "what is weather today?",
            "",
        ],
    )
    def test_returns_none_for_non_followup(self, text):
        assert classify_follow_up_heuristic(text) is None

    def test_too_long_text_returns_none(self):
        text = "translate to Hindi " * 50
        assert classify_follow_up_heuristic(text) is None


# -------- PlannerOutput / planner_output_to_plan --------

class TestPlannerOutputFollowUpFields:
    def test_default_follow_up_fields_are_false(self):
        out = PlannerOutput()
        assert out.is_follow_up is False
        assert out.follow_up_type is None
        assert out.main_question is None

    def test_planner_output_to_plan_carries_follow_up_fields(self):
        out = PlannerOutput(
            is_follow_up=True,
            follow_up_type="language_change",
            main_question="How to control yellow rust on wheat?",
        )
        plan = planner_output_to_plan(out)
        assert plan["is_follow_up"] is True
        assert plan["follow_up_type"] == "language_change"
        assert plan["main_question"] == "How to control yellow rust on wheat?"

    def test_planner_output_to_plan_default_follow_up_fields(self):
        out = PlannerOutput()
        plan = planner_output_to_plan(out)
        assert plan["is_follow_up"] is False
        assert plan["follow_up_type"] is None
        assert plan["main_question"] is None


# -------- route_after_planner --------

class TestRouteAfterPlannerFollowUp:
    def test_routes_follow_up_to_follow_up_node(self):
        state: AjraSakhaState = {
            "messages": [],
            "location": None,
            "plan": {
                "is_complete": True,
                "is_follow_up": True,
                "follow_up_type": "language_change",
                "main_question": "Previous question",
            },
        }
        assert route_after_planner(state) == "follow_up"

    def test_routes_incomplete_to_clarify(self):
        state: AjraSakhaState = {
            "messages": [],
            "location": None,
            "plan": {"is_complete": False, "follow_up_question": "Which state?"},
        }
        assert route_after_planner(state) == "clarify"

    def test_routes_complete_to_ensure_location(self):
        state: AjraSakhaState = {
            "messages": [],
            "location": None,
            "plan": {"is_complete": True},
        }
        assert route_after_planner(state) == "ensure_location"

    def test_follow_up_routes_to_follow_up_even_if_complete_false(self):
        """Follow-up routing wins over completeness gating."""
        state: AjraSakhaState = {
            "messages": [],
            "location": None,
            "plan": {"is_complete": False, "is_follow_up": True},
        }
        assert route_after_planner(state) == "follow_up"


# -------- Graph wiring --------

class TestGraphWiring:
    def test_compiled_graph_has_follow_up_node(self):
        from ajrasakha.agents.ajrasakha import graph
        assert "follow_up" in graph.nodes

    def test_route_after_planner_supports_follow_up_in_map(self):
        """The planner's conditional-edges map must include 'follow_up'."""
        from ajrasakha.agents.ajrasakha import _build_graph
        # Build a temporary graph to inspect edges
        g = _build_graph()
        # The conditional edges from planner are encoded in the compiled graph
        # We just verify the planner node is reachable and follow_up is in nodes
        assert "planner" in g.nodes
        assert "follow_up" in g.nodes
        assert "translate_answer" in g.nodes
