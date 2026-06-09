"""Planner completeness rules — fewer clarify loops."""

from langchain_core.messages import AIMessage, HumanMessage

from ajrasakha.agents.domains import domain_requires_crop
from ajrasakha.agents.planner_rules import (
    apply_planner_completeness_rules,
    canonicalize_chemical_names,
    conversation_text_from_messages,
    extract_crop_from_text,
    format_conversation_for_planner,
    format_prev_plan_context,
    infer_domain_for_plan,
    is_schemes_intent,
)


def test_schemes_intent_detected():
    assert is_schemes_intent("Can i get insurance for my crop?")
    assert is_schemes_intent("Pm kisan eligibility")


def test_pm_kisan_domain_does_not_require_crop():
    domain = infer_domain_for_plan(
        {"schemes": True},
        "Can I apply for PM-KISAN?",
    )
    assert domain == "Financial & Institutional Services"
    assert domain_requires_crop(domain) is False


def test_crop_insurance_requires_crop():
    domain = infer_domain_for_plan(
        {"schemes": True},
        "Can i get insurance for my crop?",
    )
    assert domain == "Crop Insurance"
    assert domain_requires_crop(domain) is True


def test_format_prev_plan_context_includes_rephrased_and_chemicals():
    prev = {
        "is_complete": False,
        "rephrased_query": "How to use Dazomet (mylone)?",
        "entities": {"chemicals": ["Dazomet"]},
        "domain": "Plant Protection",
        "missing_info": ["location"],
    }
    text = format_prev_plan_context(prev)
    assert "previous_rephrased_query: How to use Dazomet (mylone)?" in text
    assert "resolved_chemicals (canonical): Dazomet" in text
    assert "still_missing: location" in text


def test_format_prev_plan_context_empty_when_prior_turn_complete():
    assert format_prev_plan_context({"is_complete": True, "rephrased_query": "x"}) == ""


def test_canonicalize_chemical_names_typo_to_dazomet():
    from ajrasakha.agents import crop_chemical_resolver as resolver

    resolver.build_cache_from_docs([
        {
            "_id": "chem2",
            "name": "Dazomet",
            "type": "chemical",
            "aliases": [{"english_representation": "mylone", "native_representation": ""}],
        },
    ])
    assert canonicalize_chemical_names(["mylonee"]) == ["Dazomet"]


def test_format_conversation_for_planner_keeps_farmer_messages_not_bot():
    long_bot = "Bot answer " * 500
    messages = [
        HumanMessage(content="ਪੰਜਾਬ ਵਿੱਚ ਝੋਨੇ ਨੂੰ ਲੀਫ ਬਲਾਈਟ"),
        AIMessage(content=long_bot),
        HumanMessage(content="how to use mylonee"),
        AIMessage(content="expert queue reply"),
        HumanMessage(content="how to use myloni"),
    ]
    conv = format_conversation_for_planner(messages)
    assert "ਪੰਜਾਬ" in conv
    assert "how to use mylonee" in conv
    assert "how to use myloni" in conv
    assert "Bot answer" not in conv
    assert "expert queue" not in conv


def test_conversation_carries_crop():
    messages = [
        HumanMessage(content="Can i get insurance for my crop?"),
        AIMessage(content="Which crop?"),
        HumanMessage(content="Cotton"),
    ]
    conv = conversation_text_from_messages(messages)
    assert extract_crop_from_text(conv) == "cotton"


def test_cotton_clarify_without_farmer_state_asks_location_not_gps():
    messages = [
        HumanMessage(content="Can i get insurance for my crop?"),
        AIMessage(content="Which crop are you growing?"),
        HumanMessage(content="Cotton"),
    ]
    plan = apply_planner_completeness_rules(
        {
            "domain": "Crop Insurance",
            "schemes": True,
            "knowledge_base": False,
            "is_complete": True,
            "entities": {"crop": "Cotton"},
        },
        messages,
        {"latitude": 30.9, "longitude": 76.5, "state": "Punjab", "city": "Ludhiana"},
    )
    assert plan["is_complete"] is False
    assert plan["entities"]["crop"] == "Cotton"
    assert plan["entities"].get("state") is None
    assert "location" in (plan.get("missing_info") or [])


