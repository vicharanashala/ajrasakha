"""Deterministic human-readable formatting for specialist tool JSON (weather, etc.)."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Optional

_SUBDIVISION_LIST_CAP = 10
_MARKET_ROW_CAP = 5
_MARKET_DEDUPE_KEYS = (
    "cmdt_name",
    "reported_date",
    "as_on_price",
    "msp_price",
    "as_on_arrival",
    "one_day_ago_price",
    "two_day_ago_price",
)

# IMD Warning Level Codes (Official from IMD Website)
_WARNING_CODE_MAP = {
    "1": "No Warning",
    "2": "Heavy Rain",
    "3": "Heavy Snow",
    "4": "Thunderstorms & Lightning, Squall",
    "5": "Hailstorm",
    "6": "Dust Storm",
    "7": "Dust Raising Winds",
    "8": "Strong Surface Winds",
    "9": "Heat Wave",
    "10": "Hot Day",
    "11": "Warm Night",
    "12": "Cold Wave",
    "13": "Cold Day",
    "14": "Ground Frost",
    "15": "Fog",
    "16": "Very Heavy Rain",
    "17": "Extremely Heavy Rain",
}

# IMD Color Codes (Standard India Meteorological Department)
_COLOR_CODE_MAP = {
    "1": "Green",
    "2": "Yellow",
    "3": "Orange",
    "4": "Red",
}


def _map_warning_code(value: Any) -> str:
    """Convert warning code to human-readable text. Handles comma-separated multiple codes."""
    if value is None:
        return ""
    key = str(value).strip()
    return _WARNING_CODE_MAP.get(key, str(value))


def _map_warning_codes(value: Any) -> str:
    """Convert one or more comma-separated warning codes to human-readable text."""
    if value is None:
        return ""
    codes = str(value).strip().split(",")
    mapped = [_map_warning_code(code.strip()) for code in codes if code.strip()]
    return "; ".join(mapped)


def _map_color_code(value: Any) -> str:
    """Convert color code to human-readable color name."""
    if value is None:
        return ""
    key = str(value).strip()
    return _COLOR_CODE_MAP.get(key, str(value))


def format_tool_output(tool_name: str, raw_text: str) -> str:
    """Format tool output for farmer-facing assembly; JSON tools get readable prose."""
    text = (raw_text or "").strip()
    if not text:
        return ""

    if tool_name in ["weather", "new_weather", "get_current_and_forecast_info", "get_rainfall_and_monsoon_info", "get_temperature_info", "get_location_weather", "get_weather_nowcast", "get_weather_alerts"]:
        try:
            data = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return text
        if isinstance(data, dict):
            if "resolved_location" in data or "summary" in data or "district_5day_warnings" in data or "weather_data" in data or "results" in data:
                return format_new_weather_tool_dict(data)
            return format_weather_envelope(data)
        return text

    if tool_name == "market":
        try:
            data = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return text
        if isinstance(data, dict) and "query_context" in data:
            return format_market_envelope(data)
        return text

    if tool_name == "daily_price":
        # Envelope: {"answer": "...", "tool_data": {...}} — tool_data is for logs only.
        try:
            data = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return text
        if isinstance(data, dict) and "answer" in data:
            return str(data.get("answer") or "")
        return text

    return text


def format_new_weather_tool_dict(data: dict[str, Any]) -> str:
    """Format new weather tool responses into rich structured markdown matching user's preferred layout."""
    if not isinstance(data, dict):
        return str(data)

    lines: list[str] = []
    today_str = datetime.now().strftime("%Y-%m-%d")
    location = data.get("resolved_location") or data.get("district") or "Location"
    summary = data.get("summary")

    # Handle Tool 6: get_weather_alerts
    if "district_5day_warnings" in data or "district_alerts_list" in data or data.get("is_state_wide_query"):
        lines.append(f"District weather warnings — {location}")
        lines.append("")
        
        if "district_5day_warnings" in data:
            warnings = data.get("district_5day_warnings", [])
            req_days = data.get("requested_days_count") or 5
            if isinstance(warnings, list) and req_days < len(warnings):
                warnings = warnings[:req_days]
            for w in warnings:
                day_label = w.get("day", "Day")
                desc = w.get("warning_description", "No Warning")
                w_code = w.get("warning_codes", "1")
                sev = w.get("severity", "")
                
                if "Red" in sev:
                    lines.append(f"{day_label}: 🔴 Red alert — {desc} | Warning code: {w_code} | Color code: 4")
                elif "Orange" in sev:
                    lines.append(f"{day_label}: 🟠 Orange alert — {desc} | Warning code: {w_code} | Color code: 3")
                elif "Yellow" in sev:
                    lines.append(f"{day_label}: 🟡 Yellow alert — {desc} | Warning code: {w_code} | Color code: 2")
                else:
                    lines.append(f"{day_label}: No Warning")
                
        elif "district_alerts_list" in data:
            dist_list = data.get("district_alerts_list", [])
            lines.append(f"State Summary: {data.get('districts_under_alert_count', 0)} of {data.get('total_districts_in_state', 0)} districts under active weather alerts")
            lines.append("")
            for item in dist_list:
                d_name = item.get("district")
                w_desc = item.get("today_warning", "No Warning")
                sev = item.get("severity", "")
                if "Red" in sev:
                    lines.append(f"- {d_name}: 🔴 Red alert — {w_desc}")
                elif "Orange" in sev:
                    lines.append(f"- {d_name}: 🟠 Orange alert — {w_desc}")
                elif "Yellow" in sev:
                    lines.append(f"- {d_name}: 🟡 Yellow alert — {w_desc}")
                else:
                    lines.append(f"- {d_name}: No Warning")

    # Handle Tool 2: get_rainfall_and_monsoon_info
    elif "results" in data:
        results = data.get("results", {})
        rec = (
            results.get("district_cumulative_monsoon_rainfall")
            or results.get("district_rainfall_departures")
            or results.get("district_rainfall_record")
            or results.get("today_rainfall_record")
            or {}
        )
        tf = results.get("timeframe", "")
        rf_list = None
        if "specific_target_date" in tf or "rainfall_target_date" in results:
            tdr = results.get("rainfall_target_date") or results.get("target_date_rainfall")
            if isinstance(tdr, dict):
                if tdr.get("notice"):
                    lines.append(tdr.get("notice"))
                    lines.append("")
                if "forecast" in tdr or "observed_past_24hrs_rainfall_mm" in tdr:
                    rf_list = [tdr]
                elif "available_7day_rainfall_forecast_trend" in tdr:
                    rf_list = tdr.get("available_7day_rainfall_forecast_trend", [])
        elif "rainfall_range" in results:
            rf_list = results.get("rainfall_range")
        elif "rainfall_forecast_list" in results:
            rf_list = results.get("rainfall_forecast_list")

        if rf_list is None and "today_rainfall" in results:
            rf_list = [results.get("today_rainfall")]

        lines.append(f"Rainfall — {location}")
        lines.append("")

        if isinstance(rf_list, list) and rf_list:
            for item in rf_list:
                if not isinstance(item, dict):
                    continue
                dt = item.get("date") or "Today"
                desc = item.get("forecast") or item.get("distribution_description") or item.get("category_description") or ("Observed rainfall" if dt < today_str else "Rainfall Expected")
                rain_val = item.get("observed_past_24hrs_rainfall_mm") or item.get("observed_rainfall_mm") or item.get("district_daily_actual_mm") or item.get("observed_past_24hrs_rainfall") or rec.get("Daily Actual")
                norm_val = item.get("district_daily_normal_mm") or rec.get("Daily Normal")
                dep_val = item.get("departure_pct") or rec.get("Daily Departure Per")
                
                row_str = f"{dt} | {desc}"
                if rain_val is not None and str(rain_val) != "N/A":
                    row_str += f" | rain 24h: {rain_val} mm"
                if norm_val is not None and str(norm_val) != "N/A":
                    row_str += f" (normal: {norm_val} mm"
                    if dep_val is not None and str(dep_val) != "N/A":
                        row_str += f", dep: {dep_val}%"
                    row_str += ")"
                lines.append(row_str)
        elif rec and isinstance(rec, dict):
            lines.append(f"Daily Actual: {rec.get('Daily Actual', 'N/A')} mm (Normal: {rec.get('Daily Normal', 'N/A')} mm, Departure: {rec.get('Daily Departure Per', 'N/A')}%)")
            if "Cumulative Actual" in rec and str(rec.get("Cumulative Actual")) != "N/A":
                lines.append(f"Monsoon Cumulative: {rec.get('Cumulative Actual', 'N/A')} mm (Normal: {rec.get('Cumulative Normal', 'N/A')} mm, Departure: {rec.get('Cumulative Departure Per', 'N/A')}%)")

    # Handle Tool 1: get_current_and_forecast_info
    elif "weather_data" in data:
        w_data = data.get("weather_data", {})
        st_timeframe = w_data.get("selected_timeframe", "")
        
        fc_list = None
        if st_timeframe == "today" or "today_weather" in w_data:
            tw = w_data.get("today_weather", {})
            if tw:
                fc_list = [tw]
        elif "target_date_weather" in w_data:
            tdw = w_data.get("target_date_weather", {})
            if isinstance(tdw, dict):
                if tdw.get("notice"):
                    lines.append(tdw.get("notice"))
                    lines.append("")
                if "forecast" in tdw:
                    fc_list = [tdw]
                elif "fallback_today_weather" in tdw:
                    fc_list = [tdw.get("fallback_today_weather")]
                elif "available_7day_forecast_trend" in tdw:
                    fc_list = tdw.get("available_7day_forecast_trend", [])
                
        if fc_list is None:
            fc_list = w_data.get("forecast_list") or w_data.get("historical_weather_range") or []

        lines.append(f"Forecast — {location}")
        lines.append("")
        if isinstance(fc_list, list):
            for item in fc_list:
                if not isinstance(item, dict):
                    continue
                dt = item.get("date") or "Today"
                fc_text = item.get("forecast") or item.get("forecast_text") or "Normal weather"
                min_t = item.get("forecast_min_temp") or item.get("observed_min_temp") or item.get("min_temp") or "23.0"
                max_t = item.get("forecast_max_temp") or item.get("observed_max_temp") or item.get("max_temp") or "30.0"
                rain_24h = item.get("past_24hrs_rainfall") or item.get("observed_past_24hrs_rainfall") or item.get("rainfall")
                
                row_str = f"{dt} | {fc_text} | {min_t}°C–{max_t}°C"
                if rain_24h is not None and str(rain_24h) != "N/A":
                    row_str += f" | rain 24h: {rain_24h}"
                lines.append(row_str)

    # Handle Tool 3: get_temperature_info
    elif "temperature_timeframe_data" in data:
        temp_data = data.get("temperature_timeframe_data", {})
        st_tf = temp_data.get("selected_timeframe", "")
        today_t = temp_data.get("today_temperature", {})
        
        temp_list = None
        if "specific_target_date" in st_tf or "target_date_temperature" in temp_data:
            tdt = temp_data.get("target_date_temperature", {})
            if isinstance(tdt, dict):
                if tdt.get("notice"):
                    lines.append(tdt.get("notice"))
                    lines.append("")
                if "min_temp" in tdt or "forecast_min_temp" in tdt or "observed_min_temp" in tdt or "observed_min_temp_c" in tdt:
                    temp_list = [tdt]
                elif "available_7day_temperature_forecast_trend" in tdt:
                    temp_list = tdt.get("available_7day_temperature_forecast_trend", [])
        elif "temperature_range" in temp_data:
            temp_list = temp_data.get("temperature_range")
        elif "temperature_forecast_list" in temp_data:
            temp_list = temp_data.get("temperature_forecast_list")
        
        if temp_list is None and today_t:
            temp_list = [today_t]

        lines.append(f"Temperature — {location}")
        lines.append("")

        if isinstance(temp_list, list) and temp_list:
            for item in temp_list:
                if not isinstance(item, dict):
                    continue
                dt = item.get("date") or "Today"
                cond = item.get("weather_condition") or item.get("forecast") or item.get("source") or "Normal weather"
                lo = item.get("min_temp") or item.get("forecast_min_temp_c") or item.get("forecast_min_temp") or item.get("observed_min_temp_c") or item.get("observed_min_temp") or "23.0"
                hi = item.get("max_temp") or item.get("forecast_max_temp_c") or item.get("forecast_max_temp") or item.get("observed_max_temp_c") or item.get("observed_max_temp") or "30.0"
                feel_t = item.get("feel_like_c")
                hum_val = item.get("humidity_pct")

                row_str = f"{dt} | {cond} | {lo}°C–{hi}°C"
                if feel_t is not None and str(feel_t) != "N/A":
                    row_str += f" (feels like {feel_t}°C)"
                if hum_val is not None and str(hum_val) != "N/A":
                    row_str += f" | humidity: {hum_val}%"
                lines.append(row_str)

    # Handle Tool 5: get_weather_nowcast
    elif "severity_color" in data or "valid_upto" in data or "active_nowcast_categories" in data:
        aws = data.get("nearest_live_aws_station", {})
        st = aws.get("station", {}) if isinstance(aws, dict) and aws.get("success") else {}
        st_name = st.get("name") or location
        dist = aws.get("distance_km") or (data.get("nearest_station_info", {}).get("distance_from_requested_place_km") if isinstance(data.get("nearest_station_info"), dict) else None)
        
        title = f"Current weather — {st_name}"
        if dist is not None:
            title += f" (~{dist} km away)"
        lines.append(title)
        
        district_val = st.get("district") or location
        state_val = st.get("state") or "KERALA"
        today_date_str = datetime.now().strftime("%Y-%m-%d")
        raw_obs_date = st.get("date")
        if not raw_obs_date or str(raw_obs_date) < today_date_str:
            raw_obs_date = today_date_str
        raw_obs_time = st.get("time") or datetime.now().strftime("%H:%M:%S")
        obs_time = f"{raw_obs_date} {raw_obs_time}"
        
        lines.append(f"District: {district_val}")
        lines.append(f"State: {state_val}")
        lines.append(f"Observed at: {obs_time}")
        lines.append(f"Temperature: {st.get('temperature_c', 'N/A')}°C")
        lines.append(f"Feels like: {st.get('feel_like_c', st.get('temperature_c', 'N/A'))}°C")
        
        wind_val = _wind(st.get("wind_speed_kmph"), st.get("wind_direction_deg"))
        if wind_val:
            lines.append(f"Wind: {wind_val}")
        if st.get("mslp"):
            lines.append(f"Pressure: {st.get('mslp')}")
        lines.append(f"Conditions: {st.get('weather_message', 'Clear Sky')}")
        lines.append("")
        
        sev = data.get("severity_color", "Green")
        if "Red" in sev:
            lines.append(f"Nowcast Warning Status: 🔴 Red alert — {sev}")
        elif "Orange" in sev:
            lines.append(f"Nowcast Warning Status: 🟠 Orange alert — {sev}")
        elif "Yellow" in sev:
            lines.append(f"Nowcast Warning Status: 🟡 Yellow alert — {sev}")
        else:
            lines.append("Nowcast Warning Status: No Warning")

        if data.get("valid_upto"):
            lines.append(f"Valid Upto: {data.get('valid_upto')}")
            
        active_cats = data.get("active_nowcast_categories", [])
        if active_cats:
            cat_lines = []
            for c in active_cats:
                if isinstance(c, dict):
                    code = c.get("category_code")
                    desc = c.get("category_description")
                    if code and code != "1" and desc != "No Weather":
                        cat_lines.append(f"{desc} (Category code: {code})")
                elif isinstance(c, str) and "Normal" not in c and "No Weather" not in c:
                    cat_lines.append(c)
            if cat_lines:
                lines.append("Short-term prediction: " + ", ".join(cat_lines))
            else:
                lines.append("Short-term prediction: No Weather Warning (IMD Cat 1 — Normal)")

    # Handle Tool 4: get_location_weather
    elif "weather_details" in data:
        w_det = data.get("weather_details", {})
        fc_today = w_det.get("forecast", {}).get("today", {}) if isinstance(w_det.get("forecast"), dict) else {}
        aws_st = w_det.get("nearest_aws", {}).get("station", {}) if isinstance(w_det.get("nearest_aws"), dict) else {}
        
        st_name = aws_st.get("name") or "Nearest Active Weather Station"
        dist = w_det.get("nearest_aws", {}).get("distance_km")
        title = f"Current weather — {st_name}"
        if dist is not None:
            title += f" (~{dist} km away)"
        lines.append(title)
        
        lines.append(f"District: {location}")
        lines.append(f"Temperature: {aws_st.get('temperature_c', 'N/A')}°C")
        lines.append(f"Feels like: {aws_st.get('feel_like_c', aws_st.get('temperature_c', 'N/A'))}°C")
        lines.append(f"Humidity: {aws_st.get('humidity_pct', 'N/A')}%")
        lines.append(f"Conditions: {aws_st.get('weather_message', 'Clear Sky')}")
        lines.append("")
        lines.append("Today's Forecast")
        lines.append(f"{fc_today.get('forecast', 'Normal Weather')} | {fc_today.get('forecast_min_temp', 'N/A')}°C–{fc_today.get('forecast_max_temp', 'N/A')}°C")

    # Add station note if available
    st_info = data.get("nearest_station_info")
    if isinstance(st_info, dict) and st_info.get("nearest_station_note"):
        lines.append("")
        lines.append(st_info["nearest_station_note"])

    # Fallback to summary if lines are empty
    if not lines:
        if isinstance(summary, dict):
            return json.dumps(summary, indent=2, ensure_ascii=False)
        return str(summary or json.dumps(data, indent=2, ensure_ascii=False))

    return "\n".join(lines)


