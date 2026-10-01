"""Tests for the farmer-friendly weather answer renderer."""

from __future__ import annotations

import copy
from datetime import date

from ajrasakha.agents.weather_farmer_answer import (
    natural_condition,
    question_focus,
    render_farmer_weather_answer,
)

TODAY = date(2026, 9, 30)
IMD = "India Meteorological Department (IMD)"

STATION_INFO = {
    "nearest_station_name": "BHATINDA_AMFU",
    "distance_from_requested_place_km": 11.0,
    "search_radius_km": 50.0,
    "nearest_station_note": "Notice: Weather observations retrieved from nearest active IMD station 'BHATINDA_AMFU' located 11.0 km from Bathinda (searched within 50.0 km radius range).",
    "station_details": {"name": "BHATINDA_AMFU"},
    "data_source": IMD,
}

LIVE_AWS = {
    "success": True,
    "distance_km": 11.0,
    "station": {
        "name": "BHATINDA_AMFU",
        "temperature_c": 30.2,
        "feel_like_c": 32.4,
        "humidity_pct": 56,
        "weather_description": "Clear Sky",
    },
}

# get_temperature_info, target_date = today (the payload behind the original technical answer).
TEMPERATURE_TODAY = {
    "resolved_location": "Bathinda, Bathinda Tahsil, Bathinda",
    "summary": "Observed Temperature: 30.2°C, Feel-like: 32.4°C, Humidity: 56%, Weather Condition: 'Clear Sky'.",
    "temperature_timeframe_data": {
        "selected_timeframe": "specific_target_date (2026-09-30)",
        "target_date_temperature": {
            "day": 1,
            "date": "2026-09-30",
            "min_temp_c": "22.7",
            "max_temp_c": "36.6",
            "humidity_0830": None,
            "humidity_1730": None,
            "forecast_condition": "Mainly Clear sky",
            "data_source": IMD,
        },
        "data_source": IMD,
    },
    "data_source": IMD,
    "target_date": "2026-09-30",
    "nearest_station_info": STATION_INFO,
    "nearest_live_aws_station": LIVE_AWS,
}

# get_current_and_forecast_info, today (IMD current observation attached).
WEATHER_TODAY = {
    "resolved_location": "Bathinda, Bathinda Tahsil, Bathinda, Punjab, 151001, India",
    "summary": "Today's Weather in Bathinda: Temp: 30.2°C, Humidity: 56%, Wind: NW 6 kmph, Condition: Clear Sky.",
    "weather_data": {
        "selected_timeframe": "today",
        "today_weather": {
            "date": "2026-09-30",
            "station": "Bathinda",
            "forecast_min_temp": "22.7",
            "forecast_max_temp": "36.6",
            "forecast": "Mainly Clear sky",
            "past_24hrs_rainfall": "NIL",
            "humidity_0830": "78",
            "humidity_1730": "45",
        },
        "data_source_today": "imd",
        "data_source": IMD,
    },
    "data_source": IMD,
    "nearest_station_info": STATION_INFO,
    "imd_current_weather": {"success": True, "distance_km": 11.0, "station": LIVE_AWS["station"]},
    "query_type": "today",
}


def _forecast_item(day: int, iso: str, lo: str, hi: str, text: str) -> dict:
    return {"day": day, "date": iso, "station": "Bathinda", "min_temp": lo, "max_temp": hi, "forecast": text, "data_source": IMD}


def _weather_target(iso: str, item: dict) -> dict:
    return {
        "resolved_location": "Bathinda, Bathinda Tahsil, Bathinda",
        "summary": f"Weather forecast for {iso} in Bathinda: ...",
        "weather_data": {
            "selected_timeframe": f"specific_target_date ({iso})",
            "target_date_weather": item,
            "data_source": IMD,
        },
        "data_source": IMD,
        "target_date": iso,
        "nearest_station_info": STATION_INFO,
        "query_type": "forecast",
    }


WEATHER_TOMORROW = _weather_target("2026-10-01", _forecast_item(2, "2026-10-01", "23.0", "35.8", "Partly cloudy sky"))
WEATHER_SPECIFIC_DATE = _weather_target(
    "2026-10-04", _forecast_item(5, "2026-10-04", "21.5", "33.0", "Generally cloudy sky with possibility of rain or thunderstorm")
)

