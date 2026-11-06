"""
Automated Integration & Unit Tests for Ajrasakha Live Weather API
"""

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

# Tests must never touch the real persistent cache file: point it at a throw-away dir BEFORE importing main.
os.environ["WEATHER_CACHE_DIR"] = tempfile.mkdtemp(prefix="weather_test_cache_")

import pytest
from fastapi.testclient import TestClient

# Add current folder to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import app, cache_manager, calculate_apparent_temperature, haversine_km

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_state():
    """Hot cache entries and circuit-breaker timers must not leak between tests."""
    import main as m
    m.cache_manager._hot_cache.clear()
    m.weather_client._annam_retry_after = 0.0
    m.weather_client._imd_coords_retry_after = 0.0
    m.weather_client._imd_wx_retry_after = 0.0
    m._forecast_retry_after = 0.0
    yield


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
    """Verify 422 when longitude is omitted (lat and lon are both required)."""
    resp = client.get("/weather-live?lat=17.3850")
    assert resp.status_code == 422
    assert resp.json()["status"] == "error"


def test_validation_invalid_latitude():
    """Verify 422 when latitude is out of bounds."""
    resp = client.get("/weather-live?lat=150.0&lon=78.4867")
    assert resp.status_code == 422
    assert resp.json()["status"] == "error"


def test_live_weather_annam_priority_hyderabad():
    """
    Hyderabad coordinates (17.3850, 78.4867):
    Within ~7km of Annam sensor.
    Should use Annam for temperature/humidity/rainfall/wind, and IMD for feels-like and condition.
    """
    cache_manager.clear()
    resp = client.get("/weather-live?lat=17.3850&lon=78.4867")
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
    assert data["source"] in ("aws", "aws+imd", "imd")  # "aws" = Annam only (no IMD station within 10 km / IMD down)
    assert "IST" in data["recorded_at"]
    print("\n[TEST] Hyderabad live response:", data)


def test_live_weather_imd_fallback_delhi():
    """
    Delhi coordinates (28.6139, 77.2090):
    No Annam sensors within 10km. Should fall back completely to IMD.
    """
    cache_manager.clear()
    resp = client.get("/weather-live?lat=28.6139&lon=77.2090")
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
    resp1 = client.get("/weather-live?lat=17.3850&lon=78.4867")
    assert resp1.status_code == 200
    assert "Cache-Control" in resp1.headers
    assert "ETag" in resp1.headers

    # Second call
    resp2 = client.get("/weather-live?lat=17.3850&lon=78.4867")
    assert resp2.status_code == 200
    assert resp2.headers.get("ETag") == resp1.headers.get("ETag")


def test_conditional_get_304_not_modified():
    """Verify that passing If-None-Match with matching ETag returns 304 Not Modified with empty body."""
    resp1 = client.get("/weather-live?lat=17.3850&lon=78.4867")
    assert resp1.status_code == 200
    etag = resp1.headers.get("ETag")
    assert etag is not None

    # Conditional GET
    resp2 = client.get("/weather-live?lat=17.3850&lon=78.4867", headers={"If-None-Match": etag})
    assert resp2.status_code == 304
    assert resp2.headers.get("ETag") == etag


def test_validation_out_of_bounds_india():
    """Verify that coordinates outside mainland India return 400 Bad Request."""
    resp = client.get("/weather-live?lat=0.0&lon=0.0")
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

        resp = client.get(f"/weather-live?lat={test_lat}&lon={test_lon}")
        assert resp.status_code == 200
        data = resp.json()

        assert data["liveTemperature"] == 30.5
        assert data["humidity"] == 75.0
        assert data["weatherCondition"] == "Scattered Clouds"
        assert data["source"] == "stale_fallback"
        print("\n[TEST] Successfully recovered from API outage using stale fallback cache:", data)


if __name__ == "__main__":
    pytest.main(["-v", str(Path(__file__).resolve())])



# -----------------------------------------------------------------------------
# 7-day forecast (/weather-forecast)
# -----------------------------------------------------------------------------
import main as main_module
from datetime import datetime, timezone, timedelta

_IST_TZ = timezone(timedelta(hours=5, minutes=30))


def _forecast_row(code="1", lat="17.45", lon="78.47", days=7, **over):
    today = datetime.now(timezone.utc).astimezone(_IST_TZ).date().isoformat()
    row = {
        "Date": today, "Station_Code": code, "Station_Name": f"Station {code}",
        "Latitude": lat, "Longitude": lon, "Sunrise_time": "06:16", "Sunset_time": "17:43",
        "Todays_Forecast_Max_Temp": "32.0", "Todays_Forecast_Min_temp": "23.0",
        "Todays_Forecast": "Partly cloudy sky with possibility of rain or Thunderstorm",
    }
    for i in range(2, 8):
        has = i <= days
        row[f"Day_{i}_Max_Temp"] = "33.0" if has else None
        row[f"Day_{i}_Min_temp"] = "22.0" if has else None
        row[f"Day_{i}_Forecast"] = "Partly cloudy sky with haze" if has else None
    row.update(over)
    return row