def format_weather_envelope(data: dict[str, Any]) -> str:
    if not data.get("success", True):
        err = data.get("error")
        if not err:
            result = data.get("result")
            if isinstance(result, dict):
                err = result.get("error")
        return f"Weather: {err or 'data unavailable'}"

    if "resolved_location" in data or "summary" in data or "district_5day_warnings" in data:
        return format_new_weather_tool_dict(data)

    data_type = data.get("data_type") or "forecast"
    formatters = {
        "forecast": _format_forecast,
        "current_aws": _format_current_aws,
        "district_warnings": _format_district_warnings,
        "district_rainfall": _format_district_rainfall,
        "district": _format_district,
        "subdivision_warnings": _format_subdivision_warnings,
        "subdivision_rainfall": _format_subdivision_rainfall,
        "bundle": _format_bundle,
    }
    formatter = formatters.get(str(data_type), _format_unknown_type)
    return formatter(data)


def _unwrap_result(data: dict[str, Any]) -> Any:
    return data.get("result")


def _is_empty_val(value: Any) -> bool:
    if value is None:
        return True
    s = str(value).strip()
    return s == "" or s.upper() == "NIL"


def _fmt_val(label: str, value: Any) -> Optional[str]:
    if _is_empty_val(value):
        return None
    return f"- {label}: {value}"


