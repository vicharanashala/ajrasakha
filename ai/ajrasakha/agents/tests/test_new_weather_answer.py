import pytest

from ajrasakha.agents.new_weather_agent import (
    _weather_answer_preserves_facts,
    build_full_weather_answer,
    synthesize_weather_answer,
)


GAUHATI_NOWCAST_PAYLOAD = {
    "resolved_location": "Gauhati, Guwahati, Kamrup Metropolitan, Assam, 781015, India",
    "district": "Guwahati",
    "summary": (
        "Nowcast Update (Next 3 Hours for Gauhati): Current station weather is 'Mist' (code 10). "
        "Temp: 32°C, Humidity: 84%, Wind: 30. No severe short-term warnings. Severity: Green (No Warning)."
    ),
    "severity_color": "Green (No Warning)",
    "active_nowcast_categories": [{"category_code": "1", "category_description": "No Weather"}],
    "data_source": "India Meteorological Department (IMD)",
    "nearest_live_aws_station": {
        "success": True,
        "distance_km": 3.56,
        "station": {
            "name": "GAUHATI_UNIVERSITY",
            "date": "2026-08-12",
            "time": "07:45:00",
            "temperature_c": "32.0",
            "feel_like_c": "53.6",
            "humidity_pct": "99",
            "wind_speed_kmph": 5.6,
            "weather_message": "Clear Sky",
            "weather_description": "Clear Sky",
        },
    },
    "imd_current_weather": {
        "success": True,
        "distance_km": 12.87,
        "station": {
            "name": "Guwahati-Airport",
            "date": "2026-08-12",
            "time": "7",
            "temperature_c": "32",
            "feel_like_c": "46.1",
            "humidity_pct": "84",
            "wind_speed_kmph": "14.8",
            "past_24hrs_rainfall_mm": "0",
            "weather_message": "Mist",
            "weather_description": "Mist",
            "sunrise": "04:54",
            "sunset": "18:02",
        },
    },
    "nearest_station_info": {
        "nearest_station_name": "GAUHATI_UNIVERSITY",
        "distance_from_requested_place_km": 3.56,
        "nearest_station_note": "Nearest active IMD station GAUHATI_UNIVERSITY located 3.6 km from Gauhati.",
    },
}


def test_build_full_weather_answer_includes_imd_and_aws_stations():
    answer = build_full_weather_answer(GAUHATI_NOWCAST_PAYLOAD)
    assert "Guwahati-Airport" in answer
    assert "GAUHATI_UNIVERSITY" in answer
    assert "32" in answer
    assert "Feels like" in answer
    assert "Nearest station info" in answer


def test_weather_answer_preserves_facts_rejects_short_summary():
    full = build_full_weather_answer(GAUHATI_NOWCAST_PAYLOAD)
    short = (
        "Weather information for Gauhati.\n"
        "- Temperature is 32°C.\n"
        "- Humidity is 84%.\n"
    )
    assert not _weather_answer_preserves_facts(full, short)


def test_weather_answer_preserves_facts_accepts_complete_brief():
    full = build_full_weather_answer(GAUHATI_NOWCAST_PAYLOAD)
    assert _weather_answer_preserves_facts(full, full)


@pytest.mark.asyncio
async def test_synthesize_weather_answer_falls_back_to_full_formatter(monkeypatch):
    async def _fake_gemma(**_kwargs):
        return "- Temperature is 32°C.\n- Humidity is 84%."

    monkeypatch.setattr(
        "ajrasakha.agents.new_weather_agent._gemma_weather_chat",
        _fake_gemma,
    )
    answer = await synthesize_weather_answer(
        "what is the right now weather in Gauhati",
        GAUHATI_NOWCAST_PAYLOAD,
    )
    assert "Guwahati-Airport" in answer
    assert "GAUHATI_UNIVERSITY" in answer
    assert "Feels like" in answer