WEATHER_RANGE = {
    "resolved_location": "Bathinda, Bathinda Tahsil, Bathinda",
    "summary": "3-Day Weather Forecast for Bathinda: ...",
    "weather_data": {
        "selected_timeframe": "next_3_days_forecast",
        "forecast_days_count": 3,
        "forecast_list": [
            _forecast_item(1, "2026-09-30", "22.7", "36.6", "Mainly Clear sky"),
            _forecast_item(2, "2026-10-01", "23.0", "35.8", "Partly cloudy sky"),
            _forecast_item(3, "2026-10-02", "22.0", "34.1", "Overcast"),
        ],
        "data_source": IMD,
    },
    "data_source": IMD,
    "nearest_station_info": STATION_INFO,
    "query_type": "forecast",
}


def _render(query: str, payload: dict) -> str:
    return render_farmer_weather_answer(query, payload, today=TODAY)


def _assert_no_internal_terms(answer: str) -> None:
    for term in ("specific_target_date", "Timeframe", "Summary:", "Tahsil", "_days_", "N/A", "None", "MCP", "Observation station:"):
        assert term not in answer, f"{term!r} leaked into: {answer}"


def test_current_temperature_query_answers_temperature_first():
    answer = _render("What is the temperature in Bathinda?", TEMPERATURE_TODAY)
    assert answer == (
        "📍 **Bathinda**\n\n"
        "🌡️ **Current temperature: 30.2°C**\n"
        "🥵 **Feels like: 32.4°C**\n\n"
        "Today's range: **22.7°C – 36.6°C**\n\n"
        f"**Source:** {IMD}\n\n"
        "Weather station: Bhatinda AMFU, approximately 11 km away."
    )


def test_todays_weather_query_lists_all_fields_once():
    answer = _render("How is the weather in Bathinda today?", TEMPERATURE_TODAY)
    assert answer == (
        "📍 **Bathinda**\n\n"
        "☀️ **Today's Weather — 30 September**\n\n"
        "- 🌡️ Temperature: **30.2°C**\n"
        "- 🥵 Feels like: **32.4°C**\n"
        "- 🌡️ Today's range: **22.7°C – 36.6°C**\n"
        "- 💧 Humidity: **56%**\n"
        "- ☀️ Condition: **Clear**\n\n"
        f"**Source:** {IMD}\n\n"
        "Weather station: Bhatinda AMFU, approximately 11 km away."
    )


def test_todays_weather_from_forecast_tool():
    answer = _render("How is the weather in Bathinda today?", WEATHER_TODAY)
    assert "📍 **Bathinda**" in answer
    assert "**Today's Weather — 30 September**" in answer
    assert "- 🌡️ Temperature: **30.2°C**" in answer
    assert "- 💧 Humidity: **56%**" in answer  # live humidity preferred over 08:30 reading
    assert "Rain" not in answer  # NIL rain is not mentioned unless asked
    _assert_no_internal_terms(answer)


def test_tomorrow_weather_has_no_current_values():
    answer = _render("What will the weather be like in Bathinda tomorrow?", WEATHER_TOMORROW)
    assert "⛅ **Tomorrow's Weather — 1 October**" in answer
    assert "- 🌡️ Temperature range: **23.0°C – 35.8°C**" in answer
    assert "- ⛅ Condition: **Partly cloudy**" in answer
    assert "30.2" not in answer and "Feels like" not in answer
    _assert_no_internal_terms(answer)


def test_specific_date_weather():
    answer = _render("Weather in Bathinda on 4 October?", WEATHER_SPECIFIC_DATE)
    assert "**Weather on Sunday, 4 October**" in answer
    assert "Mostly cloudy with possibility of rain or thunderstorm" in answer
    assert "21.5°C – 33.0°C" in answer
    _assert_no_internal_terms(answer)


def test_date_range_weather_lists_each_day():
    answer = _render("Weather forecast for Bathinda for next 3 days", WEATHER_RANGE)
    assert "🗓️ **Forecast for the next 3 days** (min – max)" in answer
    assert "- **Today, 30 Sep:** 🌤️ Mostly clear, 22.7°C – 36.6°C" in answer
    assert "- **Tomorrow, 1 Oct:** ⛅ Partly cloudy, 23.0°C – 35.8°C" in answer
    assert "- **Fri, 2 Oct:** ☁️ Cloudy, 22.0°C – 34.1°C" in answer
    _assert_no_internal_terms(answer)


