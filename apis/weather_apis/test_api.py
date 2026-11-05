"""
Automated Integration & Unit Tests for Ajrasakha Live Weather API
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

# Add current folder to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import app, cache_manager, calculate_apparent_temperature, haversine_km

client = TestClient(app)


def test_calculate_apparent_temperature():
    """Verify apparent temperature calculations across conditions."""
    # 30°C, 70% humidity, calm wind -> feels hotter (~36°C)
    at_hot_humid = calculate_apparent_temperature(30.0, 70.0, 5.0)
    assert 34.0 <= at_hot_humid <= 38.0

    # 20°C, 40% humidity, 15 km/h wind -> feels cooler (~18°C)
    at_cool_windy = calculate_apparent_temperature(20.0, 40.0, 15.0)
    assert 15.0 <= at_cool_windy <= 21.0


def test_haversine_km():
    """Verify distance calculation between Hyderabad and Secunderabad (~8km)."""
    d = haversine_km(17.3850, 78.4867, 17.4470, 78.4736)
    assert 6.0 <= d <= 8.5


def test_health_check():
    """Verify /health endpoint returns healthy status and metadata."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "cache" in data
    assert "upstream" in data


def test_validation_missing_longitude():
    """Verify 400 when longitude is omitted."""
    resp = client.get("/live?lat=17.3850")
    assert resp.status_code == 400
    assert "Longitude parameter is required" in resp.json()["message"]


def test_validation_invalid_latitude():
    """Verify 422 when latitude is out of bounds."""
    resp = client.get("/live?lat=150.0&lon=78.4867")
    assert resp.status_code == 422
    assert resp.json()["status"] == "error"


def test_live_weather_annam_priority_hyderabad():
    """
    Hyderabad coordinates (17.3850, 78.4867):
    Within ~7km of Annam sensor.
    Should use Annam for temperature/humidity/rainfall/wind, and IMD for feels-like and condition.
    """
    cache_manager.clear()
    resp = client.get("/live?lat=17.3850&lon=78.4867")
    assert resp.status_code == 200
    data = resp.json()

    # Required keys in single live endpoint
    expected_keys = {
        "liveTemperature",
        "humidity",
        "rainfall",
        "windSpeed",
        "weatherCondition",
        "feelsLikeTemperature",
        "source",
        "station_name",
        "station_distance_km",
        "recorded_at",
    }
    assert set(data.keys()) == expected_keys

    # Data type assertions
    assert isinstance(data["liveTemperature"], (int, float))
    assert isinstance(data["humidity"], (int, float))
    assert isinstance(data["rainfall"], (int, float))
    assert isinstance(data["windSpeed"], (int, float))
    assert isinstance(data["weatherCondition"], str)
    assert isinstance(data["feelsLikeTemperature"], (int, float))
    assert data["source"] in ("aws+imd", "imd")
    assert "IST" in data["recorded_at"]
    print("\n[TEST] Hyderabad live response:", data)


def test_live_weather_imd_fallback_delhi():
    """
    Delhi coordinates (28.6139, 77.2090):
    No Annam sensors within 10km. Should fall back completely to IMD.
    """
    cache_manager.clear()
    resp = client.get("/live?lat=28.6139&long=77.2090")
    assert resp.status_code == 200
    data = resp.json()

    expected_keys = {
        "liveTemperature",
        "humidity",
        "rainfall",
        "windSpeed",
        "weatherCondition",
        "feelsLikeTemperature",
        "source",
        "station_name",
        "station_distance_km",
        "recorded_at",
    }
    assert set(data.keys()) == expected_keys
    assert data["source"] == "imd"
    assert "IST" in data["recorded_at"]
    print("\n[TEST] Delhi IMD fallback response:", data)


def test_hot_cache_hit():
    """Verify that a second request to the same coordinates hits the hot cache and includes Cache-Control & ETag."""
    # First call
    resp1 = client.get("/live?lat=17.3850&lon=78.4867")
    assert resp1.status_code == 200
    assert "Cache-Control" in resp1.headers
    assert "ETag" in resp1.headers

    # Second call
    resp2 = client.get("/live?lat=17.3850&lon=78.4867")
    assert resp2.status_code == 200
    assert resp2.headers.get("ETag") == resp1.headers.get("ETag")


def test_conditional_get_304_not_modified():
    """Verify that passing If-None-Match with matching ETag returns 304 Not Modified with empty body."""
    resp1 = client.get("/live?lat=17.3850&lon=78.4867")
    assert resp1.status_code == 200
    etag = resp1.headers.get("ETag")
    assert etag is not None

    # Conditional GET
    resp2 = client.get("/live?lat=17.3850&lon=78.4867", headers={"If-None-Match": etag})
    assert resp2.status_code == 304
    assert resp2.headers.get("ETag") == etag


def test_validation_out_of_bounds_india():
    """Verify that coordinates outside mainland India return 400 Bad Request."""
    resp = client.get("/live?lat=0.0&lon=0.0")
    assert resp.status_code == 400
    assert "outside India" in resp.json()["message"]


def test_stale_fallback_cache_when_apis_down():
    """
    Simulate upstream APIs going down (both Annam and IMD raise exceptions).
    Verify system returns the cached observation instead of failing.
    """
    test_lat, test_lon = 19.0760, 72.8777  # Mumbai coordinates

    # 1. Prime cache with successful record
    cache_manager.put(
        test_lat,
        test_lon,
        {
            "liveTemperature": 30.5,
            "humidity": 75.0,
            "rainfall": 1.2,
            "windSpeed": 14.0,
            "weatherCondition": "Scattered Clouds",
            "feelsLikeTemperature": 35.0,
            "source": "mock_primed",
            "station_name": "Mumbai Santacruz",
            "station_distance_km": 4.2,
            "recorded_at": "05 Nov 2026, 01:00 PM IST",
        },
    )

    # Clear hot cache so it doesn't take the hot TTL route
    with cache_manager._lock:
        cache_manager._hot_cache.clear()

    # 2. Mock network calls to fail completely
    with patch("main.weather_client.fetch_annam_ws", return_value=None), \
         patch("main.weather_client.fetch_imd_wx", return_value=None):

        resp = client.get(f"/live?lat={test_lat}&lon={test_lon}")
        assert resp.status_code == 200
        data = resp.json()

        assert data["liveTemperature"] == 30.5
        assert data["humidity"] == 75.0
        assert data["weatherCondition"] == "Scattered Clouds"
        assert data["source"] == "stale_fallback"
        print("\n[TEST] Successfully recovered from API outage using stale fallback cache:", data)


if __name__ == "__main__":
    pytest.main(["-v", str(Path(__file__).resolve())])

