"""v2 daily-price agent and its farmer-friendly answers (no database; the tool is mocked)."""

from __future__ import annotations

import json
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import HumanMessage, ToolMessage

from ajrasakha.agents import daily_price_v2_agent as agent
from ajrasakha.agents.daily_price_v2_formatter import (
    PRICE_NOTE,
    SERVICE_ERROR_MESSAGE,
    has_any_data,
    inr,
    nice_day,
    render_answer,
    variety_of,
)
from ajrasakha.agents.plan_executor import mandi_unavailable_context

TODAY = date(2026, 11, 2)
T, Y, D3 = "2026-11-02", "2026-11-01", "2026-10-30"


def rec(market="karnal apmc", day=T, modal=2000, low=1900, high=2100, crop="onion", product="onion",
        variety="other", dist=None, arrival=None, district="karnal", state="haryana", source="Agmarknet"):
    r = {"date": day, "market_name": market, "commodity_name": crop, "product_name": product,
         "variety": variety, "grade": "faq", "modal_price": modal, "min_price": low, "max_price": high,
         "arrival_quantity": arrival, "district": district, "state": state, "source_system": source,
         "price_unit": "Rs/quintal"}
    if dist is not None:
        r["distance_km"] = dist
    return r


def today_payload(records, used="lat_long", **res):
    return {"action": "get_today_price", "price_records": records, "total_records_returned": len(records),
            "resolution": {"date_filter": {"mode": "lookback", "lookback_days": 1, "from": T, "to": T, "today": T},
                           "location_priority_used": used, **res}}


def answer(payload, crop="onion"):
    return render_answer(payload, crop=crop, today=TODAY)


# ──────────────────────────────────────────────────────────────────────────
# Formatting helpers
# ──────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("value,expected", [
    (2320, "₹2,320"), (999, "₹999"), (1000, "₹1,000"), (123456, "₹1,23,456"), (1234567.5, "₹12,34,567.50"),
    (2320.0, "₹2,320"), (0.5, "₹0.50"), ("4100", "₹4,100"), (None, None), ("abc", None), (float("nan"), None),
    (99.999, "₹100"),
])
def test_inr_uses_indian_grouping(value, expected):
    assert inr(value) == expected


def test_nice_day():
    assert nice_day(T, TODAY) == "today (2 Nov 2026)"
    assert nice_day(Y, TODAY) == "yesterday (1 Nov 2026)"
    assert nice_day(D3, TODAY) == "30 Oct 2026"
    assert nice_day("not a date", TODAY) == "not a date"


@pytest.mark.parametrize("variety,shown", [
    ("other", ""), ("FAQ", ""), ("", ""), (None, ""), ("onion", ""), ("Local", ""), ("red", "Red"), ("Nasik Red", "Nasik Red"),
])
def test_variety_shown_only_when_meaningful(variety, shown):
    assert variety_of(rec(variety=variety)) == shown


# ──────────────────────────────────────────────────────────────────────────
# Answers
# ──────────────────────────────────────────────────────────────────────────