def test_farmer_query_adds_short_grounded_note():
    answer = _render("Is the weather good for farming today in Bathinda?", TEMPERATURE_TODAY)
    assert "**Today's Weather — 30 September**" in answer
    assert "🌾 **For Farmers**" in answer
    assert "up to 36.6°C" in answer
    assert answer.index("🌾 **For Farmers**") < answer.index("**Source:**")
    for unsupported in ("irrigat", "spray", "fertili", "disease", "pesticide"):
        assert unsupported not in answer.lower()


def test_no_farmer_note_for_plain_weather_query():
    assert "For Farmers" not in _render("How is the weather in Bathinda today?", TEMPERATURE_TODAY)


def test_farmer_note_mentions_rain_from_forecast():
    answer = _render("Can I work in my field on 4 October in Bathinda?", WEATHER_SPECIFIC_DATE)
    assert "Thunderstorms are possible on 4 October" in answer


def test_missing_fields_are_skipped():
    payload = copy.deepcopy(TEMPERATURE_TODAY)
    payload.pop("nearest_live_aws_station")
    payload["summary"] = "Observed Temperature: 30.2°C, Feel-like: N/A°C, Humidity: N/A%, Weather Condition: 'N/A'."
    payload["temperature_timeframe_data"]["target_date_temperature"]["max_temp_c"] = None
    answer = _render("How is the weather in Bathinda today?", payload)
    assert "- 🌡️ Temperature: **30.2°C**" in answer
    assert "- 🌡️ Today's range: **from 22.7°C**" in answer
    assert "- 🌤️ Condition: **Mostly clear**" in answer  # falls back to the forecast condition
    assert "Feels like" not in answer and "Humidity" not in answer
    _assert_no_internal_terms(answer)


def test_missing_humidity_is_stated_for_humidity_question():
    payload = copy.deepcopy(WEATHER_TOMORROW)
    answer = _render("What is the humidity in Bathinda tomorrow?", payload)
    assert "Humidity data is not available" in answer
    assert "Tomorrow's Weather — 1 October" in answer


def test_values_only_in_summary_are_used_for_today():
    payload = copy.deepcopy(TEMPERATURE_TODAY)
    payload.pop("nearest_live_aws_station")
    answer = _render("What is the temperature in Bathinda?", payload)
    assert "**Current temperature: 30.2°C**" in answer
    assert "**Feels like: 32.4°C**" in answer


def test_station_is_secondary_and_prettified():
    answer = _render("What is the temperature in Bathinda?", TEMPERATURE_TODAY)
    assert answer.endswith("Weather station: Bhatinda AMFU, approximately 11 km away.")
    assert "BHATINDA_AMFU" not in answer


def test_station_without_distance_and_without_station():
    payload = copy.deepcopy(TEMPERATURE_TODAY)
    payload["nearest_station_info"]["distance_from_requested_place_km"] = 0.0
    payload["nearest_live_aws_station"]["distance_km"] = 0.0  # station that supplied the live reading
    assert _render("temperature in Bathinda", payload).endswith("Weather station: Bhatinda AMFU.")
    payload["nearest_station_info"] = {"nearest_station_name": None, "distance_from_requested_place_km": None}
    payload.pop("nearest_live_aws_station")
    assert "Weather station" not in _render("temperature in Bathinda", payload)


def test_rainfall_today_query():
    payload = {
        "resolved_location": "Ludhiana, Ludhiana East Tahsil, Ludhiana",
        "district": "Ludhiana",
        "summary": "Today's Rainfall in Ludhiana: ...",
        "results": {
            "timeframe": "today_current_rainfall",
            "today_rainfall": {
                "date": "2026-09-30",
                "observed_past_24hrs_rainfall": "12.4",
                "district_daily_actual_mm": "10.2",
                "district_daily_normal_mm": "2.5",
                "departure_pct": "308",
                "category_code": "LE",
                "category_description": "Large Excess",
                "weekly_cumulative_mm": "N/A",
                "data_source": IMD,
            },
            "data_source": IMD,
        },
        "data_source": IMD,
    }
    answer = _render("How much rain in Ludhiana today?", payload)
    assert answer.startswith("📍 **Ludhiana**\n\n🌧️ **Rain recorded in the last 24 hours: 12.4 mm**")
    assert "- District rainfall today: **10.2 mm** (normal: 2.5 mm) — 308% compared to normal, Large Excess" in answer
    assert "this week" not in answer
    _assert_no_internal_terms(answer)


def test_rain_forecast_tomorrow_query():
    answer = _render("Will it rain in Bathinda tomorrow?", WEATHER_TOMORROW)
    assert "**Tomorrow, 1 October:** ⛅ No rain in the forecast (Partly cloudy)" in answer


