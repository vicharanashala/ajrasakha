"""Tests for user location resolution and persistence helpers."""

from __future__ import annotations

from unittest.mock import patch

from langchain_core.messages import HumanMessage

from ajrasakha.agents.config import resolve_user_id
from ajrasakha.agents.planner_rules import merge_entities_from_rephrased_query
from ajrasakha.agents.user_location import (
    is_explicit_location_source,
    load_user_location,
    maybe_persist_resolved_location,
    sanitize_stored_location,
    validate_location,
)


def test_resolve_user_id_from_configurable():
    config = {"configurable": {"user_id": "507f1f77bcf86cd799439011"}}
    assert resolve_user_id(config) == "507f1f77bcf86cd799439011"


def test_resolve_user_id_from_metadata():
    config = {"metadata": {"user_id": "919876543210", "channel": "whatsapp"}}
    assert resolve_user_id(config) == "919876543210"


def test_resolve_user_id_from_whatsapp_thread_id():
    config = {"configurable": {"thread_id": "919876543210-2026-06-12"}}
    assert resolve_user_id(config) == "919876543210"


def test_validate_location_rejects_placeholders():
    assert validate_location("Haryana", "all") is False
    assert validate_location("Haryana", "all", allow_district_all=True) is True
    assert validate_location("unknown", "Sirsa") is False
    assert validate_location("Haryana", "Sirsa") is True


def test_sanitize_stored_location_normalizes_names():
    assert sanitize_stored_location({"state": "haryana", "district": "sirsa"}) == {
        "state": "Haryana",
        "district": "Sirsa",
    }
    assert sanitize_stored_location({"state": "all", "district": "Sirsa"}) is None


def test_merge_uses_stored_location_when_query_has_no_state():
    plan = {
        "rephrased_query": "What is the weather today?",
        "entities": {},
    }
    messages = [HumanMessage(content="What is the weather today?")]
    stored = {"state": "Haryana", "district": "Sirsa"}
    sources: dict[str, str | None] = {}
    entities = merge_entities_from_rephrased_query(
        plan,
        messages,
        None,
        stored_location=stored,
        sources_out=sources,
    )
    assert entities["state"] == "Haryana"
    assert entities["district"] == "Sirsa"
    assert sources["state_source"] == "stored_user_location"


def test_merge_query_overrides_stored_location():
    plan = {
        "rephrased_query": "Weather in Ambala, Haryana",
        "entities": {"state": "Haryana", "district": "Ambala"},
    }
    messages = [HumanMessage(content="Weather in Ambala, Haryana")]
    stored = {"state": "Haryana", "district": "Sirsa"}
    sources: dict[str, str | None] = {}
    entities = merge_entities_from_rephrased_query(
        plan,
        messages,
        None,
        stored_location=stored,
        sources_out=sources,
    )
    assert entities["district"] == "Ambala"
    assert sources["state_source"] in ("plan.entities.state (llm)", "rephrased_query_text")


def test_merge_prefers_stored_over_prev_entities():
    plan = {"rephrased_query": "What is PM-KISAN?", "entities": {}}
    messages = [HumanMessage(content="What is PM-KISAN?")]
    prev = {"state": "Punjab", "district": "Ludhiana"}
    stored = {"state": "Haryana", "district": "Sirsa"}
    entities = merge_entities_from_rephrased_query(
        plan,
        messages,
        None,
        prev_entities=prev,
        stored_location=stored,
    )
    assert entities["state"] == "Haryana"
    assert entities["district"] == "Sirsa"


def test_is_explicit_location_source():
    assert is_explicit_location_source("rephrased_query_text", None) is True
    assert is_explicit_location_source("stored_user_location", "stored_user_location") is False


@patch("ajrasakha.agents.user_location.save_user_location")
def test_maybe_persist_only_on_explicit_source(mock_save):
    maybe_persist_resolved_location(
        "919876543210",
        "Haryana",
        "Sirsa",
        state_source="stored_user_location",
        district_source="stored_user_location",
        background=False,
    )
    mock_save.assert_not_called()

    maybe_persist_resolved_location(
        "919876543210",
        "Haryana",
        "Sirsa",
        state_source="plan.entities.state (llm)",
        district_source="plan.entities.district (llm)",
        background=False,
    )
    mock_save.assert_called_once_with("919876543210", "Sirsa", "Haryana")

    mock_save.reset_mock()
    maybe_persist_resolved_location(
        "919876543210",
        "Uttar Pradesh",
        "all",
        state_source="rephrased_query_text",
        district_source="default_all_when_state_only",
        background=False,
    )
    mock_save.assert_called_once_with("919876543210", "all", "Uttar Pradesh")


@patch("ajrasakha.agents.user_location.get_user_location")
def test_load_user_location_sanitizes_invalid(mock_get):
    mock_get.return_value = {"state": "all", "district": "Sirsa"}
    assert load_user_location("919876543210") is None