def _with_rows(rows, fresh=True):
    return patch.object(main_module, "_fetch_imd_forecast_rows", return_value=(rows, fresh))


def test_forecast_requires_lat_and_lon():
    assert client.get("/weather-forecast?lat=17.385").status_code == 422
    assert client.get("/weather-forecast?lon=78.48").status_code == 422


def test_forecast_outside_india_400():
    resp = client.get("/weather-forecast?lat=0.0&lon=0.0")
    assert resp.status_code == 400
    assert "outside India" in resp.json()["message"]


def test_forecast_full_seven_days():
    with _with_rows([_forecast_row()]):
        resp = client.get("/weather-forecast?lat=17.385&lon=78.4867")
    assert resp.status_code == 200
    body = resp.json()
    assert body["days_available"] == 7 and len(body["forecast"]) == 7
    assert body["warnings"] == []
    d0 = body["forecast"][0]
    assert (d0["minTemperature"], d0["maxTemperature"]) == (23.0, 32.0)
    assert d0["conditionCode"] == "partly_cloudy" and d0["rainPossible"] is True
    assert d0["sunrise"] == "06:16" and body["forecast"][1]["sunrise"] is None
    assert body["forecast"][1]["conditionCode"] == "haze"


def test_forecast_partial_six_days_warns():
    with _with_rows([_forecast_row(days=6)]):
        body = client.get("/weather-forecast?lat=17.385&lon=78.4867").json()
    assert body["days_available"] == 6
    assert "partial_forecast:6_of_7_days" in body["warnings"]


def test_forecast_skips_station_without_data_and_uses_next():
    empty = _forecast_row(code="1", lat="17.385", lon="78.4867",
                          Todays_Forecast_Max_Temp=None, Todays_Forecast_Min_temp=None, Todays_Forecast=None, days=1)
    for i in range(2, 8):
        empty[f"Day_{i}_Forecast"] = None
    good = _forecast_row(code="2", lat="17.43", lon="78.49")
    with _with_rows([empty, good]):
        body = client.get("/weather-forecast?lat=17.385&lon=78.4867").json()
    assert body["station_name"] == "Station 2"


def test_forecast_bad_values_cleaned():
    row = _forecast_row(Todays_Forecast_Max_Temp="20.0", Todays_Forecast_Min_temp="30.0", Day_2_Max_Temp="999")
    with _with_rows([row]):
        body = client.get("/weather-forecast?lat=17.385&lon=78.4867").json()
    assert (body["forecast"][0]["minTemperature"], body["forecast"][0]["maxTemperature"]) == (20.0, 30.0)
    assert body["forecast"][1]["maxTemperature"] is None


def test_forecast_too_far_returns_404():
    with _with_rows([_forecast_row(lat="28.6", lon="77.2")]):  # Delhi row, Hyderabad request
        resp = client.get("/weather-forecast?lat=17.385&lon=78.4867")
    assert resp.status_code == 404


def test_forecast_upstream_down_no_cache_503():
    main_module._forecast_result_cache.clear()
    with _with_rows([], fresh=False):
        resp = client.get("/weather-forecast?lat=17.385&lon=78.4867")
    assert resp.status_code == 503


def test_forecast_upstream_down_serves_stale():
    main_module._forecast_result_cache.clear()
    with _with_rows([_forecast_row()]):
        client.get("/weather-forecast?lat=17.385&lon=78.4867")
    with _with_rows([], fresh=False):
        body = client.get("/weather-forecast?lat=17.385&lon=78.4867").json()
    assert body["is_cached"] is True and "served_from_stale_cache" in body["warnings"]


def test_forecast_stale_issue_date_warns():
    old = (datetime.now(timezone.utc).astimezone(_IST_TZ).date() - timedelta(days=2)).isoformat()
    with _with_rows([_forecast_row(Date=old)]):
        body = client.get("/weather-forecast?lat=17.385&lon=78.4867").json()
    assert "stale_upstream" in body["warnings"]


def test_classify_condition():
    c = main_module.classify_condition
    assert c("Light rain") == ("rain", True)
    assert c("Thunderstorm with rain") == ("thunderstorm", True)
    assert c("Partly cloudy sky with possibility of rain") == ("partly_cloudy", True)
    assert c("Clear sky") == ("clear", False)
    assert c(None) == ("unknown", False)


# -----------------------------------------------------------------------------
# /weather-live: strict 10 km radius and robustness
# -----------------------------------------------------------------------------
def _imd_wx_row(sid="1", **over):
    row = {"Station Id": sid, "Station": "IMD City", "Date of Observation": datetime.now(timezone.utc).date().isoformat(),
           "Time": datetime.now(timezone.utc).hour, "Temperature": "30", "Humidity": "60", "Wind Speed KMPH": 10,
           "Feel Like": "33", "WEATHER_MESSAGE": "Haze", "Last 24 hrs Rainfall": "0"}
    row.update(over)
    return row