def _rainfall_payload(results: dict) -> dict:
    return {
        "resolved_location": "Bathinda, Bathinda Tahsil, Bathinda",
        "district": "Bathinda",
        "summary": "Rainfall Forecast for Bathinda ...",
        "results": {**results, "data_source": IMD},
        "data_source": IMD,
        "nearest_station_info": STATION_INFO,
    }


def test_rain_forecast_uses_tool_likelihood_text():
    payload = _rainfall_payload({
        "timeframe": "next_3_days_forecast",
        "rainfall_forecast_list": [
            {"day": 1, "date": "2026-09-30", "observed_past_24hrs_rainfall_mm": "0.0", "forecast": "Mainly Clear sky",
             "rain_likelihood": "☀️ No rain expected — Dry conditions likely — no significant rainfall expected.",
             "_raw_distribution": "Dry"},
            {"day": 2, "date": "2026-10-01", "forecast": "Partly cloudy sky with possibility of rain",
             "rain_likelihood": "🌦️ Good chance of rain — Rain expected across many places in the area.",
             "_raw_distribution": "Fairly Widespread"},
        ],
        "observed_past_24hrs_rainfall_mm": "0.0",
    })
    answer = _render("Will it rain in Bathinda in the next 3 days?", payload)
    assert "- **Today, 30 Sep:** ☀️ No rain expected — Dry conditions likely" in answer
    assert "0.0 mm" not in answer  # a zero reading is not mentioned next to a forecast
    assert "- **Tomorrow, 1 Oct:** 🌦️ Good chance of rain — Rain expected across many places in the area." in answer


def test_rain_likelihood_from_placeholder_is_ignored():
    payload = _rainfall_payload({
        "timeframe": "today_current_rainfall",
        "today_rainfall": {
            "date": "2026-09-30",
            "observed_past_24hrs_rainfall": "0.0",
            "district_daily_actual_mm": "N/A",
            "forecast": "Rainfall Expected",
            "rain_likelihood": "🌦️ Rain possible — Some rainfall expected in the area.",
            "_raw_distribution": None,
        },
    })
    answer = _render("Rain in Bathinda today?", payload)
    assert "Rain possible" not in answer
    assert "☀️ **No rain recorded in the last 24 hours** (0.0 mm)" in answer


def test_rainfall_history_unavailable_shows_last_24_hours():
    payload = _rainfall_payload({
        "timeframe": "date_range (2026-09-23 to 2026-09-29)",
        "rainfall_range": [],
        "notice": "Rainfall history beyond the past 24 hours is not available for Bathinda. We can only provide the most recent past 24 hours recorded rainfall. Past 24 hours recorded rainfall: 4.2 mm.",
        "observed_past_24hrs_rainfall_mm": "4.2",
    })
    answer = _render("How much rain fell in Bathinda last week?", payload)
    assert "ℹ️ Past weather records are not available for this place. Showing the rain recorded in the last 24 hours." in answer
    assert "🌧️ **Rain recorded in the last 24 hours: 4.2 mm**" in answer


def test_past_date_without_records_is_a_notice_only_answer():
    payload = _weather_target("2026-09-10", {
        "requested_target_date": "2026-09-10",
        "notice": "Notice: Historical weather data for requested date (2026-09-10) is not available in station records for Bathinda (historical records available up to 7 days from Annam AWS; IMD does not provide historical station archives).",
    })
    payload["imd_current_weather"] = {"success": True, "distance_km": 11.0, "station": LIVE_AWS["station"]}
    answer = _render("Weather in Bathinda on 10 September?", payload)
    assert "ℹ️ Past weather records for 10 September are not available for this place." in answer
    assert "30.2" not in answer  # today's live reading is not passed off as 10 September
    assert "7 days ahead" not in answer


def test_temperature_without_station_within_50km():
    payload = copy.deepcopy(TEMPERATURE_TODAY)
    payload.pop("nearest_live_aws_station")
    payload["summary"] = "Notice: No active IMD weather station found within 50.0 km radius search range of Bathinda."
    payload["nearest_station_info"] = {"nearest_station_name": None, "distance_from_requested_place_km": None}
    answer = _render("What is the temperature in Bathinda?", payload)
    assert "ℹ️ There is no active weather station within 50 km of this place" in answer
    assert "**Today, 30 September**\n- Minimum: **22.7°C**\n- Maximum: **36.6°C**" in answer
    assert "Weather station" not in answer