class TestPriceAnswers:
    def test_single_price(self):
        text = answer(today_payload([rec(dist=0.4, variety="red")]))
        assert text.startswith("Onion price today (2 Nov 2026) at Karnal APMC (Red, 0.4 km away):\n₹2,000 per quintal (₹1,900 – ₹2,100)")
        assert PRICE_NOTE in text
        assert text.endswith("Source: Agmarknet.")

    def test_several_mandis_nearest_first(self):
        text = answer(today_payload([rec("panipat apmc", dist=33.2, modal=2500, low=2400, high=2600),
                                     rec("karnal apmc", dist=0.4)]))
        lines = text.splitlines()
        assert lines[0] == "Onion price today (2 Nov 2026) in mandis near you:"
        assert lines[1].startswith("1. Karnal APMC (0.4 km away): ₹2,000")
        assert lines[2].startswith("2. Panipat APMC (33.2 km away): ₹2,500")

    def test_state_wide_highest_first(self):
        text = answer(today_payload([rec("a apmc", modal=1500, low=1400, high=1600), rec("b apmc", modal=2500, low=2400, high=2600)],
                                    used="state"))
        assert "in Haryana mandis:" in text
        assert text.index("B APMC") < text.index("A APMC")

    def test_modal_only_price(self):
        text = answer(today_payload([rec(modal=6200, low=None, high=None)]))
        assert "₹6,200 per quintal" in text and "–" not in text.splitlines()[1]

    def test_range_only_price(self):
        text = answer(today_payload([rec(modal=None, low=1900, high=2100)]))
        assert "₹1,900 – ₹2,100 per quintal" in text

    def test_history_lists_days_newest_first(self):
        p = today_payload([rec(day=D3, modal=2200, low=2100, high=2300), rec(day=Y, modal=2100, low=2000, high=2200)], used="market_name")
        p["action"] = "get_price_history"
        p["resolution"]["date_filter"] = {"mode": "lookback", "lookback_days": 7, "from": "2026-10-27", "to": T, "today": T}
        text = answer(p)
        lines = text.splitlines()
        assert lines[0] == "Onion prices at Karnal APMC, the last 7 days (27 Oct – 2 Nov 2026):"
        assert lines[1].startswith("• 1 Nov: ₹2,100") and lines[2].startswith("• 30 Oct: ₹2,200")

    def test_long_lists_are_cut(self):
        text = answer(today_payload([rec(f"m{i} apmc", dist=i) for i in range(14)]))
        assert "…and 4 more mandis." in text
        assert "11. " not in text

    def test_no_tables_or_raw_values(self):
        text = answer(today_payload([rec(dist=1.0), rec("x apmc", dist=2.0, low=None)]))
        assert "|" not in text and "None" not in text and "null" not in text and "Rs " not in text

    def test_several_crops_with_note(self):
        p = today_payload([rec(), rec("tarori apmc", crop="paddy(basmati)", product="basmati paddy", modal=4100, low=4000, high=4200)],
                          unavailable_commodities=["Paddy price today is not available in mandis within 40 km of your location."])
        text = answer(p)
        assert "Onion price today (2 Nov 2026) at Karnal APMC:" in text
        assert "Basmati Paddy price today (2 Nov 2026) at Tarori APMC:" in text
        assert "Note: Paddy price today is not available" in text

    def test_notice_comes_first(self):
        p = today_payload([rec("tarori apmc", dist=13.4)],
                          market_fallback_notice="Onion price today is not available at Panipat APMC. Showing prices from the nearest mandis within 40 km of your location.")
        assert answer(p).startswith("Onion price today is not available at Panipat APMC.")

    def test_summary(self):
        p = {"action": "get_price_summary", "total_records_analysed": 9,
             "stats": {"overall": {"avg_modal_price": 2166.67, "lowest_min_price": 1900, "highest_max_price": 2500}, "by_commodity": {"onion": {}}},
             "resolution": {"date_filter": {"mode": "lookback", "lookback_days": 7, "from": "2026-10-27", "to": T}},
             "source_system": "Agmarknet"}
        text = answer(p)
        assert text.startswith("Onion price summary for the last 7 days (27 Oct – 2 Nov 2026):")
        assert "• Average price: ₹2,166.67 per quintal" in text
        assert "• Lowest price: ₹1,900 per quintal" in text and "• Highest price: ₹2,500 per quintal" in text
        assert "• Based on 9 price records" in text

    def test_summary_several_crops(self):
        p = {"action": "get_price_summary",
             "stats": {"by_commodity": {"onion": {"avg_modal_price": 2000, "lowest_min_price": 1900, "highest_max_price": 2100},
                                        "potato": {"avg_modal_price": 1200, "lowest_min_price": 1000, "highest_max_price": 1500}}}}
        text = answer(p)
        assert "• Onion: average ₹2,000, lowest ₹1,900, highest ₹2,100 per quintal" in text
        assert "• Potato: average ₹1,200" in text

    def test_highest(self):
        p = {"action": "get_highest_price", "highest_records": [rec("panipat apmc", day=D3, modal=2400, low=2300, high=2500, dist=33.2)],
             "resolution": {"date_filter": {"mode": "lookback", "lookback_days": 7, "from": "2026-10-27", "to": T}}}
        assert answer(p).startswith(
            "Highest onion price in the last 7 days (27 Oct – 2 Nov 2026): ₹2,400 per quintal (₹2,300 – ₹2,500) "
            "at Panipat APMC (33.2 km away) on 30 Oct 2026.")

    def test_lowest(self):
        p = {"action": "get_lowest_price", "lowest_records": [rec(dist=0.4)],
             "resolution": {"date_filter": {"mode": "lookback", "lookback_days": 1, "to": T}}}
        assert answer(p).startswith("Lowest onion price for today (2 Nov 2026): ₹2,000 per quintal")