def _live(lat=17.4, lon=78.5, annam=None, wx_rows=None, coords=None):
    """Call the orchestrator with mocked upstreams and a clean cache."""
    cache_manager._hot_cache.clear()
    cache_manager._persistent_cache.clear()
    with patch.object(main_module.weather_client, "fetch_annam_ws", return_value=annam), \
         patch.object(main_module.weather_client, "_get_imd_station_coords", return_value=coords or {}), \
         patch.object(main_module.weather_client, "_get_imd_wx_list", return_value=wx_rows or []):
        return main_module.get_live_weather_sync(lat, lon)


def _annam(**over):
    d = {"Temperature": "24.0", "Humidity": "80", "Rainfall": "0", "WindSpeed": "2", "DeviceId": "9",
         "City": "Village", "_calculated_dist_km": 3.0, "TimeStamp": datetime.now(_IST_TZ).strftime("%Y-%m-%d %H:%M:%S")}
    d.update(over)
    return d


def test_radius_is_a_constant_not_env(monkeypatch):
    assert main_module.MAX_STATION_DISTANCE_KM == 10.0
    assert not hasattr(main_module, "WS_MAX_DISTANCE_KM") and not hasattr(main_module, "FALLBACK_MAX_DISTANCE_KM")


def test_imd_station_beyond_10km_is_rejected():
    # station ~111 km north of the request (1 degree of latitude)
    with pytest.raises(Exception) as exc:
        _live(wx_rows=[_imd_wx_row("1")], coords={"1": (18.4, 78.5, "Far City")})
    assert getattr(exc.value, "status_code", None) in (404, 503)


def test_imd_station_within_10km_is_used():
    payload, meta = _live(wx_rows=[_imd_wx_row("1")], coords={"1": (17.43, 78.5, "Near City")})
    assert meta["source"] == "imd" and meta["station_distance_km"] <= 10.0


def test_imd_missing_wind_does_not_crash():
    payload, _ = _live(wx_rows=[_imd_wx_row("1", **{"Wind Speed KMPH": None, "Wind Speed": None})],
                       coords={"1": (17.43, 78.5, "Near City")})
    assert payload["windSpeed"] == 0.0


def test_stale_imd_row_ignored():
    old = _imd_wx_row("1", **{"Date of Observation": "2020-01-01", "Time": 3})
    with pytest.raises(Exception):
        _live(wx_rows=[old], coords={"1": (17.43, 78.5, "Near City")})


def test_annam_missing_humidity_filled_from_nearby_imd():
    payload, meta = _live(annam=_annam(Humidity=None), wx_rows=[_imd_wx_row("1")], coords={"1": (17.43, 78.5, "Near City")})
    assert payload["humidity"] == 60.0 and meta["source"] == "aws+imd"


def test_annam_only_label_when_imd_out_of_range():
    payload, meta = _live(annam=_annam(), wx_rows=[_imd_wx_row("1")], coords={"1": (18.4, 78.5, "Far City")})
    assert meta["source"] == "aws"
    assert payload["feelsLikeTemperature"] != 33.0  # not taken from the far IMD station


