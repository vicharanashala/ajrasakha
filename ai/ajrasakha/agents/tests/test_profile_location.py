"""The farmer profile is the only location: places named in the query are never used."""

import pytest
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.daily_price_agent import _build_tool_args
from ajrasakha.agents.plan_executor import (
    build_specialist_tool_calls_from_plan,
    ensure_location_node,
)
from ajrasakha.agents.planner_rules import (
    apply_planner_completeness_rules,
    ask_to_change_profile_location,
    merge_entities_from_rephrased_query,
)

_PROFILE = {"state": "Andhra Pradesh", "district": "Visakhapatnam", "block": "seethammadhara", "village": "chinnawaltair"}
_PREFIX = (
    "The below answer is provided for the location: Andhra Pradesh, Visakhapatnam, "
    "chinnawaltair, seethammadhara. If this is not your preferred location, "
    "please change it and ask again."
)


def _plan(state=None, district=None, places=(), **overrides):
    plan = {
        "domain": "Plant Protection",
        "domains": ["Plant Protection"],
        "knowledge_base": True,
        "is_agriculture_related": True,
        "is_complete": True,
        "missing_info": [],
        "follow_up_question": None,
        "crop_required": False,
        "rephrased_query": "How do I control yellow rust in wheat?",
        "entities": {"crop": "Wheat", "state": state, "district": district},
        "places": list(places),
        "script_language": "English",
        "vocal_language": "English",
    }
    plan.update(overrides)
    return plan


def _messages(text="How do I control yellow rust in wheat?"):
    return [HumanMessage(content=text)]


# --- planner entity merge ----------------------------------------------------


def test_profile_location_is_used_when_the_query_names_no_place():
    entities = merge_entities_from_rephrased_query(_plan(), _messages(), None, None, stored_location=_PROFILE)
    assert (entities["state"], entities["district"]) == ("Andhra Pradesh", "Visakhapatnam")


def test_a_place_named_in_the_query_never_replaces_the_profile():
    for state, district in (("Punjab", "Ludhiana"), (None, "Xyzabad"), ("Kerala", None)):
        plan = _plan(state=state, district=district, places=[district or state])
        text = f"How do I control yellow rust in wheat in {district or state}?"
        entities = merge_entities_from_rephrased_query(plan, _messages(text), None, None, stored_location=_PROFILE)
        assert (entities["state"], entities["district"]) == ("Andhra Pradesh", "Visakhapatnam"), (state, district)


def test_the_previous_turn_location_is_never_carried_over():
    prev = {"crop": "Wheat", "state": "Punjab", "district": "Ludhiana"}
    entities = merge_entities_from_rephrased_query(_plan(), _messages(), None, prev, stored_location=_PROFILE)
    assert (entities["state"], entities["district"]) == ("Andhra Pradesh", "Visakhapatnam")
    entities = merge_entities_from_rephrased_query(_plan(), _messages(), None, prev, stored_location=None)
    assert "state" not in entities and "district" not in entities


def test_a_profile_without_a_district_answers_for_the_whole_state():
    entities = merge_entities_from_rephrased_query(
        _plan(), _messages(), None, None, stored_location={"state": "Punjab", "district": None}
    )
    assert (entities["state"], entities["district"]) == ("Punjab", "all")


def test_a_place_in_the_query_keeps_the_turn_complete():
    plan = _plan(state="Punjab", district="Xyzabad", places=["Xyzabad"])
    out = apply_planner_completeness_rules(plan, _messages(), None, None, stored_location=_PROFILE)
    assert out["is_complete"] is True
    assert out["entities"]["state"] == "Andhra Pradesh"


# --- prefix / set-location message ------------------------------------------


def test_any_place_named_gets_the_profile_location_prefix():
    for places in (["Visakhapatnam"], ["Ludhiana"], ["Visakhapatnam", "Kharar"], ["Xyzabad"]):
        out = ask_to_change_profile_location(_plan(places=places), _PROFILE)
        assert out["is_complete"] is True, places
        assert out["follow_up_question"] is None, places
        assert out["profile_location_prefix"] == _PREFIX, places