def test_closer_station_is_used_for_live_readings():
    payload = copy.deepcopy(TEMPERATURE_TODAY)
    payload["imd_current_weather"] = {
        "success": True, "distance_km": 24.5,
        "station": {"name": "Faridkot", "temperature_c": 31.9, "feel_like_c": 34.0, "humidity_pct": 50},
    }
    answer = _render("What is the temperature in Bathinda?", payload)
    assert "**Current temperature: 30.2°C**" in answer  # AWS at 11 km beats IMD at 24.5 km
    assert answer.endswith("Weather station: Bhatinda AMFU, approximately 11 km away.")


def test_alerts_all_green_is_one_line():
    payload = {
        "resolved_location": "Bathinda, Bathinda Tahsil, Bathinda",
        "district": "Bathinda",
        "summary": "IMD Weather Alert for Bathinda: ...",
        "district_5day_warnings": [
            {"day": f"Day {n}", "warning_codes": "1", "warning_description": "No Warning", "severity": "Green (No Warning)"}
            for n in range(1, 6)
        ],
        "data_source": IMD,
        "nearest_station_info": STATION_INFO,
    }
    answer = _render("Any weather alert for Bathinda?", payload)
    assert "✅ **No IMD weather warnings for the next 5 days.**" in answer
    assert "Weather station" not in answer

    payload["district_5day_warnings"][1] = {
        "day": "Day 2", "warning_codes": "2", "warning_description": "Heavy Rain", "severity": "Orange (Be Prepared)",
    }
    answer = _render("Any weather alert for Bathinda?", payload)
    assert "- **Tomorrow, 1 Oct:** 🟠 Orange alert (be prepared) — Heavy Rain" in answer
    assert "- **Today, 30 Sep:** 🟢 No warning" in answer


def _nowcast(summary: str, severity: str, warnings: list, message: str) -> dict:
    return {
        "resolved_location": "Bathinda, Bathinda Tahsil, Bathinda",
        "summary": summary,
        "hours_ahead": 3,
        "overall_severity": severity,
        "nowcast_message": message,
        "valid_upto": "1530",
        "active_warnings": warnings,
        "raw_record": {"color": "1"},
        "data_source": IMD,
        "nearest_station_info": STATION_INFO,
    }


def test_nowcast_without_warning():
    payload = _nowcast(
        "☀️ No rain or storm warnings in the next 0-3 hours for your area. "
        "Current conditions in Bathinda: Clear Sky | Temperature: 35.8°C | Humidity: 37%.",
        "Green (No Warning)", [], "No active severe convective warnings for this station.",
    )
    payload["nearest_station_info"] = {
        **STATION_INFO,
        "station_details": {"name": "BHATINDA_AMFU", **LIVE_AWS["station"]},
    }
    answer = _render("Weather in next 3 hours in Bathinda", payload)
    assert "✅ **No severe weather expected in the next 3 hours.**" in answer
    # Live readings come from the station within 50 km, not the summary (whose station distance is unknown).
    assert "- 🌡️ Temperature: **30.2°C**" in answer and "35.8" not in answer
    assert "- 💧 Humidity: **56%**" in answer
    assert "- ☀️ Condition: **Clear**" in answer
    assert "convective" not in answer and "1530" not in answer


def test_far_away_station_reading_is_not_shown_as_local():
    payload = copy.deepcopy(WEATHER_TODAY)
    payload["imd_current_weather"] = {
        "success": True, "distance_km": 103.86,
        "station": {"name": "Sriganganagar", "temperature_c": "35.8", "feel_like_c": "37.8", "humidity_pct": "37",
                    "weather_description": "Clear Sky"},
    }
    payload["nearest_station_info"] = {
        **STATION_INFO,
        "distance_from_requested_place_km": 2.61,
        "station_details": {"name": "BHATINDA_AMFU", "temperature_c": "31.7", "feel_like_c": "34.3", "humidity_pct": "52",
                            "weather_message": "Clear Sky"},
    }
    answer = _render("How is the weather in Bathinda today?", payload)
    assert "- 🌡️ Temperature: **31.7°C**" in answer
    assert "35.8" not in answer and "Sriganganagar" not in answer
    assert answer.endswith("Weather station: Bhatinda AMFU, approximately 2.61 km away.")

    payload["nearest_station_info"]["station_details"] = {"name": "BHATINDA_AMFU"}  # no reading nearby
    answer = _render("How is the weather in Bathinda today?", payload)
    assert "35.8" not in answer and "Feels like" not in answer
    assert "- 🌡️ Today's range: **22.7°C – 36.6°C**" in answer