def test_dead_annam_sensor_ignored():
    stale_ts = (datetime.now(_IST_TZ) - timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
    fake = {"nearby": [{"DeviceId": "1", "Temperature": 20.0, "Humidity": 50, "Latitude": 17.41, "Longitude": 78.5, "TimeStamp": stale_ts}]}
    resp = MagicMock(); resp.json.return_value = fake; resp.raise_for_status.return_value = None
    with patch.object(main_module.http_session, "get", return_value=resp):
        assert main_module.weather_client.fetch_annam_ws(17.4, 78.5) is None


def test_stale_cache_strict_10km_and_24h():
    cm = cache_manager
    cm._persistent_cache.clear(); cm._hot_cache.clear()
    cm.put(17.4, 78.5, {"liveTemperature": 31.0, "humidity": 50.0, "rainfall": 0.0, "windSpeed": 3.0, "weatherCondition": "Clear",
                        "feelsLikeTemperature": 31.0, "source": "aws", "station_name": "S", "station_distance_km": 1.0, "recorded_at": "x"})
    assert cm.get_stale_fallback(17.43, 78.5) is not None      # ~3 km: ok
    assert cm.get_stale_fallback(17.7, 78.5) is None           # ~33 km: too far
    for rec in cm._persistent_cache.values():
        rec["timestamp_epoch"] -= 25 * 3600
    assert cm.get_stale_fallback(17.4, 78.5) is None           # older than 24 h


def test_no_station_nearby_is_404_when_upstreams_healthy():
    with patch.object(main_module.weather_client, "imd_loaded", return_value=True), \
         patch.object(main_module, "get_live_weather_sync", side_effect=main_module.get_live_weather_sync):
        cache_manager._hot_cache.clear(); cache_manager._persistent_cache.clear()
        with patch.object(main_module.weather_client, "fetch_annam_ws", return_value=None), \
             patch.object(main_module.weather_client, "fetch_imd_wx", return_value=None):
            resp = client.get("/weather-live?lat=26.9&lon=70.9")
    assert resp.status_code == 404
    assert "within 10 km" in resp.json()["message"]


def test_great_nicobar_is_inside_india_box():
    with patch.object(main_module, "get_live_weather_sync", return_value=(
            {"liveTemperature": 1.0, "humidity": 1.0, "rainfall": 0.0, "windSpeed": 0.0, "weatherCondition": "x", "feelsLikeTemperature": 1.0},
            {"source": "imd", "station_name": "x", "station_distance_km": 1.0, "recorded_at": None})):
        assert client.get("/weather-live?lat=6.75&lon=93.85").status_code == 200


def test_stale_response_not_browser_cacheable():
    with patch.object(main_module, "get_live_weather_sync", return_value=(
            {"liveTemperature": 1.0, "humidity": 1.0, "rainfall": 0.0, "windSpeed": 0.0, "weatherCondition": "x", "feelsLikeTemperature": 1.0},
            {"source": "stale_fallback", "station_name": "x", "station_distance_km": 1.0, "recorded_at": "2026-01-01T00:00:00+00:00"})):
        resp = client.get("/weather-live?lat=17.4&lon=78.5")
    assert resp.headers["cache-control"] == "no-cache"


def test_disk_writes_are_debounced():
    cm = main_module.WeatherCacheManager(Path(tempfile.mkdtemp()) / "c.json")
    rec = {"liveTemperature": 1.0}
    with patch.object(cm, "_save_to_disk") as save:
        for i in range(20):
            cm.put(10 + i * 0.01, 78.0, rec)
        assert save.call_count == 1


# -----------------------------------------------------------------------------
# Fixes from the second audit
# -----------------------------------------------------------------------------
def _annam_http(temp=24.0, hum=80, wind=2.0, rain=0.0, lat=17.41, lon=78.5):
    stamp = datetime.now(_IST_TZ).strftime("%Y-%m-%d %H:%M:%S")
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"nearby": [{"DeviceId": "9", "Temperature": temp, "Humidity": hum, "Rainfall": rain,
                                          "WindSpeed": wind, "Latitude": lat, "Longitude": lon, "TimeStamp": stamp, "City": "V"}]}
    return resp


@pytest.mark.parametrize("temp", [999, -127, "nan"])
def test_sensor_fault_temperature_rejected(temp):
    with patch.object(main_module.http_session, "get", return_value=_annam_http(temp=temp)):
        assert main_module.weather_client.fetch_annam_ws(17.4, 78.5) is None


def test_sensor_fault_values_become_missing_not_garbage():
    p, _ = _live(annam=_annam(Humidity="150", WindSpeed="400", Rainfall="-1"),
                 wx_rows=[_imd_wx_row("1", Humidity="55", **{"Wind Speed KMPH": 12})], coords={"1": (17.43, 78.5, "Near")})
    assert p["humidity"] == 55.0          # 150 % rejected, filled from the nearby IMD station
    assert p["windSpeed"] == 12.0         # 400 m/s rejected, filled from IMD
    assert p["rainfall"] == 0.0           # -1 mm rejected


def test_imd_fault_temperature_not_served():
    with pytest.raises(Exception):
        _live(wx_rows=[_imd_wx_row("1", Temperature="999")], coords={"1": (17.43, 78.5, "Near")})


def test_one_source_crashing_does_not_break_request():
    cache_manager._hot_cache.clear(); cache_manager._persistent_cache.clear()
    with patch.object(main_module.weather_client, "fetch_annam_ws", return_value=_annam()), \
         patch.object(main_module.weather_client, "fetch_imd_wx", side_effect=RuntimeError("boom")):
        resp = client.get("/weather-live?lat=17.4&lon=78.5")
    assert resp.status_code == 200 and resp.json()["source"] == "aws"
    cache_manager._hot_cache.clear(); cache_manager._persistent_cache.clear()
    with patch.object(main_module.weather_client, "fetch_annam_ws", side_effect=RuntimeError("boom")), \
         patch.object(main_module.weather_client, "fetch_imd_wx", return_value={
             "station_name": "IMD", "distance_km": 2.0, "temperature_c": 30.0, "feel_like_c": 33.0, "humidity_pct": 60.0,
             "wind_speed_kmph": 5.0, "past_24hrs_rainfall_mm": 0.0, "weather_condition": "Haze", "latitude": 17.4, "longitude": 78.5}):
        resp = client.get("/weather-live?lat=17.4&lon=78.5")
    assert resp.status_code == 200 and resp.json()["source"] == "imd"