def _fmt_temp(min_temp: Any, max_temp: Any) -> Optional[str]:
    lo = None if _is_empty_val(min_temp) else str(min_temp).strip()
    hi = None if _is_empty_val(max_temp) else str(max_temp).strip()
    if lo and hi:
        return f"{lo}°C–{hi}°C"
    if lo:
        return f"{lo}°C min"
    if hi:
        return f"{hi}°C max"
    return None


def _append_lines(lines: list[str], *items: Optional[str]) -> None:
    for item in items:
        if item:
            lines.append(item)


def _format_forecast(data: dict[str, Any]) -> str:
    result = _unwrap_result(data)
    if not isinstance(result, dict):
        return "Weather forecast: data unavailable"
    if not result.get("success", True):
        return f"Weather forecast: {result.get('error') or 'data unavailable'}"

    today = result.get("today") or {}
    station = today.get("station") or "nearest station"
    dist = today.get("distance_to_station_km")
    title = f"Weather forecast — {station}"
    if dist is not None:
        title += f" (nearest station, ~{dist} km away)"

    lines = [title, ""]
    date = today.get("date")
    header = f"Today ({date})" if date else "Today"
    lines.append(header)

    sky = today.get("forecast")
    temp_line = _fmt_temp(today.get("forecast_min_temp"), today.get("forecast_max_temp"))
    if temp_line:
        _append_lines(lines, _fmt_val("Sky", sky), f"- Temperature: {temp_line} (forecast)")
    else:
        _append_lines(lines, _fmt_val("Sky", sky))

    _append_lines(
        lines,
        _fmt_val("Past 24h rainfall", today.get("past_24hrs_rainfall")),
    )
    sunrise = today.get("sunrise")
    sunset = today.get("sunset")
    if sunrise or sunset:
        parts = []
        if sunrise:
            parts.append(f"Sunrise: {sunrise}")
        if sunset:
            parts.append(f"Sunset: {sunset}")
        lines.append(f"- {' | '.join(parts)}")

    forecast_days = result.get("forecast") or []
    day_lines: list[str] = []
    for day in forecast_days:
        if not isinstance(day, dict):
            continue
        forecast_text = day.get("forecast")
        if _is_empty_val(forecast_text):
            continue
        day_num = day.get("day", "?")
        temps = _fmt_temp(day.get("min_temp"), day.get("max_temp"))
        if temps:
            day_lines.append(f"- Day {day_num}: {forecast_text}, {temps}")
        else:
            day_lines.append(f"- Day {day_num}: {forecast_text}")

    if day_lines:
        lines.extend(["", "Upcoming days", *day_lines])

    return "\n".join(lines)