class TestArrivals:
    def test_today_arrival(self):
        p = {"action": "get_today_arrival", "arrival_records": [rec(arrival=120, dist=0.4), rec("x apmc", arrival=None)],
             "resolution": {"date_filter": {"mode": "lookback", "lookback_days": 1, "to": T}}}
        text = answer(p)
        assert "Onion arrivals today (2 Nov 2026):" in text
        assert "1. Karnal APMC (0.4 km away): 120 tonnes" in text
        assert "Some mandis did not report the arrival quantity." in text
        assert PRICE_NOTE not in text

    def test_arrival_not_reported(self):
        p = {"action": "get_today_arrival", "arrival_records": [rec(arrival=None)],
             "resolution": {"date_filter": {"mode": "lookback", "lookback_days": 1, "to": T}}}
        assert answer(p) == "Arrival quantity for onion is not reported by these mandis for today (2 Nov 2026)."

    def test_extreme_arrival(self):
        p = {"action": "get_extreme_arrival", "sort_order": "highest",
             "highest_arrivals": [rec(arrival=120), rec("panipat apmc", day=D3, arrival=50)]}
        text = answer(p)
        assert text.splitlines()[1] == "1. Karnal APMC on 2 Nov: 120 tonnes"


class TestOtherAnswers:
    def test_markets_near_me(self):
        p = {"action": "search_markets", "mode": "state_then_distance",
             "markets": [{"name": "tarori apmc", "district": "karnal", "distance_km": 13.4},
                         {"name": "karnal apmc", "district": "karnal", "distance_km": 0.4}]}
        assert answer(p) == "Mandis near you:\n1. Karnal APMC (Karnal district, 0.4 km away)\n2. Tarori APMC (Karnal district, 13.4 km away)"

    def test_named_and_nearby(self):
        p = {"action": "get_price_with_nearby",
             "named_market": today_payload([rec(dist=0.4)], used="market_name"),
             "nearby_markets": {"price_records": [rec(dist=0.4), rec("tarori apmc", dist=13.4, modal=2300, low=2200, high=2400),
                                                  rec("panipat apmc", dist=33.2), rec("a apmc", dist=35), rec("b apmc", dist=36)]}}
        text = answer(p)
        assert text.startswith("Onion price today (2 Nov 2026) at Karnal APMC (0.4 km away):")
        assert "Prices today (2 Nov 2026) in other mandis nearby:" in text
        nearby = text.split("in other mandis nearby:")[1]
        assert "Karnal APMC" not in nearby                           # not repeated
        assert "1. Tarori APMC (13.4 km away)" in nearby and "4." not in nearby  # three at most

    def test_named_mandi_unavailable_is_message_only(self):
        p = {"action": "get_price_with_nearby", "error": "Onion price today is not available at Karnal APMC.",
             "error_code": "NO_PRICE_DATA", "reason": "no_price_at_market"}
        assert answer(p) == "Onion price today is not available at Karnal APMC."

    def test_several_actions(self):
        p = {"actions": ["get_today_price", "search_markets"], "results": {
            "get_today_price": today_payload([rec(dist=0.4)]),
            "search_markets": {"action": "search_markets", "markets": [{"name": "karnal apmc", "distance_km": 0.4}]}}}
        text = answer(p)
        assert "Onion price today" in text and "Mandis near you:" in text


class TestLastUpdated:
    def test_latest_scrape_in_ist_after_source(self):
        p = today_payload([rec(dist=0.4) | {"ingested_at": "2026-11-02T00:45:00+00:00"},
                           rec("x apmc", dist=2.0) | {"ingested_at": "2026-11-01T12:00:00+00:00"}])
        text = answer(p)
        assert text.endswith("Source: Agmarknet.\n\nLast updated: today (2 Nov 2026) at 6:15 AM IST.")

    def test_from_resolution_when_rows_are_not_shown(self):
        p = {"action": "get_price_summary", "stats": {"overall": {"avg_modal_price": 2000}},
             "resolution": {"data_updated_at": "2026-10-31T20:30:00+00:00"}}
        assert answer(p).endswith("Last updated: yesterday (1 Nov 2026) at 2:00 AM IST.")

    def test_arrivals_get_the_line(self):
        p = {"action": "get_today_arrival", "arrival_records": [rec(arrival=120)],
             "resolution": {"data_updated_at": "2026-11-02T03:00:00Z"}}
        assert answer(p).endswith("Last updated: today (2 Nov 2026) at 8:30 AM IST.")

    def test_no_line_without_a_time(self):
        assert "Last updated" not in answer(today_payload([rec(dist=0.4)]))
        assert "Last updated" not in answer(today_payload([rec(dist=0.4) | {"ingested_at": "not a time"}]))


