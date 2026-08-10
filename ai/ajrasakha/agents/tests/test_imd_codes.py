"""Tests for IMD code → description lookups."""

from ajrasakha.tools.weather.imd_codes import (
    describe_current_weather,
    describe_district_warning_color,
    describe_district_warnings,
    describe_nowcast_category,
    describe_rainfall_category,
    describe_wind_direction,
    enrich_rainfall_record,
    enrich_station_fields,
    enrich_warning_record,
    format_day_warning_line,
)


def test_district_warning_codes():
    assert describe_district_warnings("1") == "No Warning"
    assert describe_district_warnings(4) == "Thunderstorm & Lightning, Squall etc"
    assert describe_district_warnings("4,8") == (
        "Thunderstorm & Lightning, Squall etc; Strong Surface Winds"
    )
    assert describe_district_warnings("NO_WARNING") == "No Warning"


def test_district_warning_colors_match_imd_reference():
    assert "🔴" in describe_district_warning_color(1)
    assert "Red" in describe_district_warning_color(1)
    assert "🟠" in describe_district_warning_color("2")
    assert "Yellow" in describe_district_warning_color(3)
    assert "🟢" in describe_district_warning_color(4)
    assert "Yellow" in describe_district_warning_color("Yellow")


def test_nowcast_categories():
    assert "Light rain" in describe_nowcast_category(2)
    assert "Cat12" in describe_nowcast_category("Cat12")
    assert "Heavy rain" in describe_nowcast_category(12)
    assert "Cat16" in describe_nowcast_category(30)
    assert "Thunderstorms with Hail" in describe_nowcast_category(31)


def test_rainfall_categories():
    assert describe_rainfall_category("LE") == "Large Excess (60% or more)"
    assert describe_rainfall_category("n") == "Normal (-19% to 19%)"
    assert describe_rainfall_category("Normal") == "Normal"


def test_wind_direction():
    assert describe_wind_direction(0) == "Calm"
    assert describe_wind_direction(270) == "Westerly"
    assert describe_wind_direction(360) == "Northerly"
    assert describe_wind_direction(275) == "Westerly"


def test_current_weather_codes():
    assert "Haze" in describe_current_weather(5)
    assert "Haze" in describe_current_weather("05")
    assert describe_current_weather("Cloudy Sky") == "Cloudy Sky"


def test_format_day_warning_line():
    line = format_day_warning_line(1, "4", "2")
    assert "Day 1" in line
    assert "Thunderstorm" in line
    assert "🟠" in line
    assert "Orange alert" in line
    assert "Warning code: 4" in line
    assert "Color code: 2" in line


def test_enrich_warning_record():
    rec = enrich_warning_record({"day1_warning": "4", "day1_color": "2"})
    assert rec["day1_warning"].startswith("Thunderstorm")
    assert rec["day1_warning_code"] == "4"
    assert "Orange" in rec["day1_color"]
    assert "🟠" in rec["day1_color"]
    assert rec["day1_color_code"] == "2"
    assert rec["warnings_readable"][0]["day"] == 1
    assert "Warning code: 4" in rec["warnings_readable"][0]["summary"]
    assert "Color code: 2" in rec["warnings_readable"][0]["summary"]
    assert "🟠 Orange alert" in rec["warnings_readable"][0]["summary"]


def test_enrich_warning_record_imd_day_underscore_keys():
    """Live IMD API uses Day_1 + Day1_Color (not day1_warning)."""
    rec = enrich_warning_record(
        {
            "Day_1": "2,4",
            "Day1_Color": "3",
            "Day_2": "4",
            "Day2_Color": "3",
            "District": "KAMRUP",
        }
    )
    assert "Heavy Rain" in rec["Day_1"]
    assert "Thunderstorm" in rec["Day_1"]
    assert rec["Day_1_code"] == "2,4"
    assert "Yellow" in rec["Day1_Color"]
    assert "🟡" in rec["Day1_Color"]
    assert rec["Day1_Color_code"] == "3"
    assert len(rec["warnings_readable"]) == 2
    day1 = rec["warnings_readable"][0]
    assert day1["warning_code"] == "2,4"
    assert day1["color_code"] == "3"
    assert "Warning code: 2,4" in day1["summary"]
    assert "🟡 Yellow alert" in day1["summary"]
    assert "Color code: 3" in day1["summary"]


def test_enrich_station_and_rainfall():
    station = enrich_station_fields(
        {"wind_direction_deg": 90, "weather_message": "05"}
    )
    assert station["wind_direction"] == "Easterly"
    assert "Haze" in station["weather_message"]
    assert station["weather_code_raw"] == "05"

    rain = enrich_rainfall_record({"Status": "E"})
    assert rain["Status_code"] == "E"
    assert "Excess" in rain["Status"]
    assert "Excess" in rain["rainfall_category"]


def test_enrich_rainfall_daily_weekly_category_keys():
    """IMD district rainfall uses 'Daily Category', 'Weekly Category', etc."""
    rain = enrich_rainfall_record(
        {
            "Daily Category": "LE",
            "Weekly Category": "LE",
            "Cumulative Category": "E",
            "Monthly Category": "LD",
            "Daily Actual": "25.90",
        }
    )
    assert rain["Daily Category"] == "Large Excess (60% or more)"
    assert rain["Daily Category_code"] == "LE"
    assert rain["Weekly Category"] == "Large Excess (60% or more)"
    assert "Excess (20% to 59%)" in rain["Cumulative Category"]
    assert "Large Deficient" in rain["Monthly Category"]
    assert rain["Daily Actual"] == "25.90"