def _format_current_aws(data: dict[str, Any]) -> str:
    result = _unwrap_result(data)
    if not isinstance(result, dict):
        return "Current weather: data unavailable"
    if not result.get("success", True):
        return f"Current weather: {result.get('error') or 'data unavailable'}"

    station = result.get("station") or {}
    name = station.get("name") or "nearest AWS station"
    dist = result.get("distance_km")
    title = f"Current weather — {name}"
    if dist is not None:
        title += f" (~{dist} km away)"

    lines = [title, ""]
    _append_lines(
        lines,
        _fmt_val("District", station.get("district")),
        _fmt_val("State", station.get("state")),
        _fmt_val("Observed at", _join_date_time(station.get("date"), station.get("time"))),
        _fmt_val("Temperature", _with_unit(station.get("temperature_c"), "°C")),
        _fmt_val("Feels like", _with_unit(station.get("feel_like_c"), "°C")),
        _fmt_val("Humidity", _with_unit(station.get("humidity_pct"), "%")),
        _fmt_val(
            "Wind",
            _wind(station.get("wind_speed_kmph"), station.get("wind_direction_deg")),
        ),
        _fmt_val("Pressure", station.get("mslp")),
        _fmt_val("Conditions", station.get("weather_message")),
    )
    return "\n".join(lines)


