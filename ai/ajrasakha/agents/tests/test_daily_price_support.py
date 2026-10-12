"""Unsupported-question detection and fixed decline/clarify messages."""

import pytest

from ajrasakha.agents.daily_price_support import (
    CLARIFY_REASONS,
    UNSUPPORTED_REASONS,
    classify_tool_error,
    clarify_reason_for_error,
    detect_unsupported_query,
    message_for,
    status_for,
)


@pytest.mark.parametrize("query", [
    "Compare onion price in Azadpur mandi and Ludhiana mandi",
    "onion price in azadpur mandi vs ludhiana mandi",
    "onion price in Azadpur and Ludhiana mandi",
    "difference between Pune market and Nashik market onion rate",
    "price of wheat between Khanna mandi and Ludhiana mandi",
    "Azadpur APMC, Ludhiana APMC wheat rates",
    "which mandi is better than Azadpur market for onion",
])
def test_two_markets_are_declined(query):
    assert detect_unsupported_query(query) == "multi_market_comparison"


@pytest.mark.parametrize("query", [
    "will onion price go up next week",
    "predict wheat price in Punjab",
    "should I sell my wheat now",
    "tomato price tomorrow in Pune",
    "best time to sell potato",
])
def test_forecast_and_advice_are_declined(query):
    assert detect_unsupported_query(query) == "forecast_or_advice"


@pytest.mark.parametrize("query", [
    "what is the MSP of wheat",
    "cost of cultivation of paddy",
])
def test_msp_and_cost_are_declined(query):
    assert detect_unsupported_query(query) == "msp_or_cost"


@pytest.mark.parametrize("query", [
    "Onion price in Azadpur mandi today",
    "wheat and potato price in Punjab",
    "market price of onion in Pune",
    "mandi rate of tomato near me",
    "tomato price between 1st and 10th august in Kottayam mandi",
    "onion price from 1 august to 10 august in Nashik",
    "Which mandis are near me?",
    "nearby markets for rice in Guwahati",
    "highest price of onion in Maharashtra last week",
    "wheat price in Ludhiana mandi and which mandis are near me",
    "",
])
def test_normal_questions_are_not_declined(query):
    assert detect_unsupported_query(query) is None


def test_every_reason_has_a_message_and_status():
    for reason in UNSUPPORTED_REASONS | CLARIFY_REASONS:
        assert message_for(reason)
        assert status_for(reason) == ("clarify" if reason in CLARIFY_REASONS else "unsupported")
    assert message_for("something_new") == message_for("unrecognized_request")


def test_decline_messages_give_working_examples():
    assert "Azadpur mandi" in message_for("multi_market_comparison")
    assert "cannot predict" in message_for("forecast_or_advice")


@pytest.mark.parametrize("payload,code", [
    ({"error": "x", "error_code": "NO_PRICE_DATA"}, "NO_PRICE_DATA"),
    ({"error": "state name is not present"}, "STATE_REQUIRED"),
    ({"error": "We do not have Foo available in Kerala."}, "COMMODITY_NOT_AVAILABLE"),
    ({"error": "No markets_commodities entries matched crop=['Wheat'] in state=Assam."}, "COMMODITY_NOT_AVAILABLE"),
    ({"error": "Market 'x' was not found in Kerala."}, "MARKET_NOT_FOUND"),
    ({"error": "Mandi price data is not available for wheat in Aluva."}, "NO_PRICE_DATA"),
    ({"error": "commodity_name is required for action='get_today_price'."}, "COMMODITY_REQUIRED"),
    ({"error": "Unknown action 'foo'. Choose one of: a, b"}, "UNSUPPORTED_ACTION"),
    ({"error": "something odd"}, None),
    ({"price_records": []}, None),
    ("not a dict", None),
])
def test_classify_tool_error(payload, code):
    assert classify_tool_error(payload) == code


def test_clarify_reason_only_for_missing_details():
    assert clarify_reason_for_error({"error": "state name is not present"}) == "missing_location"
    assert clarify_reason_for_error({"error": "commodity_name is required for action='x'."}) == "missing_commodity"
    assert clarify_reason_for_error({"error": "We do not have Foo available in Kerala."}) is None