def test_pm_kisan_without_farmer_state_asks_location_not_gps():
    messages = [
        HumanMessage(content="Can i get insurance for my crop?"),
        HumanMessage(content="Cotton"),
        HumanMessage(content="Pm kisan"),
    ]
    plan = apply_planner_completeness_rules(
        {
            "domain": "Financial & Institutional Services",
            "schemes": True,
            "is_complete": True,
            "entities": {"crop": "all"},
        },
        messages,
        {"latitude": 30.9, "longitude": 76.5, "state": "Punjab", "city": "Ludhiana"},
    )
    assert plan["is_complete"] is False
    assert plan["entities"]["crop"] == "all"
    assert plan["entities"].get("state") is None
    assert "location" in (plan.get("missing_info") or [])


def test_state_only_sets_district_all_without_follow_up():
    messages = [HumanMessage(content="PM-KISAN in Kerala")]
    plan = apply_planner_completeness_rules(
        {
            "domain": "Financial & Institutional Services",
            "schemes": True,
            "is_complete": True,
            "entities": {"crop": "all"},
        },
        messages,
        None,
    )
    assert plan["is_complete"] is True
    assert plan.get("follow_up_question") is None
    assert plan["entities"]["state"] == "Kerala"
    assert plan["entities"]["district"] == "all"


def test_crop_still_asks_first_time():
    messages = [
        HumanMessage(
            content=(
                "Stubble burning is easiest way to clean my land. "
                "What is the problem with it?"
            )
        ),
    ]
    plan = apply_planner_completeness_rules(
        {
            "domain": "Plant Protection",
            "domains": ["Plant Protection"],
            "is_complete": False,
            "entities": {"state": "Punjab"},
        },
        messages,
        {"latitude": 30.9, "longitude": 76.5, "state": "Punjab", "city": "Ludhiana"},
    )
    assert plan["is_complete"] is False
    assert "crop" in (plan.get("missing_info") or [])
    assert plan.get("follow_up_question")


def test_crop_fallback_after_clarify_does_not_matter():
    messages = [
        HumanMessage(
            content=(
                "Stubble burning is easiest way to clean my land. "
                "What is the problem with it?"
            )
        ),
        AIMessage(content="Which crop are you growing?"),
        HumanMessage(content="It does not matter."),
    ]
    plan = apply_planner_completeness_rules(
        {
            "domain": "Plant Protection",
            "domains": ["Plant Protection"],
            "is_complete": False,
            "missing_info": ["crop"],
            "entities": {"state": "Punjab"},
        },
        messages,
        {"latitude": 30.9, "longitude": 76.5, "state": "Punjab", "city": "Ludhiana"},
    )
    assert plan["is_complete"] is True
    assert plan["entities"]["crop"] == "all"
    assert plan.get("follow_up_question") is None
    assert "crop" not in (plan.get("missing_info") or [])


def test_crop_clarify_reply_still_extracts_cotton():
    messages = [
        HumanMessage(content="Can i get insurance for my crop?"),
        AIMessage(content="Which crop are you growing?"),
        HumanMessage(content="Cotton"),
    ]
    plan = apply_planner_completeness_rules(
        {
            "domain": "Crop Insurance",
            "domains": ["Crop Insurance"],
            "is_complete": False,
            "missing_info": ["crop"],
            "entities": {"state": "Punjab"},
        },
        messages,
        {"latitude": 30.9, "longitude": 76.5, "state": "Punjab", "city": "Ludhiana"},
    )
    assert plan["is_complete"] is True
    assert plan["entities"]["crop"] == "Cotton"
    assert plan.get("follow_up_question") is None