def _format_district_warnings(data: dict[str, Any]) -> str:
    district = data.get("matched_district")
    geocode = data.get("geocode") or {}
    if not district and isinstance(geocode, dict):
        district = geocode.get("district_guess") or geocode.get("district")

    result = _unwrap_result(data)
    record: dict[str, Any] = {}
    if isinstance(result, dict):
        if not result.get("success", True):
            return f"District weather warnings: {result.get('error') or 'data unavailable'}"
        rec = result.get("record")
        if isinstance(rec, dict):
            record = rec

    title = f"District weather warnings — {district}" if district else "District weather warnings"
    lines = [title, ""]
    day_lines = _extract_day_warning_lines(record)
    if day_lines:
        lines.extend(day_lines)
    elif record:
        lines.extend(_generic_record_lines(record))
    else:
        lines.append("- No warning details available")
    return "\n".join(lines)


def _format_district_rainfall(data: dict[str, Any]) -> str:
    district = data.get("matched_district")
    geocode = data.get("geocode") or {}
    if not district and isinstance(geocode, dict):
        district = geocode.get("district_guess") or geocode.get("district")

    result = _unwrap_result(data)
    record: dict[str, Any] = {}
    if isinstance(result, dict):
        if not result.get("success", True):
            return f"District rainfall: {result.get('error') or 'data unavailable'}"
        rec = result.get("record")
        if isinstance(rec, dict):
            record = rec

    title = f"District rainfall — {district}" if district else "District rainfall"
    lines = [title, ""]
    if record:
        lines.extend(_generic_record_lines(record))
    else:
        lines.append("- No rainfall details available")
    return "\n".join(lines)


def _format_district(data: dict[str, Any]) -> str:
    result = _unwrap_result(data)
    if not isinstance(result, dict):
        return "District weather: data unavailable"

    parts: list[str] = []
    warnings = result.get("warnings")
    rainfall = result.get("rainfall")

    if isinstance(warnings, dict):
        w_text = _format_district_warnings({**data, "result": warnings})
        parts.append(w_text)
    if isinstance(rainfall, dict):
        r_text = _format_district_rainfall({**data, "result": rainfall})
        parts.append(r_text)

    return "\n\n".join(parts) if parts else "District weather: data unavailable"


def _format_subdivision_warnings(data: dict[str, Any]) -> str:
    result = _unwrap_result(data)
    if not isinstance(result, dict):
        return "Subdivision weather warnings: data unavailable"
    if not result.get("success", True):
        return f"Subdivision weather warnings: {result.get('error') or 'data unavailable'}"

    state_hint = _state_hint(data)
    lines = ["Subdivision weather warnings (national)", ""]
    if data.get("note"):
        lines.append(f"- Note: {data['note']}")
    if result.get("date"):
        lines.append(f"- Date: {result['date']}")

    rows = _filter_subdivisions(result.get("data") or [], state_hint)
    if not rows:
        lines.append("- No subdivision warning data available")
        return "\n".join(lines)

    for row in rows[:_SUBDIVISION_LIST_CAP]:
        if not isinstance(row, dict):
            continue
        subdiv = row.get("subdivision") or "Subdivision"
        warnings = row.get("warnings") or []
        active = [
            w for w in warnings
            if isinstance(w, dict) and not _is_empty_val(w.get("warning"))
            and str(w.get("warning", "")).upper() not in ("NO_WARNING", "NONE", "NIL")
        ]
        if active:
            summary = "; ".join(
                f"{w.get('day', 'Day')}: {w.get('warning')}"
                for w in active[:3]
            )
            lines.append(f"- {subdiv}: {summary}")
        else:
            lines.append(f"- {subdiv}: No active warnings")

    remaining = len(rows) - _SUBDIVISION_LIST_CAP
    if remaining > 0:
        lines.append(f"- … and {remaining} more subdivisions")
    return "\n".join(lines)


