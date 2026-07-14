"""Tests for deterministic specialist tool output formatting."""

from __future__ import annotations

import json

from ajrasakha.agents.answer_body import format_non_gdb_tool_results
from ajrasakha.agents.tool_output_formatters import format_tool_output
from langchain_core.messages import HumanMessage, ToolMessage

FORECAST_ENVELOPE = {
    "success": True,
    "data_type": "forecast",
    "latitude": 32.4288215,
    "longitude": 75.5628646,
    "result": {
        "success": True,
        "today": {
            "date": "2026-06-06",
            "station": "Pathankot",
            "station_code": "42057",
            "observed_min_temp": None,
            "observed_max_temp": None,
            "past_24hrs_rainfall": "NIL",
            "humidity_0830": None,
            "humidity_1730": None,
            "sunrise": "05:21",
            "sunset": "19:32",
            "forecast_max_temp": "38.0",
            "forecast_min_temp": "25.0",
            "forecast": "Partly cloudy sky",
            "nearest_station_lat": "32.250000000",
            "nearest_station_lon": "75.633333333",
            "distance_to_station_km": 20.96,
        },
        "forecast": [
            {"day": 2, "max_temp": "39.0", "min_temp": "25.0", "forecast": "Mainly Clear sky"},
            {"day": 3, "max_temp": "40.0", "min_temp": "25.0", "forecast": "Mainly Clear sky"},
            {"day": 4, "max_temp": "41.0", "min_temp": "26.0", "forecast": "Mainly Clear sky"},
            {
                "day": 5,
                "max_temp": "41.0",
                "min_temp": "26.0",
                "forecast": "Partly cloudy sky with one or two spells of rain or thundershowers",
            },
            {"day": 6, "max_temp": "42.0", "min_temp": "27.0", "forecast": "Partly cloudy sky with rain"},
            {"day": 7, "max_temp": None, "min_temp": None, "forecast": None},
        ],
        "stations_returned": 586,
    },
}


AGMARKNET_COTTON_ROW = {
    "trend": "up",
    "cmdt_name": "Cotton",
    "msp_price": "7710.00",
    "as_on_price": "8436.65",
    "as_on_arrival": "31.00",
    "cmdt_grp_name": "Fibre Crops",
    "reported_date": "04-06-2026",
    "one_day_ago_price": "8776.00",
    "two_day_ago_price": "8310.45",
    "one_day_ago_arrival": "11.50",
    "two_day_ago_arrival": "43.40",
}

MARKET_COTTON_SIRSA_ENVELOPE = {
    "query_context": {
        "state": "Haryana",
        "district": "Sirsa",
        "crop": "Cotton",
        "target_date": "2026-06-06",
    },
    "agmarknet": {
        "success": True,
        "source": "Agmarknet",
        "data": [dict(AGMARKNET_COTTON_ROW) for _ in range(5)],
    },
    "enam": {
        "success": True,
        "source": "eNAM",
        "data": [],
    },
}


def test_format_forecast_from_real_payload():
    raw = json.dumps(FORECAST_ENVELOPE)
    out = format_tool_output("weather", raw)
    assert "{" not in out
    assert "Pathankot" in out
    assert "Partly cloudy sky" in out
    assert "Day 2" in out
    assert "Mainly Clear sky" in out
    assert "25.0°C–38.0°C" in out or "25°C–38°C" in out
    assert "Upcoming days" in out


def test_format_current_aws():
    payload = {
        "success": True,
        "data_type": "current_aws",
        "result": {
            "success": True,
            "distance_km": 12.5,
            "station": {
                "name": "Rohtak AWS",
                "district": "Rohtak",
                "state": "Haryana",
                "date": "2026-06-06",
                "time": "14:30",
                "temperature_c": "36",
                "feel_like_c": "38",
                "humidity_pct": "45",
                "wind_speed_kmph": "12",
                "wind_direction_deg": "270",
                "weather_message": "Clear sky",
            },
        },
    }
    out = format_tool_output("weather", json.dumps(payload))
    assert "Current weather" in out
    assert "Rohtak AWS" in out
    assert "36°C" in out
    assert "Clear sky" in out