class TestFailures:
    @pytest.mark.parametrize("payload", [
        {"error": "Onion price today is not available in mandis within 40 km of your location.", "error_code": "NO_PRICE_DATA"},
        {"error": "I could not find a crop called 'Xyz'. Did you mean Onion?", "error_code": "COMMODITY_NOT_AVAILABLE"},
        {"action": "get_price_with_nearby", "error": "Paddy price today is not available at Karnal APMC.", "error_code": "NO_PRICE_DATA"},
    ])
    def test_message_only(self, payload):
        text = answer(payload)
        assert text == payload["error"]
        assert "Source" not in text and PRICE_NOTE not in text

    def test_empty_payloads(self):
        assert answer({"action": "get_today_price", "price_records": []}) == "Onion price is not available for this request."
        assert answer(None) == SERVICE_ERROR_MESSAGE
        assert answer({"error": "", "error_code": "SERVICE_ERROR"}) == SERVICE_ERROR_MESSAGE

    def test_has_any_data(self):
        assert has_any_data(today_payload([rec()]))
        assert not has_any_data({"error": "x"})
        assert not has_any_data({"action": "get_today_price", "price_records": []})
        assert not has_any_data({"action": "get_today_arrival", "arrival_records": [rec(arrival=None)]})
        assert has_any_data({"results": {"a": {"error": "x"}, "b": today_payload([rec()])}})
        assert has_any_data({"action": "get_price_with_nearby", "named_market": {"error": "x"},
                             "nearby_markets": {"price_records": [rec()]}})


# ──────────────────────────────────────────────────────────────────────────
# Agent
# ──────────────────────────────────────────────────────────────────────────

INTENT = {"action": "get_today_price", "actions": ["get_today_price"], "nearest_market": True, "radius_km": None,
          "lookback_days": None, "from_date": None, "to_date": None, "market_name": None, "state": None,
          "sort_order": None, "commodity_name": ["onion"], "search_by_apmc": False}


async def run_agent(tool_reply, *, latitude=29.68, longitude=76.99, district="Karnal", intent=None, **extra):
    with (
        patch("ajrasakha.agents.daily_price_agent.extract_daily_price_intent", new_callable=AsyncMock,
              return_value=dict(intent or INTENT)),
        patch.object(agent, "call_mandi_price_tool", new_callable=AsyncMock, return_value=tool_reply) as tool,
    ):
        out = await agent.daily_price.ainvoke({"query": "onion price today", "latitude": latitude, "longitude": longitude,
                                               "crop": "onion", "state": "Haryana", "district": district, **extra})
    return json.loads(out), tool


def _executor_context(envelope: dict):
    state = {"messages": [HumanMessage(content="onion price"),
                          ToolMessage(content=json.dumps(envelope), tool_call_id="1", name="daily_price")],
             "plan": {"mandi": True, "entities": {"state": "Haryana", "district": "Karnal", "crop": "Onion"},
                      "script_language": "English", "vocal_language": "English"}}
    return mandi_unavailable_context(state)