def test_outage_uses_circuit_breaker():
    wc = main_module.weather_client
    calls = {"n": 0}

    def failing(*a, **k):
        calls["n"] += 1
        raise ConnectionError("down")
    with patch.object(main_module.http_session, "get", side_effect=failing):
        for _ in range(10):
            assert wc.fetch_annam_ws(17.4, 78.5) is None
    assert calls["n"] == 1
    assert wc.upstream_down() is True


def test_forecast_outage_uses_circuit_breaker():
    main_module._forecast_rows_cache = []
    main_module._forecast_rows_time = 0.0
    calls = {"n": 0}

    def failing(*a, **k):
        calls["n"] += 1
        raise ConnectionError("down")
    with patch.object(main_module.http_session, "get", side_effect=failing):
        for _ in range(10):
            main_module._fetch_imd_forecast_rows()
    assert calls["n"] == 1


def test_malformed_disk_cache_records_are_ignored():
    f = Path(tempfile.mkdtemp()) / "bad.json"
    f.write_text('{"17.4,78.5": 5, "17.5,78.5": {"data": 1}, "x,y": {}}')
    cm = main_module.WeatherCacheManager(f)
    assert cm.get_stale_fallback(17.4, 78.5) is None  # no crash


def test_hot_cache_recomputes_station_distance_and_enforces_radius():
    # station ~9.8 km north of (17.400, 78.500): inside the radius for the first user, outside for the second
    ann = _annam(Latitude="17.488", Longitude="78.5", _calculated_dist_km=9.34)
    cache_manager._hot_cache.clear(); cache_manager._persistent_cache.clear()
    with patch.object(main_module.weather_client, "fetch_annam_ws", return_value=ann), \
         patch.object(main_module.weather_client, "fetch_imd_wx", return_value=None):
        _, m1 = main_module.get_live_weather_sync(17.404, 78.5)
    assert 9.0 < m1["station_distance_km"] <= 10.0
    near = main_module._serve_hot(17.403, 78.5)               # same cell, still inside: distance recomputed
    assert near is not None and near[1]["station_distance_km"] != m1["station_distance_km"]
    assert main_module._serve_hot(17.396, 78.5) is None        # same cell but now > 10 km: not served from cache


def test_stale_cache_station_must_be_within_10km_of_request():
    cm = cache_manager
    cm._persistent_cache.clear(); cm._hot_cache.clear()
    cm.put(17.4, 78.5, {"liveTemperature": 31.0, "humidity": 50.0, "rainfall": 0.0, "windSpeed": 3.0, "weatherCondition": "Clear",
                        "feelsLikeTemperature": 31.0, "source": "aws", "station_name": "S", "station_distance_km": 9.0,
                        "recorded_at": "x", "_station_lat": 17.488, "_station_lon": 78.5})
    with patch.object(main_module.weather_client, "fetch_annam_ws", return_value=None), \
         patch.object(main_module.weather_client, "fetch_imd_wx", return_value=None):
        with pytest.raises(Exception):
            main_module.get_live_weather_sync(17.396, 78.5)   # cache record is <10 km away, its STATION is 10.2 km away


def test_internal_station_fields_never_leak_into_response():
    cache_manager._hot_cache.clear(); cache_manager._persistent_cache.clear()
    with patch.object(main_module.weather_client, "fetch_annam_ws", return_value=_annam(Latitude="17.41", Longitude="78.5")), \
         patch.object(main_module.weather_client, "fetch_imd_wx", return_value=None):
        first = client.get("/weather-live?lat=17.4&lon=78.5").json()
        second = client.get("/weather-live?lat=17.4&lon=78.5").json()   # served from hot cache
    keys = {"liveTemperature", "humidity", "rainfall", "windSpeed", "weatherCondition", "feelsLikeTemperature",
            "source", "station_name", "station_distance_km", "recorded_at"}
    assert set(first) == keys and set(second) == keys


@pytest.mark.parametrize("header,expected", [
    ('"abc"', True), ('W/"abc"', True), ('"zzz", "abc"', True), ('*', True), ('"zzz"', False), ('', False),
])
def test_etag_matching(header, expected):
    assert main_module.etag_matches(header, '"abc"') is expected


def test_conditional_get_accepts_weak_etag():
    with patch.object(main_module, "get_live_weather_sync", return_value=(
            {"liveTemperature": 1.0, "humidity": 1.0, "rainfall": 0.0, "windSpeed": 0.0, "weatherCondition": "x", "feelsLikeTemperature": 1.0},
            {"source": "imd", "station_name": "x", "station_distance_km": 1.0, "recorded_at": None})):
        etag = client.get("/weather-live?lat=17.4&lon=78.5").headers["etag"]
        assert client.get("/weather-live?lat=17.4&lon=78.5", headers={"If-None-Match": "W/" + etag}).status_code == 304


def test_unknown_route_and_wrong_method_use_standard_error_format():
    for resp in (client.get("/nope"), client.post("/weather-live?lat=17&lon=78")):
        body = resp.json()
        assert body["status"] == "error" and "message" in body and "detail" not in body
    assert client.post("/weather-live?lat=17&lon=78").headers.get("allow")


