"""Tests for Annam history aggregation and weather query routing/timeframe classification."""

from datetime import datetime, timedelta, timezone

import pytest

from ajrasakha.agents.new_weather_agent import (
    _classify_timeframe,
    _extract_dates_from_text,
    route_weather_query_by_heuristics,
)
from ajrasakha.tools.weather import weather_tools2 as wt


def _row(ts: str, rain: float, temp: float = 25.0, hum: float = 60.0) -> dict:
    # History rows come back with numbers as strings.
    return {
        "DeviceId": "20",
        "Temperature": str(temp),
        "Humidity": str(hum),
        "Rainfall": str(rain),
        "TimeStamp": ts,
        "Latitude": "30.98",
        "Longitude": "76.53",
    }


# The counter shape observed on a real station: it accumulates within the hour and resets on the hour.
_RAIN_EVENT = [
    ("2026-09-25 10:10:00", 0.0),
    ("2026-09-25 10:15:00", 0.5),
    ("2026-09-25 10:20:00", 2.5),
    ("2026-09-25 10:25:00", 4.0),
    ("2026-09-25 10:30:00", 4.0),
    ("2026-09-25 10:45:00", 4.5),
    ("2026-09-25 10:55:00", 5.0),
    ("2026-09-25 11:00:00", 0.0),  # counter reset, no new rain
    ("2026-09-25 11:05:00", 0.0),
]


def test_rain_is_counted_from_counter_rises_not_summed():
    rows = [_row(ts, r) for ts, r in _RAIN_EVENT]
    daily = wt._aggregate_ws_history_by_date(rows)
    # Summing the raw values would give 21.5 mm; the station recorded 5.0 mm.
    assert daily["2026-09-25"]["past_24hrs_rainfall"] == 5.0


def test_rain_after_a_counter_reset_is_added():
    rows = [
        _row("2026-09-25 10:50:00", 3.0),
        _row("2026-09-25 10:55:00", 5.0),
        _row("2026-09-25 11:05:00", 1.0),  # reset happened, then 1.0 mm fell
        _row("2026-09-25 11:10:00", 1.5),
    ]
    daily = wt._aggregate_ws_history_by_date(rows)
    # baseline 3.0 -> +2.0 -> reset +1.0 -> +0.5
    assert daily["2026-09-25"]["past_24hrs_rainfall"] == 3.5


def test_rain_is_attributed_to_the_day_it_fell_not_the_day_after_a_midnight_baseline():
    rows = [
        _row("2026-09-25 23:50:00", 2.0),
        _row("2026-09-25 23:55:00", 2.5),
        _row("2026-09-26 00:00:00", 0.0),
        _row("2026-09-26 00:05:00", 0.0),
    ]
    daily = wt._aggregate_ws_history_by_date(rows)
    assert daily["2026-09-25"]["past_24hrs_rainfall"] == 0.5
    assert daily["2026-09-26"]["past_24hrs_rainfall"] == 0.0


def test_unsorted_history_gives_same_result():
    rows = [_row(ts, r) for ts, r in _RAIN_EVENT]
    daily = wt._aggregate_ws_history_by_date(list(reversed(rows)))
    assert daily["2026-09-25"]["past_24hrs_rainfall"] == 5.0


def test_glitch_spike_is_ignored():
    rows = [_row("2026-09-25 10:00:00", 0.0), _row("2026-09-25 10:05:00", 5000.0), _row("2026-09-25 10:10:00", 5001.0)]
    daily = wt._aggregate_ws_history_by_date(rows)
    assert daily["2026-09-25"]["past_24hrs_rainfall"] == 1.0


def test_rainfall_last_24h_uses_rolling_window_and_goes_quiet_when_station_is_stale():
    now = datetime(2026, 9, 26, 9, 0)
    rows = [_row(ts, r) for ts, r in _RAIN_EVENT]
    # The event (09-25 10:xx) is inside the 24h before 09-26 09:00 ...
    assert wt._ws_rainfall_last_24h(rows, now=now) is None  # ...but the station last reported >6h earlier
    fresh = rows + [_row("2026-09-26 08:55:00", 0.0)]
    assert wt._ws_rainfall_last_24h(fresh, now=now) == 5.0
    # 25h later the event has left the window.
    later = rows + [_row("2026-09-26 11:55:00", 0.0)]
    assert wt._ws_rainfall_last_24h(later, now=datetime(2026, 9, 26, 12, 0)) == 0.0