def test_naming_no_place_has_no_prefix():
    for places in ([], ["all"], ["Not specified"]):
        out = ask_to_change_profile_location(_plan(places=places), _PROFILE)
        assert out["is_complete"] is True and out["profile_location_prefix"] is None, places


def test_the_prefix_skips_empty_profile_fields():
    out = ask_to_change_profile_location(_plan(places=["Ludhiana"]), {"state": "Punjab", "district": "all"})
    assert out["profile_location_prefix"].startswith("The below answer is provided for the location: Punjab. ")


def test_a_farmer_without_a_profile_location_is_asked_to_set_it():
    for places in ([], ["Kharar"]):
        out = ask_to_change_profile_location(_plan(places=places), None)
        assert out["is_complete"] is False and out["missing_info"] == []
        assert out["follow_up_question"] == "Please set your location."


def test_greetings_need_no_location():
    out = ask_to_change_profile_location(_plan(is_greeting=True), None)
    assert out["is_complete"] is True and out["profile_location_prefix"] is None


# --- tool location -----------------------------------------------------------


def _tool_plan(**overrides):
    plan = _plan(
        state="Andhra Pradesh",
        district="Visakhapatnam",
        weather=True,
        mandi=True,
        knowledge_base=False,
        rephrased_query="What is the tomato price in Ludhiana mandi and will it rain there?",
        location_from_profile=True,
    )
    plan["entities"]["crop"] = "Tomato"
    plan.update(overrides)
    return plan


def _args(calls, name):
    return next(c["args"] for c in calls if c["name"] == name)


@pytest.mark.asyncio
async def test_weather_and_mandi_get_only_the_profile_location():
    plan = _tool_plan(profile_coordinates={"latitude": 17.7, "longitude": 83.3, "village": "chinnawaltair", "block": "seethammadhara"})
    calls, _ = await build_specialist_tool_calls_from_plan(plan, plan["rephrased_query"], {})
    weather, mandi = _args(calls, "new_weather"), _args(calls, "daily_price")
    for args in (weather, mandi):
        assert (args["state"], args["district"]) == ("Andhra Pradesh", "Visakhapatnam")
        assert (args["latitude"], args["longitude"]) == (17.7, 83.3)
        assert (args["village"], args["block"]) == ("chinnawaltair", "seethammadhara")
        assert args["location_from_profile"] is True
        assert not any(k.startswith("sub_place") or k == "location" for k in args)


@pytest.mark.asyncio
async def test_no_state_is_read_from_the_query_text():
    plan = _tool_plan(profile_coordinates=None)
    plan["entities"].update(state=None, district=None)
    calls, _ = await build_specialist_tool_calls_from_plan(plan, "Will it rain in Punjab tomorrow?", {})
    assert _args(calls, "new_weather")["state"] is None


@pytest.mark.asyncio
async def test_ensure_location_never_rewrites_the_plan_location():
    state = {"messages": _messages(), "plan": _tool_plan()}
    assert await ensure_location_node(state, RunnableConfig()) == {}


def test_mandi_ignores_a_market_or_state_named_in_the_query():
    intent = {
        "action": "get_price_with_nearby",
        "actions": ["get_price_with_nearby"],
        "commodity_name": "Tomato",
        "market_name": "Ludhiana",
        "search_by_apmc": True,
        "state": "Punjab",
    }
    args = _build_tool_args(intent, lat=17.7, lon=83.3, crop="Tomato", state="Andhra Pradesh")
    assert args["state"] == "Andhra Pradesh"
    assert "market_name" not in args and args["search_by_apmc"] is False
    assert args["action"] == "get_today_price"
    assert (args["lat"], args["long"]) == (17.7, 83.3)