def test_head_requests_supported():
    with patch.object(main_module, "get_live_weather_sync", return_value=(
            {"liveTemperature": 1.0, "humidity": 1.0, "rainfall": 0.0, "windSpeed": 0.0, "weatherCondition": "x", "feelsLikeTemperature": 1.0},
            {"source": "imd", "station_name": "x", "station_distance_km": 1.0, "recorded_at": None})):
        assert client.head("/weather-live?lat=17.4&lon=78.5").status_code == 200
    assert client.head("/health").status_code == 200


def test_diagnostic_headers_documented_in_readme_exist():
    with patch.object(main_module, "get_live_weather_sync", return_value=(
            {"liveTemperature": 1.0, "humidity": 1.0, "rainfall": 0.0, "windSpeed": 0.0, "weatherCondition": "x", "feelsLikeTemperature": 1.0},
            {"source": "aws", "station_name": "Hyderabad \u0c39\u0c48 (Annam AWS: #20)", "station_distance_km": 4.4,
             "recorded_at": None, "is_cached": False})):
        h = client.get("/weather-live?lat=17.4&lon=78.5").headers  # non-ASCII station name must not crash
    assert h["x-weather-source"] == "aws" and h["x-cache-status"] == "MISS" and h["x-station-distance-km"] == "4.4"
    assert "Annam AWS" in h["x-station-name"]


@pytest.mark.parametrize("text,expected", [
    ("No Rain Expected", ("unknown", False)),
    ("Possibility of fog", ("fog", False)),
    ("Partly cloudy sky with possibility of fog", ("partly_cloudy", False)),
    ("Rain or Thundershower", ("rain", True)),
    ("Heat Wave", ("heat_wave", False)),
    ("Cold Wave", ("cold_wave", False)),
    ("Hot Day", ("hot", False)),
    ("Strong Surface Winds", ("windy", False)),
    ("Dust Raising Winds", ("duststorm", False)),
    ("Thunderstorm with Rain", ("thunderstorm", True)),
])
def test_condition_mapping_edge_phrases(text, expected):
    assert main_module.classify_condition(text) == expected


def test_legacy_stale_record_with_far_station_is_never_served():
    """Regression: a record cached by the old code (no station coords, station 21 km away) must not be served."""
    cm = cache_manager
    cm._persistent_cache.clear(); cm._hot_cache.clear()
    cm.put(26.27, 90.44, {"liveTemperature": 25.0, "humidity": 83.0, "rainfall": 0.0, "windSpeed": 0.0, "weatherCondition": "Clear Sky",
                          "feelsLikeTemperature": 25.0, "source": "imd", "station_name": "Goalpara", "station_distance_km": 21.37,
                          "recorded_at": "05 Nov 2026, 12:45 PM IST"})   # no _station_lat/_station_lon, like the old cache entries
    with patch.object(main_module.weather_client, "fetch_annam_ws", return_value=None), \
         patch.object(main_module.weather_client, "fetch_imd_wx", return_value=None), \
         patch.object(main_module.weather_client, "imd_loaded", return_value=True):
        resp = client.get("/weather-live?lat=26.274075&lon=90.443161")
    assert resp.status_code == 404, resp.text


def test_legacy_record_close_station_still_served_and_far_ones_purged_on_load():
    cm = cache_manager
    cm._persistent_cache.clear(); cm._hot_cache.clear()
    cm.put(17.4, 78.5, {"liveTemperature": 31.0, "humidity": 50.0, "rainfall": 0.0, "windSpeed": 3.0, "weatherCondition": "Clear",
                        "feelsLikeTemperature": 31.0, "source": "imd", "station_name": "Near", "station_distance_km": 4.0,
                        "recorded_at": "x"})
    assert cm.get_stale_fallback(17.4, 78.5) is not None
    f = Path(tempfile.mkdtemp()) / "legacy.json"
    now = __import__("time").time()
    rec = lambda d: {"lat": 1, "lon": 1, "timestamp_iso": "x", "timestamp_epoch": now, "data": {"station_distance_km": d}}
    f.write_text(json.dumps({"26.27,90.44": rec(21.37), "26.0,91.0": rec(42.02), "17.4,78.5": rec(4.0)}))
    loaded = main_module.WeatherCacheManager(f)
    assert list(loaded._persistent_cache) == [(17.4, 78.5)]


# -----------------------------------------------------------------------------
# Forecast: strict 10 km radius and edge cases
# -----------------------------------------------------------------------------
def _fc(rows, lat=17.385, lon=78.4867, fresh=True):
    with _with_rows(rows, fresh=fresh):
        return client.get(f"/weather-forecast?lat={lat}&lon={lon}")


def _km_north(km):  # latitude offset giving ~km north of lat 17.385
    return f"{17.385 + km / 111.195:.6f}"