def test_morning_and_evening_humidity_come_from_those_times():
    rows = []
    t = datetime(2026, 9, 25, 0, 0)
    while t < datetime(2026, 9, 26, 0, 0):
        # humidity equals the hour-of-day as a marker: 08:30 -> ~8.5, 17:30 -> ~17.5
        rows.append(_row(t.strftime("%Y-%m-%d %H:%M:%S"), 0.0, hum=round(t.hour + t.minute / 60, 2)))
        t += timedelta(minutes=5)
    day = wt._aggregate_ws_history_by_date(list(reversed(rows)))["2026-09-25"]
    assert day["humidity_0830"] == pytest.approx(8.5, abs=0.1)
    assert day["humidity_1730"] == pytest.approx(17.5, abs=0.1)
    assert day["is_partial_day"] is False


def test_oldest_day_that_starts_midday_is_flagged_partial():
    rows = [_row("2026-09-24 17:51:00", 0.0), _row("2026-09-24 23:56:00", 0.0)]
    assert wt._aggregate_ws_history_by_date(rows)["2026-09-24"]["is_partial_day"] is True


def test_history_coverage_notice_lists_days_beyond_the_7_day_window():
    today = "2026-10-01"
    history = {"2026-09-30": {"date": "2026-09-30"}, "2026-09-29": {"date": "2026-09-29", "is_partial_day": True}}
    notice = wt._history_coverage_notice(
        ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"],
        history,
        today_raw=None,
        today_str=today,
        place_label="Rupnagar",
    )
    assert "2026-09-28" in notice
    assert "2026-09-29" in notice and "incomplete" in notice
    assert "2026-09-30" not in notice.split("incomplete")[0]


def test_ist_helpers_are_five_and_a_half_hours_ahead_of_utc():
    delta = wt._now_ist() - datetime.now(timezone.utc).replace(tzinfo=None)
    assert timedelta(hours=5, minutes=29) < delta < timedelta(hours=5, minutes=31)


# --------------------------------------------------------------------------- routing / timeframe
@pytest.mark.parametrize(
    "query",
    [
        "Best time for wheat sowing in Karnal",
        "wheat crop weather advisory",
    ],
)
def test_wheat_is_not_routed_to_the_temperature_tool(query):
    assert route_weather_query_by_heuristics(query) != "get_temperature_info"


def test_real_heat_queries_still_route_to_temperature():
    assert route_weather_query_by_heuristics("Is a heatwave coming to Punjab") == "get_temperature_info"
    assert route_weather_query_by_heuristics("what is the temperature today") == "get_temperature_info"


def test_may_as_a_verb_does_not_block_nowcast():
    assert route_weather_query_by_heuristics("it may rain in the next 2 hours, what do you think") == "get_weather_nowcast"


def test_may_as_a_month_is_still_a_date():
    target, _, _, qt = _extract_dates_from_text("rain on 5 may")
    assert target is not None and target.endswith("-05-05")


def test_past_24_hours_rain_is_not_a_history_range():
    q = "how much rain fell in the past 24 hours"
    assert _extract_dates_from_text(q) == (None, None, None, None)
    is_past, is_fc = _classify_timeframe(q, None, None, None, None, "2026-10-01")
    assert (is_past, is_fc) == (False, False)
    assert route_weather_query_by_heuristics(q) == "get_rainfall_and_monsoon_info"


def test_past_week_and_yesterday_are_still_history():
    for q in ("rainfall in the past week", "what was the temperature yesterday"):
        is_past, _ = _classify_timeframe(q, None, None, None, None, "2026-10-01")
        assert is_past is True


def test_forecast_wording_overrides_past_words():
    is_past, is_fc = _classify_timeframe("compared to the past week, will it rain next week", None, None, None, None, "2026-10-01")
    assert is_past is False and is_fc is True
