import pytest
from .weather_tool import weather_information_tool

LAT = 18.5204
LON = 73.8567


def test_weather_returns_today_and_forecast():
    result = weather_information_tool(LAT, LON)

    assert "today" in result
    assert "forecast" in result

    assert isinstance(result["forecast"], list)
    assert len(result["forecast"]) >= 1

    print("Result:", result)


def test_today_weather_structure():
    result = weather_information_tool(LAT, LON)

    today = result["today"]

    assert "date" in today
    assert "temperature" in today
    assert "condition" in today
    assert "description" in today

    print("Result:", result)


def test_forecast_structure():
    result = weather_information_tool(LAT, LON)

    for day in result["forecast"]:
        assert "date" in day
        assert "min_temp" in day
        assert "max_temp" in day
        assert "condition" in day
        assert "description" in day

    print("Result:", result)


def test_invalid_coordinates():
    with pytest.raises(Exception):
        weather_information_tool(999, 999)