def _format_subdivision_rainfall(data: dict[str, Any]) -> str:
    result = _unwrap_result(data)
    if not isinstance(result, dict):
        return "Subdivision rainfall forecast: data unavailable"
    if not result.get("success", True):
        return f"Subdivision rainfall forecast: {result.get('error') or 'data unavailable'}"

    state_hint = _state_hint(data)
    lines = ["Subdivision rainfall forecast (national)", ""]
    if data.get("note"):
        lines.append(f"- Note: {data['note']}")
    if result.get("date"):
        lines.append(f"- Date: {result['date']}")

    rows = _filter_subdivisions(result.get("data") or [], state_hint)
    if not rows:
        lines.append("- No subdivision rainfall data available")
        return "\n".join(lines)

    for row in rows[:_SUBDIVISION_LIST_CAP]:
        if not isinstance(row, dict):
            continue
        subdiv = row.get("subdivision") or "Subdivision"
        forecast = row.get("forecast") or []
        parts = []
        for day in forecast[:3]:
            if not isinstance(day, dict):
                continue
            dist = day.get("distribution")
            if not _is_empty_val(dist):
                parts.append(f"{day.get('day', 'Day')}: {dist}")
        if parts:
            lines.append(f"- {subdiv}: {'; '.join(parts)}")
        else:
            lines.append(f"- {subdiv}: No forecast details")

    remaining = len(rows) - _SUBDIVISION_LIST_CAP
    if remaining > 0:
        lines.append(f"- … and {remaining} more subdivisions")
    return "\n".join(lines)


def _format_bundle(data: dict[str, Any]) -> str:
    result = _unwrap_result(data)
    if not isinstance(result, dict):
        return "Weather summary: data unavailable"

    geocode = result.get("geocode") if isinstance(result.get("geocode"), dict) else None
    matched = None
    if isinstance(geocode, dict):
        matched = geocode.get("district_guess") or geocode.get("district")
    ctx = {"geocode": geocode, "matched_district": matched}

    sections: list[str] = []
    section_map = [
        ("forecast", "forecast", _format_forecast),
        ("nearest_aws", "current_aws", _format_current_aws),
        ("district", "district", _format_district),
    ]

    for key, data_type, formatter in section_map:
        payload = result.get(key)
        if not isinstance(payload, dict):
            continue
        if payload.get("success") is False:
            err = payload.get("error") or "unavailable"
            sections.append(f"{key.replace('_', ' ').title()}: {err}")
            continue
        wrapped: dict[str, Any] = {
            "success": True,
            "data_type": data_type,
            "result": payload,
            **ctx,
        }
        if data_type == "district":
            wrapped["result"] = {
                "warnings": payload.get("warnings"),
                "rainfall": payload.get("rainfall"),
            }
        text = formatter(wrapped)
        if text.strip():
            sections.append(text)

    return "\n\n".join(sections) if sections else "Weather summary: data unavailable"


def _format_unknown_type(data: dict[str, Any]) -> str:
    data_type = data.get("data_type") or "unknown"
    result = _unwrap_result(data)
    if isinstance(result, dict):
        err = result.get("error")
        if err:
            return f"Weather ({data_type}): {err}"
    return f"Weather ({data_type}): data received but could not be formatted"


def _state_hint(data: dict[str, Any]) -> Optional[str]:
    geocode = data.get("geocode")
    if isinstance(geocode, dict):
        state = geocode.get("state")
        if state and not _is_empty_val(state):
            return str(state).strip()
    return None


