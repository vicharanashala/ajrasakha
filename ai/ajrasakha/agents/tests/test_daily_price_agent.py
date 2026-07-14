"""Tests for daily_price agent intent extraction and empty-result handling."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ajrasakha.agents.daily_price_agent import (
    _build_tool_args,
    _heuristic_intent,
    _normalize_intent,
    _tool_result_is_empty,
    daily_price,
    extract_daily_price_intent,
)


def test_heuristic_intent_defaults_to_today_price():
    intent = _heuristic_intent("What is the price of wheat today?")
    assert intent["action"] == "get_today_price"
    assert intent["nearest_market"] is True


def test_heuristic_intent_price_history():
    intent = _heuristic_intent("Onion prices last 15 days")
    assert intent["action"] == "get_price_history"
    assert intent["lookback_days"] == 7


def test_heuristic_intent_search_markets():
    intent = _heuristic_intent("Which mandis are nearest market near me?")
    assert intent["action"] == "search_markets"


def test_normalize_intent_maps_legacy_get_prices():
    intent = _normalize_intent({"action": "get_prices"}, "price of onion today")
    assert intent["action"] == "get_today_price"


def test_normalize_intent_maps_legacy_get_prices_with_lookback():
    intent = _normalize_intent(
        {"action": "get_prices", "lookback_days": 15, "state": "Maharashtra"},
        "Onion prices in Maharashtra last 15 days",
    )
    assert intent["action"] == "get_price_history"
    assert intent["lookback_days"] == 15
    assert intent["state"] == "Maharashtra"


def test_normalize_intent_rejects_unknown_action():
    intent = _normalize_intent({"action": "get_unresolved_markets"}, "price of onion")
    assert intent["action"] == "search_markets"


def test_build_tool_args_today_price():
    args = _build_tool_args(
        {
            "action": "get_today_price",
            "nearest_market": True,
            "radius_km": None,
            "lookback_days": None,
            "from_date": None,
            "to_date": None,
            "market_name": None,
            "state": None,
            "sort_order": None,
        },
        lat=30.9,
        lon=76.5,
        crop="wheat",
        state="Punjab",
    )
    assert args["action"] == "get_today_price"
    assert args["commodity_name"] == ["wheat"]
    assert args["lat"] == 30.9
    assert args["long"] == 76.5
    assert args["state"] == "Punjab"
    assert "lookback_days" not in args


def test_build_tool_args_price_history():
    args = _build_tool_args(
        {
            "action": "get_price_history",
            "nearest_market": True,
            "radius_km": None,
            "lookback_days": 15,
            "from_date": None,
            "to_date": None,
            "market_name": None,
            "state": "Maharashtra",
            "sort_order": None,
        },
        lat=19.07,
        lon=72.87,
        crop="onion",
        state="Maharashtra",
    )
    assert args["action"] == "get_price_history"
    assert args["lookback_days"] == 15
    assert args["commodity_name"] == ["onion"]


def test_tool_result_is_empty_on_error_or_no_records():
    assert _tool_result_is_empty({"error": "missing"})
    assert _tool_result_is_empty({"price_records": [], "stats": {}})
    assert _tool_result_is_empty({"highest_records": []})
    assert not _tool_result_is_empty({
        "price_records": [{"modal_price": 2000}],
        "stats": {},
    })
    assert not _tool_result_is_empty({"stats": {"overall": {"avg_modal_price": 650}}})


def test_tool_result_unwraps_mcp_text_envelope():
    payload = [{"type": "text", "text": '{"price_records":[{"modal_price":700}]}'}]
    assert not _tool_result_is_empty(payload)
    assert _tool_result_is_empty([{"type": "text", "text": '{"error":"Unknown action"}'}])


@pytest.mark.asyncio
async def test_extract_daily_price_intent_uses_gemma_json():
    gemma_json = (
        '{"action":"get_price_history","nearest_market":true,"radius_km":null,'
        '"lookback_days":15,"from_date":null,"to_date":null,'
        '"market_name":null,"state":"Maharashtra","sort_order":null}'
    )
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": gemma_json}}],
    }
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

    with patch("ajrasakha.agents.daily_price_agent.httpx.AsyncClient", return_value=mock_client):
        intent = await extract_daily_price_intent("Onion prices in Maharashtra last 15 days")

    assert intent["action"] == "get_price_history"
    assert intent["lookback_days"] == 15
    assert intent["state"] == "Maharashtra"


@pytest.mark.asyncio
async def test_extract_daily_price_intent_heuristic_on_gemma_failure():
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value.post = AsyncMock(side_effect=RuntimeError("down"))

    with patch("ajrasakha.agents.daily_price_agent.httpx.AsyncClient", return_value=mock_client):
        intent = await extract_daily_price_intent("Find nearest market near me")

    assert intent["action"] == "search_markets"


@pytest.mark.asyncio
async def test_daily_price_returns_empty_when_tool_empty():
    with (
        patch(
            "ajrasakha.agents.daily_price_agent.extract_daily_price_intent",
            new_callable=AsyncMock,
            return_value={
                "action": "get_today_price",
                "nearest_market": True,
                "radius_km": None,
                "lookback_days": None,
                "from_date": None,
                "to_date": None,
                "market_name": None,
                "state": None,
                "sort_order": None,
            },
        ),
        patch(
            "ajrasakha.agents.daily_price_agent.call_mandi_price_tool",
            new_callable=AsyncMock,
            return_value={"price_records": [], "stats": {}},
        ),
    ):
        out = await daily_price.ainvoke({
            "query": "wheat price",
            "latitude": 30.9,
            "longitude": 76.5,
            "crop": "wheat",
            "state": "Punjab",
        })
    assert out == ""


@pytest.mark.asyncio
async def test_daily_price_returns_gemma_answer():
    tool_payload = {
        "action": "get_today_price",
        "price_records": [{"market_name": "Ludhiana", "modal_price": 2500, "commodity_name": "Wheat"}],
    }
    with (
        patch(
            "ajrasakha.agents.daily_price_agent.extract_daily_price_intent",
            new_callable=AsyncMock,
            return_value={
                "action": "get_today_price",
                "nearest_market": True,
                "radius_km": None,
                "lookback_days": None,
                "from_date": None,
                "to_date": None,
                "market_name": None,
                "state": None,
                "sort_order": None,
            },
        ),
        patch(
            "ajrasakha.agents.daily_price_agent.call_mandi_price_tool",
            new_callable=AsyncMock,
            return_value=tool_payload,
        ),
        patch(
            "ajrasakha.agents.daily_price_agent.synthesize_daily_price_answer",
            new_callable=AsyncMock,
            return_value="Wheat modal price in Ludhiana is Rs 2500 per quintal.",
        ),
    ):
        out = await daily_price.ainvoke({
            "query": "wheat price near me",
            "latitude": 30.9,
            "longitude": 76.5,
            "crop": "wheat",
            "state": "Punjab",
        })
    assert "2500" in out
    assert "Ludhiana" in out
