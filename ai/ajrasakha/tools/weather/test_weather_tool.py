import pytest

from .weather_tool import weather_information_tool

LAT = 18.5204
LON = 73.8567


@pytest.mark.asyncio
async def test_weather_returns_today_and_forecast():
    result = await weather_information_tool.ainvoke({"latitude": LAT, "longitude": LON})

    assert "today" in result
    assert "forecast" in result

    assert isinstance(result["forecast"], list)
    assert len(result["forecast"]) >= 1

    print("Result:", result)


@pytest.mark.asyncio
async def test_today_weather_structure():
    result = await weather_information_tool.ainvoke({"latitude": LAT, "longitude": LON})

    today = result["today"]

    assert "date" in today
    assert "temperature" in today
    assert "condition" in today
    assert "description" in today

    print("Result:", result)


@pytest.mark.asyncio
async def test_forecast_structure():
    result = await weather_information_tool.ainvoke({"latitude": LAT, "longitude": LON})

    for day in result["forecast"]:
        assert "date" in day
        assert "min_temp" in day
        assert "max_temp" in day
        assert "condition" in day
        assert "description" in day

    print("Result:", result)


@pytest.mark.asyncio
async def test_invalid_coordinates():
    result = await weather_information_tool.ainvoke({"latitude": 999, "longitude": 999})

    # Since we added error handling, check for error in response
    assert "status" in result
    assert result["status"] == "error"
    assert "error" in result