def test_forecast_radius_boundary_is_10km():
    assert _fc([_forecast_row(lat=_km_north(9.8), lon="78.4867")]).status_code == 200
    r = _fc([_forecast_row(lat=_km_north(10.3), lon="78.4867")])
    assert r.status_code == 404 and "within 10 km" in r.json()["message"]


def test_forecast_no_far_station_warning_exists_and_radius_not_configurable():
    assert not hasattr(main_module, "FORECAST_MAX_DISTANCE_KM")
    body = _fc([_forecast_row(lat=_km_north(9.0), lon="78.4867")]).json()
    assert "far_station" not in body["warnings"] and body["station_distance_km"] <= 10.0


def test_forecast_picks_nearest_of_several_and_tries_every_station_in_radius():
    empties = []
    for i in range(5):  # five nearer stations without any forecast values
        e = _forecast_row(code=f"e{i}", lat=_km_north(1 + i * 0.5), lon="78.4867",
                          Todays_Forecast_Max_Temp=None, Todays_Forecast_Min_temp=None, Todays_Forecast=None, days=1)
        for d in range(2, 8):
            e[f"Day_{d}_Forecast"] = None
        empties.append(e)
    good = _forecast_row(code="g", lat=_km_north(8), lon="78.4867")
    body = _fc(empties + [good]).json()
    assert body["station_name"] == "Station g"


def test_forecast_stations_without_coordinates_or_code_ignored():
    rows = [_forecast_row(code="1", lat=None, lon=None), _forecast_row(code="", lat="17.386", lon="78.4867"),
            _forecast_row(code="3", lat="abc", lon="x")]
    assert _fc(rows).status_code == 404


def test_forecast_middle_day_missing_keeps_positions_and_trailing_missing_dropped():
    row = _forecast_row(days=6)
    row["Day_3_Max_Temp"] = row["Day_3_Min_temp"] = row["Day_3_Forecast"] = None
    body = _fc([row]).json()
    assert body["days_available"] == 6 and [d["dayIndex"] for d in body["forecast"]] == list(range(6))
    mid = body["forecast"][2]
    assert mid["minTemperature"] is None and mid["maxTemperature"] is None and mid["conditionCode"] == "unknown"
    dates = [d["date"] for d in body["forecast"]]
    assert dates == sorted(dates) and len(set(dates)) == 6


def test_forecast_text_only_day_and_temp_only_day_are_kept():
    row = _forecast_row()
    row["Day_2_Max_Temp"] = row["Day_2_Min_temp"] = None            # text only
    row["Day_3_Forecast"] = None                                    # temps only
    body = _fc([row]).json()
    assert body["forecast"][1]["weatherCondition"] and body["forecast"][1]["maxTemperature"] is None
    assert body["forecast"][2]["maxTemperature"] == 33.0 and body["forecast"][2]["weatherCondition"] is None


def test_forecast_all_values_missing_station_is_skipped_to_404():
    e = _forecast_row(Todays_Forecast_Max_Temp=None, Todays_Forecast_Min_temp=None, Todays_Forecast=None, days=1)
    for d in range(2, 8):
        e[f"Day_{d}_Forecast"] = None
    assert _fc([e]).status_code == 404


@pytest.mark.parametrize("bad", ["999", "-999", "abc", "", "null", "nan", "inf", "1e9"])
def test_forecast_garbage_temperatures_become_null(bad):
    body = _fc([_forecast_row(Todays_Forecast_Max_Temp=bad, Todays_Forecast_Min_temp="20.0")]).json()
    assert body["forecast"][0]["maxTemperature"] is None and body["forecast"][0]["minTemperature"] == 20.0


def test_forecast_min_greater_than_max_is_swapped_not_dropped():
    d0 = _fc([_forecast_row(Todays_Forecast_Max_Temp="18", Todays_Forecast_Min_temp="29")]).json()["forecast"][0]
    assert (d0["minTemperature"], d0["maxTemperature"]) == (18.0, 29.0)


def test_forecast_past_days_never_returned_and_warned():
    old = (datetime.now(timezone.utc).astimezone(_IST_TZ).date() - timedelta(days=2)).isoformat()
    body = _fc([_forecast_row(Date=old)]).json()
    today = datetime.now(timezone.utc).astimezone(_IST_TZ).date().isoformat()
    assert all(d["date"] >= today for d in body["forecast"])
    assert body["forecast"][0]["dayIndex"] == 0 and "stale_upstream" in body["warnings"]
    assert body["days_available"] == len(body["forecast"]) == 5          # 7 days from 2 days ago -> 5 left


def test_forecast_entirely_in_the_past_is_not_served():
    old = (datetime.now(timezone.utc).astimezone(_IST_TZ).date() - timedelta(days=30)).isoformat()
    assert _fc([_forecast_row(Date=old)]).status_code == 404


