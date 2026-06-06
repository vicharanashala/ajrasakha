"""Deterministic human-readable formatting for specialist tool JSON (weather, etc.)."""

from __future__ import annotations

import json
import re
from typing import Any, Optional

_SUBDIVISION_LIST_CAP = 10


def format_tool_output(tool_name: str, raw_text: str) -> str:
    """Format tool output for farmer-facing assembly; non-weather prose passes through."""
    text = (raw_text or "").strip()
    if not text:
        return ""

    if tool_name != "weather":
        return text

    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return text

    if not isinstance(data, dict):
        return text

    return format_weather_envelope(data)


def format_weather_envelope(data: dict[str, Any]) -> str:
    if not data.get("success", True):
        err = data.get("error")
        if not err:
            result = data.get("result")
            if isinstance(result, dict):
                err = result.get("error")
        return f"Weather: {err or 'data unavailable'}"

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
    lines: list[str] = []
    for key, value in sorted(record.items()):
        if _is_empty_val(value):
            continue
        m = re.match(r"day(\d+)_(warning|color)", key, re.IGNORECASE)
        if m and m.group(2).lower() == "warning":
            day_num = m.group(1)
            color_key = f"day{day_num}_color"
            color = record.get(color_key) or record.get(color_key.lower())
            if color and not _is_empty_val(color):
                lines.append(f"- Day {day_num}: {value} ({color})")
            else:
                lines.append(f"- Day {day_num}: {value}")
    return lines


def _generic_record_lines(record: dict[str, Any]) -> list[str]:
    skip_keys = {k.lower() for k in record if re.match(r"day\d+_color", k, re.I)}
    lines: list[str] = []
    for key, value in record.items():
        if key.lower() in skip_keys:
            continue
        if _is_empty_val(value):
            continue
        label = key.replace("_", " ").strip()
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