class TestAgent:
    async def test_price_answer(self):
        data, tool = await run_agent(today_payload([rec(dist=0.4)]))
        assert data["status"] == "ok"
        assert data["answer"].startswith("Onion price today")
        args = tool.call_args.args[0]
        assert args["lat"] == 29.68 and args["state"] == "Haryana"

    async def test_no_price_today_message_reaches_farmer(self):
        msg = "Onion price today is not available in mandis within 40 km of your location."
        data, _ = await run_agent({"error": msg, "error_code": "NO_PRICE_DATA", "reason": "no_price_today"})
        assert data["answer"] == msg
        assert data["status"] == "no_data" and data["reason"] == "no_price_today"
        assert "error" not in data["tool_data"] and data["tool_data"]["message"] == msg
        # The plan executor must not swap it for the generic "price not available" reply.
        assert _executor_context(data) is None

    async def test_unknown_crop_message_reaches_farmer(self):
        msg = "I could not find a crop called 'Xyz'. Did you mean Onion?"
        data, _ = await run_agent({"error": msg, "error_code": "COMMODITY_NOT_AVAILABLE", "reason": "crop_not_recognised"})
        assert data["answer"] == msg and _executor_context(data) is None

    @pytest.mark.parametrize("reply", [
        {"error": "HTTPConnectionPool(host='mcp', port=8114): Max retries exceeded"},
        {"error": "Traceback (most recent call last): KeyError 'x'"},
        "<html>502 Bad Gateway</html>",
        None,
    ])
    async def test_transport_errors_never_reach_farmer(self, reply):
        data, _ = await run_agent(reply)
        assert data["answer"] == SERVICE_ERROR_MESSAGE

    async def test_tool_call_raising_gives_plain_message(self):
        with (
            patch("ajrasakha.agents.daily_price_agent.extract_daily_price_intent", new_callable=AsyncMock, return_value=dict(INTENT)),
            patch.object(agent, "_get_tool", new_callable=AsyncMock, side_effect=RuntimeError("connection refused")),
        ):
            out = await agent.daily_price.ainvoke({"query": "onion price", "latitude": 29.68, "longitude": 76.99,
                                                   "crop": "onion", "state": "Haryana"})
        data = json.loads(out)
        assert data["answer"] == SERVICE_ERROR_MESSAGE and "refused" not in out

    async def test_agent_crash_gives_plain_message(self):
        with patch("ajrasakha.agents.daily_price_agent.extract_daily_price_intent", new_callable=AsyncMock,
                   side_effect=ValueError("bad json from model")):
            out = await agent.daily_price.ainvoke({"query": "onion price", "crop": "onion", "state": "Haryana",
                                                   "latitude": 29.68, "longitude": 76.99})
        data = json.loads(out)
        assert data["answer"] == SERVICE_ERROR_MESSAGE and "bad json" not in out

    async def test_missing_state_asks_for_location(self):
        data, _ = await run_agent({"error": "Your state is not known.", "error_code": "STATE_REQUIRED"})
        assert data["status"] == "clarify" and data["reason"] == "missing_location"

    async def test_forecast_question_is_declined_before_tool(self):
        with patch.object(agent, "call_mandi_price_tool", new_callable=AsyncMock) as tool:
            out = await agent.daily_price.ainvoke({"query": "what will onion price be tomorrow", "crop": "onion",
                                                   "state": "Haryana", "latitude": 29.68, "longitude": 76.99})
        assert json.loads(out)["status"] == "unsupported"
        tool.assert_not_awaited()

    async def test_profile_note_only_with_data(self):
        data, _ = await run_agent(today_payload([rec(dist=0.4)]), location_from_profile=True)
        assert "profile" in data["answer"].lower()
        data, _ = await run_agent({"error": "Onion price today is not available in Haryana.", "error_code": "NO_PRICE_DATA"},
                                  location_from_profile=True)
        assert "profile" not in data["answer"].lower()


class TestAgentLocation:
    async def test_profile_coordinates_are_used_without_geocoding(self):
        with patch("ajrasakha.agents.location_extractor.get_lat_long", new_callable=AsyncMock) as geo:
            await run_agent(today_payload([rec()]))
        geo.assert_not_awaited()

    async def test_state_only_is_not_geocoded(self):
        with patch("ajrasakha.agents.location_extractor.get_lat_long", new_callable=AsyncMock) as geo:
            _, tool = await run_agent(today_payload([rec()], used="state"), latitude=None, longitude=None, district=None)
        geo.assert_not_awaited()
        assert "lat" not in tool.call_args.args[0]

    async def test_district_is_geocoded(self):
        with patch("ajrasakha.agents.location_extractor.get_lat_long", new_callable=AsyncMock,
                   return_value=(29.69, 76.99, "Karnal, Haryana")) as geo:
            _, tool = await run_agent(today_payload([rec()]), latitude=None, longitude=None, district="Karnal")
        geo.assert_awaited_once()
        assert tool.call_args.args[0]["lat"] == 29.69

    async def test_state_capital_fallback_is_not_used_as_location(self):
        from ajrasakha.agents.location_extractor import _state_center_fallback
        c_lat, c_lon, name = _state_center_fallback("haryana")
        assert c_lat is not None
        with patch("ajrasakha.agents.location_extractor.get_lat_long", new_callable=AsyncMock,
                   return_value=(c_lat, c_lon, name)):
            _, tool = await run_agent(today_payload([rec()], used="state"), latitude=None, longitude=None, district="Unknownpur")
        assert "lat" not in tool.call_args.args[0]
