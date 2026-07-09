"""Deterministic human-readable formatting for specialist tool JSON (weather, etc.)."""

from __future__ import annotations

import json
import re
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

    if tool_name == "weather":
        try:
            data = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return text
        if isinstance(data, dict):
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

    return text


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