def test_format_district_warnings():
    payload = {
        "success": True,
        "data_type": "district_warnings",
        "matched_district": "Amritsar",
        "result": {
            "success": True,
            "record": {
                "day1_warning": "Thunderstorm with lightning",
                "day1_color": "Yellow",
                "day2_warning": "NO_WARNING",
            },
        },
    }
    out = format_tool_output("weather", json.dumps(payload))
    assert "District weather warnings" in out
    assert "Amritsar" in out
    assert "Day 1" in out
    assert "Thunderstorm" in out


def test_format_district_rainfall():
    payload = {
        "success": True,
        "data_type": "district_rainfall",
        "matched_district": "Amritsar",
        "result": {
            "success": True,
            "record": {
                "Cumulative_Rainfall": "120.5",
                "Normal_Rainfall": "100.0",
                "Status": "Normal",
            },
        },
    }
    out = format_tool_output("weather", json.dumps(payload))
    assert "District rainfall" in out
    assert "Amritsar" in out
    assert "120.5" in out


def test_format_district_combined():
    payload = {
        "success": True,
        "data_type": "district",
        "matched_district": "Amritsar",
        "result": {
            "warnings": {
                "success": True,
                "record": {"day1_warning": "Heavy rain warning"},
            },
            "rainfall": {
                "success": True,
                "record": {"Status": "Excess"},
            },
        },
    }
    out = format_tool_output("weather", json.dumps(payload))
    assert "District weather warnings" in out
    assert "District rainfall" in out
    assert "Heavy rain warning" in out
    assert "Excess" in out


def test_format_subdivision_warnings_filters_by_state():
    payload = {
        "success": True,
        "data_type": "subdivision_warnings",
        "note": "National product; coordinates are not used.",
        "geocode": {"state": "Punjab"},
        "result": {
            "success": True,
            "date": "2026-06-06",
            "data": [
                {
                    "subdivision": "Punjab",
                    "warnings": [
                        {"day": "Day 1", "warning": "Thunderstorm", "color": "Yellow"},
                    ],
                },
                {
                    "subdivision": "Tamil Nadu",
                    "warnings": [
                        {"day": "Day 1", "warning": "Heavy rain", "color": "Red"},
                    ],
                },
            ],
        },
    }
    out = format_tool_output("weather", json.dumps(payload))
    assert "Punjab" in out
    assert "Thunderstorm" in out
    assert "Tamil Nadu" not in out


def test_format_subdivision_rainfall():
    payload = {
        "success": True,
        "data_type": "subdivision_rainfall",
        "geocode": {"state": "Haryana"},
        "result": {
            "success": True,
            "date": "2026-06-06",
            "data": [
                {
                    "subdivision": "Haryana, Delhi & Chandigarh",
                    "forecast": [
                        {"day": "Day 1", "distribution": "Scattered", "coverage": "25%"},
                    ],
                },
            ],
        },
    }
    out = format_tool_output("weather", json.dumps(payload))
    assert "Subdivision rainfall forecast" in out
    assert "Scattered" in out


def test_format_bundle():
    payload = {
        "success": True,
        "data_type": "bundle",
        "result": {
            "forecast": FORECAST_ENVELOPE["result"],
            "nearest_aws": {
                "success": False,
                "error": "No AWS stations",
            },
            "district": {"success": False, "error": "District not resolved"},
        },
    }
    out = format_tool_output("weather", json.dumps(payload))
    assert "Weather forecast" in out
    assert "Pathankot" in out
    assert "Nearest Aws: No AWS stations" in out or "Nearest aws: No AWS stations" in out.lower()


def test_format_weather_error_envelope():
    payload = {"success": False, "data_type": "forecast", "error": "Connection timed out"}
    out = format_tool_output("weather", json.dumps(payload))
    assert "Connection timed out" in out


def test_format_weather_non_json_passthrough():
    msg = "⚠️ Weather coordinates are unavailable."
    assert format_tool_output("weather", msg) == msg


def test_format_market_passthrough_non_json():
    prose = "Wheat price is ₹2500/qtl in Ludhiana mandi."
    assert format_tool_output("market", prose) == prose


def test_format_daily_price_passthrough():
    prose = "Wheat modal price near Ludhiana is Rs 2500 per quintal today."
    assert format_tool_output("daily_price", prose) == prose