def test_nowcast_with_warning():
    payload = _nowcast(
        "⚡ Thunderstorm warning in the next 0-3 hours! Avoid open fields. Warning for Bathinda (next 3 hours): Thunderstorm & Lightning.",
        "Orange (Moderate-Severe Warning)",
        [{"category_code": "6", "category_description": "Thunderstorm & Lightning", "category_key": "Cat6"}],
        "Thunderstorm with lightning likely at isolated places.",
    )
    answer = _render("Will there be a storm in Bathinda in next 2 hours?", payload)
    assert "🟠 **Orange alert for the next 3 hours** (moderate-severe warning)" in answer
    assert "- Expected: **Thunderstorm & Lightning**" in answer
    assert "- Thunderstorm with lightning likely at isolated places." in answer
    assert "- Valid until: 1530" in answer


def test_state_alerts_list_only_districts_with_warnings():
    payload = {
        "resolved_location": "Punjab, India",
        "summary": "IMD State Weather Alert Summary for PUNJAB: 1 out of 3 districts under active weather alerts today.",
        "total_districts_in_state": 3,
        "districts_under_alert_count": 1,
        "district_alerts_list": [
            {"district": "Ludhiana", "warning_codes": "1", "warning_description": "No Warning", "severity": "Green (No Warning)", "is_active_alert": False},
            {"district": "Bathinda", "warning_codes": "3", "warning_description": "Thunderstorm & Lightning", "severity": "Yellow (Be Updated)", "is_active_alert": True},
            {"district": "Amritsar", "warning_codes": "1", "warning_description": "No Warning", "severity": "Green (No Warning)", "is_active_alert": False},
        ],
        "data_source": IMD,
    }
    answer = _render("Any weather alerts in Punjab?", payload)
    assert answer.startswith("📍 **Punjab**\n\n⚠️ **1 of 3 districts have weather warnings today**")
    assert "- **Bathinda:** 🟡 Yellow alert (be updated) — Thunderstorm & Lightning" in answer
    assert "Ludhiana" not in answer


def test_state_query_shows_state_and_central_location():
    payload = copy.deepcopy(WEATHER_TODAY)
    payload["resolved_location"] = "Punjab (Central Observation Location: Ludhiana, Ludhiana East Tahsil, Ludhiana, Punjab, India)"
    answer = _render("How is the weather in Punjab today?", payload)
    assert answer.startswith("📍 **Punjab**\n\nℹ️ Punjab is a large area — showing weather for Ludhiana.")


def test_beyond_seven_days_notice_is_plain_language():
    payload = _weather_target("2026-10-20", {
        "requested_target_date": "2026-10-20",
        "notice": "Official IMD deterministic daily forecasts extend up to 7 days (2026-09-30 to 2026-10-06). Daily forecasts for 2026-10-20 (beyond 7 days) cannot be deterministically modeled by IMD.",
        "available_7day_forecast_trend": WEATHER_RANGE["weather_data"]["forecast_list"],
    })
    answer = _render("Weather in Bathinda on 20 October", payload)
    assert "ℹ️ IMD gives daily forecasts only up to 7 days ahead." in answer
    assert "deterministic" not in answer
    assert "- **Fri, 2 Oct:**" in answer


def test_village_keeps_district_and_drops_admin_names():
    payload = copy.deepcopy(TEMPERATURE_TODAY)
    payload["resolved_location"] = "Rampura Phul, Rampura Phul Tahsil, Bathinda, Punjab, India"
    assert _render("temperature", payload).startswith("📍 **Rampura Phul, Bathinda**")


def test_unknown_or_failed_payloads_return_empty():
    assert _render("weather", {"success": False, "error": "boom"}) == ""
    assert _render("weather", {"foo": "bar"}) == ""
    assert _render("weather", {"resolved_location": "X", "weather_data": {"today_weather": {}}}) == ""


def test_natural_condition_rewrites():
    assert natural_condition("Clear Sky") == "Clear"
    assert natural_condition("Mainly Clear sky") == "Mostly clear"
    assert natural_condition("Partly Cloudy") == "Partly cloudy"
    assert natural_condition("Overcast") == "Cloudy"
    assert natural_condition("Normal weather") is None
    assert natural_condition("N/A") is None


def test_question_focus_uses_word_starts():
    assert question_focus("price of grain") == set()
    assert question_focus("will it rain") == {"rain"}
    assert "farming" in question_focus("good for sowing wheat?")