@pytest.mark.parametrize("date_value", [None, "", "06-11-2026", "garbage", 20261106])
def test_forecast_bad_issue_date_falls_back_to_today(date_value):
    body = _fc([_forecast_row(Date=date_value)]).json()
    assert "missing_issue_date" in body["warnings"] and body["forecast"][0]["dayIndex"] == 0


def test_forecast_stale_cache_only_serves_station_within_10km():
    main_module._forecast_result_cache.clear()
    assert _fc([_forecast_row(code="H", lat="17.40", lon="78.4867")]).status_code == 200        # warm cache (Hyderabad)
    # outage, request from a DIFFERENT city (Delhi): must not get Hyderabad's forecast
    r = _fc([], lat=28.61, lon=77.21, fresh=False)
    assert r.status_code == 503
    # outage, same area: stale served, flagged
    body = _fc([], fresh=False).json()
    assert body["is_cached"] is True and body["warnings"] == ["served_from_stale_cache"] and body["station_distance_km"] <= 10


def test_forecast_stale_cache_expires_and_drops_past_days():
    main_module._forecast_result_cache.clear()
    _fc([_forecast_row(code="H", lat="17.40", lon="78.4867")])
    ts, days, meta, la, lo = main_module._forecast_result_cache["H"]
    main_module._forecast_result_cache["H"] = (ts - 49 * 3600, days, meta, la, lo)      # older than 48 h
    assert _fc([], fresh=False).status_code == 503
    old_days = [dict(d, date=(datetime.now(timezone.utc).astimezone(_IST_TZ).date() - timedelta(days=9 - i)).isoformat()) for i, d in enumerate(days)]
    main_module._forecast_result_cache["H"] = (ts, old_days, meta, la, lo)             # every day already past
    assert _fc([], fresh=False).status_code == 404 or _fc([], fresh=False).status_code == 503


def test_forecast_stale_rows_with_old_dates_dropped_and_flagged():
    body = _fc([_forecast_row(code="H", lat="17.40", lon="78.4867")], fresh=False).json()
    assert body["is_cached"] is True and "served_from_stale_cache" in body["warnings"]


def test_forecast_station_name_missing_falls_back_to_code():
    assert _fc([_forecast_row(code="777", Station_Name=None)]).json()["station_name"] == "777"


def test_forecast_non_ascii_station_name_ok():
    r = _fc([_forecast_row(Station_Name="\u0c39\u0c48\u0c26\u0c30\u0c3e\u0c2c\u0c3e\u0c26\u0c4d")])
    assert r.status_code == 200 and r.json()["station_name"].startswith("\u0c39")


def test_forecast_response_shape_is_stable():
    body = _fc([_forecast_row()]).json()
    assert set(body) == {"source", "station_name", "station_distance_km", "issued_for", "days_available", "is_cached", "warnings", "forecast"}
    assert set(body["forecast"][0]) == {"date", "day", "dayIndex", "minTemperature", "maxTemperature", "weatherCondition",
                                         "conditionCode", "rainPossible", "sunrise", "sunset"}
    assert body["days_available"] == len(body["forecast"])


@pytest.mark.parametrize("q,code", [
    ("lat=17.385", 422), ("lon=78.48", 422), ("", 422), ("lat=abc&lon=78", 422), ("lat=nan&lon=78", 422),
    ("lat=17&lon=inf", 400), ("lat=0&lon=0", 400), ("lat=37.10001&lon=78", 400), ("lat=6.69&lon=78", 400),
    ("lat=17&lon=97.42", 400), ("lat=17&lon=68.11", 400),
])
def test_forecast_parameter_validation(q, code):
    assert client.get("/weather-forecast?" + q).status_code == code


def test_forecast_head_etag_and_error_format():
    with _with_rows([_forecast_row()]):
        r = client.get("/weather-forecast?lat=17.385&lon=78.4867")
        assert client.head("/weather-forecast?lat=17.385&lon=78.4867").status_code == 200
        etag = r.headers["etag"]
        assert client.get("/weather-forecast?lat=17.385&lon=78.4867", headers={"If-None-Match": "W/" + etag}).status_code == 304
    err = client.post("/weather-forecast?lat=17&lon=78")
    assert err.status_code == 405 and err.json()["status"] == "error"


def test_forecast_outage_then_recovery_uses_fresh_data_after_cooldown():
    main_module._forecast_result_cache.clear()
    main_module._forecast_rows_cache = []
    main_module._forecast_rows_time = 0.0
    ok = MagicMock(); ok.raise_for_status.return_value = None; ok.json.return_value = [_forecast_row(lat="17.40", lon="78.4867")]
    with patch.object(main_module.http_session, "get", side_effect=ConnectionError("down")):
        assert client.get("/weather-forecast?lat=17.385&lon=78.4867").status_code in (404, 503)
    main_module._forecast_retry_after = 0.0                       # cooldown elapsed
    with patch.object(main_module.http_session, "get", return_value=ok):
        assert client.get("/weather-forecast?lat=17.385&lon=78.4867").status_code == 200