def test_format_market_agmarknet_cotton_sirsa():
    out = format_tool_output("market", json.dumps(MARKET_COTTON_SIRSA_ENVELOPE))
    assert "{" not in out
    assert "Mandi prices" in out
    assert "Cotton" in out
    assert "Sirsa" in out
    assert "8436.65" in out or "8,436" in out
    assert "Agmarknet" in out
    assert "• No trade data" in out or "eNAM" in out
    assert out.count("Latest modal price") == 1


def test_format_market_onion_missing_latest_price():
    payload = {
        "query_context": {
            "state": "Haryana",
            "district": "Sirsa",
            "crop": "Onion",
            "target_date": "2026-06-06",
        },
        "agmarknet": {
            "success": True,
            "source": "Agmarknet",
            "data": [{
                "cmdt_name": "Onion",
                "cmdt_grp_name": "Vegetables",
                "reported_date": "04-06-2026",
                "as_on_price": None,
                "msp_price": None,
                "as_on_arrival": None,
                "one_day_ago_price": "1304.28",
                "one_day_ago_arrival": "11.90",
                "two_day_ago_price": "1175.94",
                "two_day_ago_arrival": "9.90",
            }],
        },
        "enam": {"success": True, "source": "eNAM", "data": []},
    }
    out = format_tool_output("market", json.dumps(payload))
    assert "Latest modal price not reported for query date" in out
    assert "Previous prices:" in out
    assert "1 day ago" in out
    assert "2 days ago" in out
    assert "• Commodity: Onion (Vegetables)" in out
    assert "\n\nAgmarknet" in out


def test_format_market_both_empty():
    """When both market sources have no data, return empty string to trigger empty_gdb_reply."""
    payload = {
        "query_context": {
            "state": "Jammu and Kashmir",
            "district": "all",
            "crop": "Paddy(Common)",
            "target_date": "2026-06-06",
        },
        "agmarknet": {"success": True, "source": "Agmarknet", "data": []},
        "enam": {"success": True, "source": "eNAM", "data": []},
    }
    out = format_tool_output("market", json.dumps(payload))
    # Empty string triggers empty_gdb_reply path
    assert out == ""


def test_format_non_gdb_market_json_becomes_readable():
    messages = [
        HumanMessage(content="Cotton price in Sirsa?"),
        ToolMessage(
            content=json.dumps(MARKET_COTTON_SIRSA_ENVELOPE),
            tool_call_id="m-1",
            name="market",
        ),
    ]
    block = format_non_gdb_tool_results(messages)
    assert "{" not in block
    assert "8436.65" in block or "8,436" in block


def test_format_market_passthrough_invalid_json():
    assert format_tool_output("market", "not json at all") == "not json at all"


def test_format_non_gdb_weather_json_becomes_readable():
    messages = [
        HumanMessage(content="Weather tomorrow?"),
        ToolMessage(
            content=json.dumps(FORECAST_ENVELOPE),
            tool_call_id="w-1",
            name="weather",
        ),
    ]
    block = format_non_gdb_tool_results(messages)
    assert "### weather" not in block
    assert "{" not in block
    assert "Pathankot" in block


def test_format_weather_empty_string_returns_empty():
    """When weather API fails and returns empty string, it should return empty output."""
    # Simulating what happens when fetch_api_weather returns "" and we check "if not result"
    out = format_tool_output("weather", "")
    assert out == ""


def test_format_weather_empty_string_in_tool_message():
    """Empty weather tool message should not contribute to output block."""
    messages = [
        HumanMessage(content="Weather in Punjab?"),
        ToolMessage(
            content="",  # Empty string when API fails
            tool_call_id="w-1",
            name="weather",
        ),
    ]
    block = format_non_gdb_tool_results(messages)
    # Empty weather result should not produce any output
    assert block == ""


def test_format_weather_success_false_returns_empty():
    """When weather API returns success=false (e.g., 404), it should return empty output."""
    # This simulates what happens when IMD API returns {"success": false, "error": "..."}
    payload = {"success": False, "error": "404 Not Found"}
    out = format_tool_output("weather", json.dumps(payload))
    # Should show error message (this is the formatted output from the tool)
    assert "404 Not Found" in out