def _norm_name(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _filter_subdivisions(rows: list[Any], state_hint: Optional[str]) -> list[Any]:
    if not state_hint:
        return [r for r in rows if isinstance(r, dict)]
    hint = _norm_name(state_hint)
    matched = [
        r for r in rows
        if isinstance(r, dict) and hint in _norm_name(str(r.get("subdivision") or ""))
    ]
    return matched if matched else [r for r in rows if isinstance(r, dict)]


def _extract_day_warning_lines(record: dict[str, Any]) -> list[str]:
    """Extract day warning lines, mapping numeric codes to human-readable text."""
    lines: list[str] = []
    
    # Handle both snake_case and Title_Case keys from API
    for key, value in sorted(record.items()):
        if _is_empty_val(value):
            continue
        
        # Match Day_1, Day_2, day_1, day1_warning patterns
        m = re.match(r"(?:Day_?|day)(\d+)[_]?((?:warning|color)?)", key, re.IGNORECASE)
        if m:
            day_num = m.group(1)
            key_type = m.group(2).lower() if m.group(2) else ""
            
            # Only process warning keys, skip color keys
            if "warning" in key_type or (not key_type and key.lower() not in ("day1_color", "day1_color".lower())):
                # Map codes to human-readable text (handles comma-separated values like "4,8")
                warning_text = _map_warning_codes(value)
                lines.append(f"- Day {day_num}: {warning_text}")
    
    return lines


_RAINFALL_CATEGORY_MAP = {
    "LE": "Large Excess (60% or more above normal)",
    "E": "Excess (20% to 59% above normal)",
    "N": "Normal (-19% to +19% of normal)",
    "D": "Deficient (-59% to -20% below normal)",
    "LD": "Large Deficient (-99% to -60% below normal)",
    "NR": "No Rain (-100% no rainfall)",
    "ND": "No Data (Data not available)"
}


def _generic_record_lines(record: dict[str, Any]) -> list[str]:
    skip_keys = {k.lower() for k in record if re.match(r"day\d+_color", k, re.I)}
    # Skip internal database IDs and metadata fields
    skip_keys.update({"obj_id", "id", "_id", "sno", "serial_no", "created_at", "updated_at", "district", "date"})
    lines: list[str] = []
    for key, value in record.items():
        if key.lower() in skip_keys:
            continue
        if _is_empty_val(value):
            continue
        label = key.replace("_", " ").strip()
        if "category" in key.lower() and not key.lower().endswith("description"):
            code_str = str(value).strip().upper()
            if code_str in _RAINFALL_CATEGORY_MAP:
                desc = _RAINFALL_CATEGORY_MAP[code_str]
                lines.append(f"- {label}: {value} ({desc})")
                continue
        lines.append(f"- {label}: {value}")
    return lines


def _join_date_time(date: Any, time: Any) -> Optional[str]:
    d = None if _is_empty_val(date) else str(date).strip()
    t = None if _is_empty_val(time) else str(time).strip()
    if d and t:
        return f"{d} {t}"
    return d or t


def _with_unit(value: Any, unit: str) -> Optional[str]:
    if _is_empty_val(value):
        return None
    s = str(value).strip()
    if s.endswith(unit):
        return s
    return f"{s}{unit}"


def _wind(speed: Any, direction: Any) -> Optional[str]:
    parts: list[str] = []
    if not _is_empty_val(speed):
        parts.append(f"{speed} km/h")
    if not _is_empty_val(direction):
        parts.append(f"direction {direction}°")
    return " ".join(parts) if parts else None


def format_market_envelope(data: dict[str, Any]) -> str:
    ctx = data.get("query_context") or {}
    crop = ctx.get("crop") or "crop"
    district = ctx.get("district") or "district"
    state = ctx.get("state") or "state"
    target_date = ctx.get("target_date") or ""

    ag_block = data.get("agmarknet")
    enam_block = data.get("enam")
    has_ag = _market_source_has_rows(ag_block)
    has_enam = _market_source_has_rows(enam_block)

    # If both sources have no data, return empty string to trigger EMPTY_GDB_REPLY
    if not has_ag and not has_enam:
        return ""

    blocks: list[str] = []
    blocks.append(
        "Mandi prices\n"
        f"Crop: {crop} | District: {district} | State: {state}\n"
        f"Query date: {target_date}"
    )

    blocks.append(_format_agmarknet_block_text(ag_block))
    blocks.append(_format_enam_block_text(enam_block))
    return _join_market_blocks(blocks)


def _join_market_blocks(blocks: list[str]) -> str:
    parts = [b.strip() for b in blocks if b and b.strip()]
    return "\n\n".join(parts)


def _market_bullet(label: str, value: str) -> str:
    return f"• {label}: {value}"


def _market_bullet_plain(text: str) -> str:
    return f"• {text}"


def _agmarknet_modal_price(row: dict[str, Any]) -> Optional[str]:
    for key in ("as_on_price", "modal_price", "max_price", "price"):
        formatted = _format_rupees_per_quintal(row.get(key))
        if formatted:
            return formatted
    return None


def _format_agmarknet_block_text(block: Any) -> str:
    if not isinstance(block, dict):
        return "Agmarknet\n• Data unavailable"
    if block.get("error"):
        return f"Agmarknet\n• {block['error']}"
    if block.get("success") is False:
        err = block.get("error") or "Data unavailable"
        return f"Agmarknet\n• {err}"

    rows = block.get("data")
    if not isinstance(rows, list) or not rows:
        return "Agmarknet\n• No price data for this date."

    row_blocks: list[str] = []
    for row in _dedupe_market_rows(rows):
        row_blocks.append(_format_agmarknet_row_text(row))
    return "Agmarknet\n\n" + "\n\n".join(row_blocks)


def _format_agmarknet_row_text(row: dict[str, Any]) -> str:
    name = row.get("cmdt_name") or "Commodity"
    grp = row.get("cmdt_grp_name")
    commodity = f"{name} ({grp})" if grp and not _is_empty_val(grp) else name

    lines: list[str] = [_market_bullet("Commodity", commodity)]

    reported = row.get("reported_date")
    if not _is_empty_val(reported):
        lines.append(_market_bullet("Report date", str(reported)))

    modal = _agmarknet_modal_price(row)
    trend = row.get("trend")
    if modal:
        if not _is_empty_val(trend):
            lines.append(_market_bullet("Latest modal price", f"{modal} (trend: {trend})"))
        else:
            lines.append(_market_bullet("Latest modal price", modal))
    else:
        lines.append(
            _market_bullet_plain(
                "Latest modal price not reported for query date — see previous days below"
            )
        )

    msp = _format_rupees_per_quintal(row.get("msp_price"))
    if msp:
        lines.append(_market_bullet("MSP", msp))

    arrival = row.get("as_on_arrival")
    if not _is_empty_val(arrival):
        lines.append(_market_bullet("Arrival", f"{arrival} quintals"))

    history: list[str] = []
    prev1_price = _format_rupees_per_quintal(row.get("one_day_ago_price"))
    prev1_arr = row.get("one_day_ago_arrival")
    if prev1_price:
        if not _is_empty_val(prev1_arr):
            history.append(f"1 day ago — {prev1_price}, arrival {prev1_arr} quintals")
        else:
            history.append(f"1 day ago — {prev1_price}")

    prev2_price = _format_rupees_per_quintal(row.get("two_day_ago_price"))
    prev2_arr = row.get("two_day_ago_arrival")
    if prev2_price:
        if not _is_empty_val(prev2_arr):
            history.append(f"2 days ago — {prev2_price}, arrival {prev2_arr} quintals")
        else:
            history.append(f"2 days ago — {prev2_price}")

    if history:
        lines.append("Previous prices:")
        lines.extend(_market_bullet_plain(item) for item in history)

    return "\n".join(lines)


def _format_enam_block_text(block: Any) -> str:
    if not isinstance(block, dict):
        return "eNAM\n• Data unavailable"
    if block.get("error"):
        return f"eNAM\n• {block['error']}"
    if block.get("success") is False:
        err = block.get("error") or "Data unavailable"
        return f"eNAM\n• {err}"

    rows = block.get("data")
    if not isinstance(rows, list) or not rows:
        return "eNAM\n• No trade data for this date."

    row_blocks: list[str] = []
    for row in _dedupe_market_rows(rows):
        row_blocks.append(_format_enam_row_text(row))
    return "eNAM\n\n" + "\n\n".join(row_blocks)


def _format_enam_row_text(row: dict[str, Any]) -> str:
    lines = _format_enam_row(row)
    converted: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("- "):
            converted.append(_market_bullet_plain(stripped[2:]))
        elif stripped.startswith("  "):
            converted.append(f"• {stripped.strip()}")
        else:
            converted.append(stripped)
    return "\n".join(converted)


def _market_source_has_rows(block: Any) -> bool:
    if not isinstance(block, dict):
        return False
    if block.get("error"):
        return False
    if block.get("success") is False:
        return False
    rows = block.get("data")
    return isinstance(rows, list) and len(rows) > 0


def _dedupe_market_rows(rows: list[Any]) -> list[dict[str, Any]]:
    seen: set[tuple[str, ...]] = set()
    unique: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        key = tuple(str(row.get(k, "")).strip() for k in _MARKET_DEDUPE_KEYS)
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
        if len(unique) >= _MARKET_ROW_CAP:
            break
    return unique


def _format_rupees_per_quintal(value: Any) -> Optional[str]:
    if _is_empty_val(value):
        return None
    s = str(value).strip().replace(",", "")
    try:
        num = float(s)
        if num == int(num):
            formatted = f"{int(num):,}"
        else:
            formatted = f"{num:,.2f}".rstrip("0").rstrip(".")
    except ValueError:
        formatted = s
    return f"₹{formatted}/quintal"


def _format_agmarknet_block(block: Any) -> list[str]:
    return _format_agmarknet_block_text(block).split("\n")


def _format_enam_row(row: dict[str, Any]) -> list[str]:
    commodity = row.get("commodity_name") or row.get("cmdt_name") or "Commodity"
    apmc = row.get("apmc_name") or row.get("market_name")
    title = f"- {commodity}"
    if apmc and not _is_empty_val(apmc):
        title += f" at {apmc}"
    lines = [title]

    trade_date = row.get("trade_date") or row.get("reported_date") or row.get("date")
    if not _is_empty_val(trade_date):
        lines.append(f"  Date: {trade_date}")

    modal = _format_rupees_per_quintal(
        row.get("modal_price") or row.get("modal") or row.get("as_on_price")
    )
    min_p = _format_rupees_per_quintal(row.get("min_price") or row.get("min"))
    max_p = _format_rupees_per_quintal(row.get("max_price") or row.get("max"))

    if modal:
        lines.append(f"  Modal price: {modal}")
    if min_p or max_p:
        parts = []
        if min_p:
            parts.append(f"min {min_p}")
        if max_p:
            parts.append(f"max {max_p}")
        lines.append(f"  Price range: {', '.join(parts)}")

    if len(lines) == 1:
        for key, value in row.items():
            if _is_empty_val(value) or key in {
                "commodity_name", "cmdt_name", "apmc_name", "market_name",
                "trade_date", "reported_date", "date",
                "modal_price", "modal", "as_on_price", "min_price", "min", "max_price", "max",
            }:
                continue
            label = key.replace("_", " ")
            lines.append(f"  {label}: {value}")

    return lines