"""Planner completeness rules — fewer clarify loops."""

from langchain_core.messages import AIMessage, HumanMessage

from ajrasakha.agents.domains import domain_requires_crop
from ajrasakha.agents.planner_rules import (
    apply_planner_completeness_rules,
    conversation_text_from_messages,
    extract_crop_from_text,
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


def test_conversation_carries_crop():
    messages = [
        HumanMessage(content="Can i get insurance for my crop?"),
        AIMessage(content="Which crop?"),
        HumanMessage(content="Cotton"),
    ]
    conv = conversation_text_from_messages(messages)
    assert extract_crop_from_text(conv) == "cotton"


def test_cotton_turn_complete_with_gps():
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
    assert plan["is_complete"] is True
    assert plan["entities"]["crop"] == "Cotton"
    assert plan.get("follow_up_question") is None


def test_pm_kisan_complete_with_gps_no_crop_bleed():
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
    assert plan["is_complete"] is True
    assert plan["entities"]["crop"] == "all"
    assert plan.get("follow_up_question") is None


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
