"""IMD / AWS code enrichment helpers built on ajrasakha.tools.weather.code lookups."""

from __future__ import annotations

import re
from typing import Any

from ajrasakha.tools.weather.code import (
    DISTRICT_WARNING_CODES,
    RAINFALL_CATEGORY_CODES,
    as_int_code,
    describe_current_weather,
    describe_district_warning_color,
    describe_district_warnings,
    describe_nowcast_category,
    describe_rainfall_category,
    describe_wind_direction,
)

__all__ = [
    "describe_current_weather",
    "describe_district_warning_color",
    "describe_district_warnings",
    "describe_nowcast_category",
    "describe_rainfall_category",
    "describe_wind_direction",
    "enrich_rainfall_record",
    "enrich_station_fields",
    "enrich_warning_record",
    "format_day_warning_line",
]


def enrich_station_fields(station: dict[str, Any] | None) -> dict[str, Any]:
    """Decode weather_code and wind_direction_code on a station dict."""
    if not isinstance(station, dict):
        return {}
    out = dict(station)

    wind_code = out.get("wind_direction_code")
    if wind_code is None or str(wind_code).strip() == "":
        wind_code = out.get("wind_direction_deg")
    if wind_code is not None and str(wind_code).strip() != "":
        out["wind_direction_code"] = wind_code
        out["wind_direction"] = describe_wind_direction(wind_code)

    code = out.get("weather_code")
    msg = out.get("weather_message")
    msg_text = str(msg).strip() if msg is not None else ""
    described = describe_current_weather(code) if code is not None else ""

    if described:
        out["weather_code_raw"] = str(code).strip()
        out["weather_description"] = described
        out["weather_message"] = msg_text or described
    elif code is not None and str(code).strip() != "":
        out["weather_code_raw"] = str(code).strip()
        if msg_text:
            alt = describe_current_weather(msg_text)
            if alt and alt != msg_text:
                out["weather_description"] = alt
                out["weather_message"] = alt
            else:
                out["weather_description"] = msg_text
                out["weather_message"] = msg_text
        else:
            out["weather_description"] = f"Weather code {str(code).strip()}"
    elif msg_text:
        alt = describe_current_weather(msg_text)
        if alt and alt != msg_text:
            out["weather_code_raw"] = msg_text
            out["weather_description"] = alt
            out["weather_message"] = alt
        else:
            out["weather_description"] = msg_text

    return out


def _warning_day_keys(record: dict[str, Any]) -> list[tuple[int, str, str]]:
    """Return (day_num, warning_key, color_key) tuples present in a warning record."""
    days: list[tuple[int, str, str]] = []
    for day in range(1, 8):
        w_std, c_std = f"day{day}_warning", f"day{day}_color"
        w_imd, c_imd = f"Day_{day}", f"Day{day}_Color"
        if w_std in record or c_std in record:
            days.append((day, w_std, c_std))
        elif w_imd in record or c_imd in record:
            days.append((day, w_imd, c_imd))
    return days


def format_day_warning_line(day: int, warning_code: Any, color_code: Any) -> str:
    warning_text = describe_district_warnings(warning_code)
    color_text = describe_district_warning_color(color_code)
    if "Red" in color_text:
        sev = "🔴 Red alert"
    elif "Orange" in color_text:
        sev = "🟠 Orange alert"
    elif "Yellow" in color_text:
        sev = "🟡 Yellow alert"
    else:
        sev = "Green (No Warning)"
    return (
        f"Day {day}: {warning_text} | {sev} | "
        f"Warning code: {warning_code} | Color code: {color_code}"
    )


def enrich_warning_record(record: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(record, dict):
        return {}
    out = dict(record)
    readable: list[dict[str, Any]] = []

    for day, w_key, c_key in _warning_day_keys(out):
        w_raw = out.get(w_key)
        c_raw = out.get(c_key)
        if w_raw is not None and str(w_raw).strip() != "":
            out[w_key] = describe_district_warnings(w_raw)
            out[f"{w_key}_code"] = str(w_raw).strip()
        if c_raw is not None and str(c_raw).strip() != "":
            out[c_key] = describe_district_warning_color(c_raw)
            out[f"{c_key}_code"] = str(c_raw).strip()
        if w_raw is not None or c_raw is not None:
            summary = format_day_warning_line(day, w_raw, c_raw)
            readable.append(
                {
                    "day": day,
                    "warning_code": str(w_raw).strip() if w_raw is not None else None,
                    "color_code": str(c_raw).strip() if c_raw is not None else None,
                    "summary": summary,
                }
            )

    if readable:
        out["warnings_readable"] = readable
    return out


_RAINFALL_CATEGORY_FIELD_RE = re.compile(r"^(Daily|Weekly|Cumulative|Monthly)\s+Category$", re.I)


def enrich_rainfall_record(record: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(record, dict):
        return {}
    out = dict(record)
    for key, val in list(out.items()):
        if val is None or str(val).strip() == "":
            continue
        if key in RAINFALL_CATEGORY_CODES or key == "Status":
            code = str(val).strip()
            label = describe_rainfall_category(code)
            out[key] = label
            out[f"{key}_code"] = code
        elif _RAINFALL_CATEGORY_FIELD_RE.match(key):
            code = str(val).strip()
            out[key] = describe_rainfall_category(code)
            out[f"{key}_code"] = code
    if "Status" in out and "Status_code" not in out and record.get("Status") is not None:
        out["Status_code"] = str(record.get("Status")).strip()
    if "Status" in out:
        out["rainfall_category"] = out["Status"]
    return out
