"""
IMD (India Meteorological Department) code lookup tables.

Source: IMD district warning / nowcast / rainfall / wind / present-weather
code references. Do not invent codes beyond this module.
"""

from __future__ import annotations

import re
from typing import Any, Optional

# ---------------------------------------------------------------------------
# 1) District warning codes
# ---------------------------------------------------------------------------

DISTRICT_WARNING_CODES: dict[int, str] = {
    1: "No Warning",
    2: "Heavy Rain",
    3: "Heavy Snow",
    4: "Thunderstorm & Lightning, Squall etc",
    5: "Hailstorm",
    6: "Dust Storm",
    7: "Dust Raising Winds",
    8: "Strong Surface Winds",
    9: "Heat Wave",
    10: "Hot Day",
    11: "Warm Night",
    12: "Cold Wave",
    13: "Cold Day",
    14: "Ground Frost",
    15: "Fog",
    16: "Very Heavy Rain",
    17: "Extremely Heavy Rain",
}

# ---------------------------------------------------------------------------
# 2) District warning colour codes
# ---------------------------------------------------------------------------

DISTRICT_WARNING_COLORS: dict[int, dict[str, str]] = {
    1: {"name": "Red", "hex": "#FF0000", "emoji": "🔴"},
    2: {"name": "Orange", "hex": "#FFA500", "emoji": "🟠"},
    3: {"name": "Yellow", "hex": "#FFFF00", "emoji": "🟡"},
    4: {"name": "Green", "hex": "#7CFC00", "emoji": "🟢"},
}

# ---------------------------------------------------------------------------
# 3) Nowcast warning categories (Cat1–Cat19)
# ---------------------------------------------------------------------------

NOWCAST_WARNING_CATEGORIES: dict[int, dict[str, str]] = {
    1: {
        "cat": "Cat1",
        "description": "No Weather",
        "color_name": "Green",
        "color_hex": "#008000",
    },
    2: {
        "cat": "Cat2",
        "description": "Light rain: < 5 mm/hr",
        "color_name": "Yellow",
        "color_hex": "#FFFF00",
    },
    3: {
        "cat": "Cat3",
        "description": "Light snow: < 5 cm/hr",
        "color_name": "Yellow",
        "color_hex": "#FFFF00",
    },
    4: {
        "cat": "Cat4",
        "description": "Light Thunderstorms with max surface wind speed < 40 kmph",
        "color_name": "Yellow",
        "color_hex": "#FFFF00",
    },
    5: {
        "cat": "Cat5",
        "description": "Slight dust storm: wind speed up to 41 kmph and visibility 500-1000 m",
        "color_name": "Yellow",
        "color_hex": "#FFFF00",
    },
    6: {
        "cat": "Cat6",
        "description": "Low cloud to ground Lightning probability (< 30%)",
        "color_name": "Yellow",
        "color_hex": "#FFFF00",
    },
    7: {
        "cat": "Cat7",
        "description": "Moderate rain: 5-15 mm/hr",
        "color_name": "Orange",
        "color_hex": "#FFA500",
    },
    8: {
        "cat": "Cat8",
        "description": "Moderate snow: 5-15 cm/hr",
        "color_name": "Orange",
        "color_hex": "#FFA500",
    },
    9: {
        "cat": "Cat9",
        "description": "Moderate Thunderstorms with max surface wind speed 41-61 kmph",
        "color_name": "Orange",
        "color_hex": "#FFA500",
    },
    10: {
        "cat": "Cat10",
        "description": "Moderate dust storm: wind speed 41-61 kmph and visibility 200-500 m",
        "color_name": "Orange",
        "color_hex": "#FFA500",
    },
    11: {
        "cat": "Cat11",
        "description": "Moderate cloud to ground Lightning probability (30-60%)",
        "color_name": "Orange",
        "color_hex": "#FFA500",
    },
    12: {
        "cat": "Cat12",
        "description": "Heavy rain: > 15 mm/hr",
        "color_name": "Red",
        "color_hex": "#FF0000",
    },
    13: {
        "cat": "Cat13",
        "description": "Heavy snow: > 15 cm/hr",
        "color_name": "Red",
        "color_hex": "#FF0000",
    },
    14: {
        "cat": "Cat14",
        "description": "Severe Thunderstorms with max surface wind speed 62-87 kmph",
        "color_name": "Red",
        "color_hex": "#FF0000",
    },
    15: {
        "cat": "Cat15",
        "description": "Very Severe Thunderstorms with max surface wind speed > 87 kmph",
        "color_name": "Red",
        "color_hex": "#FF0000",
    },
    30: {
        "cat": "Cat16",
        "description": "Other Warnings",
        "color_name": "Red",
        "color_hex": "#FF0000",
    },
    31: {
        "cat": "Cat17",
        "description": "Thunderstorms with Hail",
        "color_name": "Red",
        "color_hex": "#FF0000",
    },
    32: {
        "cat": "Cat18",
        "description": "Severe dust storm: wind speed > 61 kmph and visibility < 200 m",
        "color_name": "Red",
        "color_hex": "#FF0000",
    },
    33: {
        "cat": "Cat19",
        "description": "High cloud to ground Lightning probability (> 60%)",
        "color_name": "Red",
        "color_hex": "#FF0000",
    },
}

# ---------------------------------------------------------------------------
# 4) Rainfall categories (vs normal)
# ---------------------------------------------------------------------------

RAINFALL_CATEGORIES: dict[str, str] = {
    "LE": "Large Excess (60% or more)",
    "E": "Excess (20% to 59%)",
    "N": "Normal (-19% to 19%)",
    "D": "Deficient (-59% to -20%)",
    "LD": "Large Deficient (-99% to -60%)",
    "NR": "No Rain (-100%)",
    "ND": "No Data",
}

# ---------------------------------------------------------------------------
# 5) Wind direction codes (degrees → compass description)
# ---------------------------------------------------------------------------

WIND_DIRECTION_CODES: dict[int, str] = {
    0: "Calm",
    20: "North-northeasterly",
    50: "Northeasterly",
    70: "East-northeasterly",
    90: "Easterly",
    110: "East-southeasterly",
    140: "Southeasterly",
    160: "South-southeasterly",
    180: "Southerly",
    200: "South-southwesterly",
    230: "Southwesterly",
    250: "West-southwesterly",
    270: "Westerly",
    290: "West-northwesterly",
    320: "Northwesterly",
    340: "North-northwesterly",
    360: "Northerly",
}

# ---------------------------------------------------------------------------
# 6) Current / present weather codes (WMO / IMD 01–99)
# ---------------------------------------------------------------------------

CURRENT_WEATHER_CODES: dict[int, str] = {
    1: "Clouds generally dissolving or becoming less developed",
    2: "State of sky on the whole unchanged",
    3: "Clouds generally forming or developing",
    4: "Visibility reduced by smoke",
    5: "Haze",
    6: "Widespread dust in suspension in the air",
    7: "Dust or sand raised by wind",
    8: "Well-developed dust/sand whirl(s)",
    9: "Duststorm or sandstorm within sight",
    10: "Mist",
    11: "Patches of shallow fog/ice fog",
    12: "Continuous shallow fog/ice fog",
    13: "Lightning visible, no thunder heard",
    14: "Precipitation within sight, not reaching ground",
    15: "Precipitation within sight, reaching ground (> 5 km)",
    16: "Precipitation within sight, near but not at station",
    17: "Thunderstorm, no precipitation",
    18: "Squalls at or within sight",
    19: "Funnel cloud(s)",
    20: "Drizzle or snow grains not falling as showers",
    21: "Rain not falling as showers",
    22: "Snow not falling as showers",
    23: "Rain and snow / ice pellets type (a)",
    24: "Freezing drizzle / freezing rain",
    25: "Showers of rain",
    26: "Showers of snow, or rain and snow",
    27: "Showers of hail, or rain and hail",
    28: "Fog or ice fog",
    29: "Thunderstorm (with or without precipitation)",
    30: "Slight/moderate duststorm - decreased",
    31: "Slight/moderate duststorm - no change",
    32: "Slight/moderate duststorm - increased",
    33: "Severe duststorm - decreased",
    34: "Severe duststorm - no change",
    35: "Severe duststorm - increased",
    36: "Slight/moderate blowing snow low",
    37: "Heavy drifting snow low",
    38: "Slight/moderate blowing snow high",
    39: "Heavy drifting snow high",
    40: "Fog/ice fog at a distance",
    41: "Fog or ice fog in patches",
    42: "Fog/ice fog, sky visible, becoming thinner",
    43: "Fog/ice fog, sky invisible, becoming thinner",
    44: "Fog/ice fog, sky visible, no change",
    45: "Fog/ice fog, sky invisible, no change",
    46: "Fog/ice fog, sky visible, thicker",
    47: "Fog/ice fog, sky invisible, thicker",
    48: "Fog depositing rime, sky visible",
    49: "Fog depositing rime, sky invisible",
    50: "Drizzle, intermittent slight",
    51: "Drizzle, continuous slight",
    52: "Drizzle, intermittent moderate",
    53: "Drizzle, continuous moderate",
    54: "Drizzle, intermittent heavy",
    55: "Drizzle, continuous heavy",
    56: "Drizzle, freezing, slight",
    57: "Drizzle, freezing, moderate/heavy",
    58: "Drizzle and rain, slight",
    59: "Drizzle and rain, moderate/heavy",
    60: "Rain, intermittent slight",
    61: "Rain, continuous slight",
    62: "Rain, intermittent moderate",
    63: "Rain, continuous moderate",
    64: "Rain, intermittent heavy",
    65: "Rain, continuous heavy",
    66: "Rain, freezing, slight",
    67: "Rain, freezing, moderate/heavy",
    68: "Rain, or drizzle and snow, slight",
    69: "Rain, or drizzle and snow, moderate/heavy",
    70: "Intermittent snowflakes, slight",
    71: "Continuous snowflakes, slight",
    72: "Intermittent snowflakes, moderate",
    73: "Continuous snowflakes, moderate",
    74: "Intermittent snowflakes, heavy",
    75: "Continuous snowflakes, heavy",
    76: "Ice prisms",
    77: "Snow grains",
    78: "Isolated star-like snow crystals",
    79: "Ice pellets",
    80: "Rain shower(s), slight",
    81: "Rain shower(s), moderate or heavy",
    82: "Rain shower(s), violent",
    83: "Shower(s) of rain and snow, slight",
    84: "Shower(s) of rain and snow, moderate or heavy",
    85: "Snow shower(s), slight",
    86: "Snow shower(s), moderate or heavy",
    87: "Shower(s) of snow/ice pellets, slight",
    88: "Shower(s) of snow/ice pellets, moderate or heavy",
    89: "Shower(s) of hail without thunder, slight",
    90: "Shower(s) of hail without thunder, moderate or heavy",
    91: "Slight rain at observation; thunderstorm in preceding hour",
    92: "Moderate/heavy rain at observation; thunderstorm in preceding hour",
    93: "Slight snow/hail at observation; thunderstorm in preceding hour",
    94: "Moderate/heavy snow/hail at observation; thunderstorm in preceding hour",
    95: "Thunderstorm, slight/moderate, without hail",
    96: "Thunderstorm, slight/moderate, with hail",
    97: "Thunderstorm, heavy, without hail",
    98: "Thunderstorm combined with duststorm/sandstorm",
    99: "Thunderstorm, heavy, with hail",
}


# ---------------------------------------------------------------------------
# Helpers — resolve codes without inventing new meanings
# ---------------------------------------------------------------------------

_NO_WARNING_TOKENS = frozenset(
    {"", "NO_WARNING", "NONE", "NIL", "NA", "N/A", "NULL"}
)


def _as_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def describe_district_warning(code: Any) -> str:
    """Map one district warning code to its IMD description."""
    if code is None:
        return ""
    text = str(code).strip()
    if text.upper() in _NO_WARNING_TOKENS:
        return "No Warning"
    # Already human text (not a bare number)
    if not text.isdigit() and not (
        text.replace(".", "", 1).isdigit()
    ):
        return text
    num = _as_int(text)
    if num is None:
        return text
    return DISTRICT_WARNING_CODES.get(num, text)


def describe_district_warnings(value: Any) -> str:
    """Map one or more comma-separated district warning codes."""
    if value is None:
        return ""
    parts = [p.strip() for p in str(value).split(",") if p.strip()]
    if not parts:
        return ""
    return "; ".join(describe_district_warning(p) for p in parts)


def _district_color_info(code: Any) -> Optional[dict[str, str]]:
    """Resolve district colour code or name to the lookup entry."""
    if code is None:
        return None
    text = str(code).strip()
    if not text:
        return None
    lower = text.lower()
    for info in DISTRICT_WARNING_COLORS.values():
        if info["name"].lower() == lower:
            return info
    num = _as_int(text)
    if num is None:
        return None
    return DISTRICT_WARNING_COLORS.get(num)


def describe_district_warning_color(code: Any) -> str:
    """Map district warning colour code → emoji + name (farmer-facing)."""
    info = _district_color_info(code)
    if not info:
        text = "" if code is None else str(code).strip()
        return text
    return f"{info['emoji']} {info['name']}"


def describe_district_warning_color_detail(code: Any) -> str:
    """Map colour code → emoji + name + hex (for structured/debug fields)."""
    info = _district_color_info(code)
    if not info:
        text = "" if code is None else str(code).strip()
        return text
    return f"{info['emoji']} {info['name']} ({info['hex']})"


def describe_nowcast_category(code: Any) -> str:
    """Map nowcast Cat code → 'CatN — description (Color #hex)'."""
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    # Accept "Cat12" / "cat12"
    if text.lower().startswith("cat"):
        suffix = text[3:].strip()
        num = _as_int(suffix)
        if num is not None:
            # Cat index 1–19 → underlying code key
            cat_to_code = {
                1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
                10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15,
                16: 30, 17: 31, 18: 32, 19: 33,
            }
            mapped = cat_to_code.get(num)
            if mapped is not None:
                num = mapped
        else:
            num = None
    else:
        num = _as_int(text)

    if num is None:
        return text
    info = NOWCAST_WARNING_CATEGORIES.get(num)
    if not info:
        return text
    return (
        f"{info['cat']} — {info['description']} "
        f"({info['color_name']} {info['color_hex']})"
    )


def describe_rainfall_category(code: Any) -> str:
    """Map rainfall category letter code to description."""
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    key = text.upper()
    if key in RAINFALL_CATEGORIES:
        return RAINFALL_CATEGORIES[key]
    # Already expanded text from API — keep as-is
    return text


def describe_wind_direction(degrees: Any) -> str:
    """Map wind direction degrees to nearest IMD compass description."""
    if degrees is None:
        return ""
    text = str(degrees).strip()
    if not text:
        return ""
    num = _as_int(text)
    if num is None:
        return text
    if num == 0:
        return WIND_DIRECTION_CODES[0]
    # Normalize into 1..360 for nearest match (0/360 both Northerly/Calm handled)
    deg = num % 360
    if deg == 0:
        return WIND_DIRECTION_CODES[360]
    best_code = min(
        (c for c in WIND_DIRECTION_CODES if c != 0),
        key=lambda c: min(abs(c - deg), 360 - abs(c - deg)),
    )
    return WIND_DIRECTION_CODES[best_code]


def describe_current_weather(code: Any) -> str:
    """Map present-weather code 01–99 to description; pass through free text."""
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    num = _as_int(text)
    if num is not None and num in CURRENT_WEATHER_CODES:
        return CURRENT_WEATHER_CODES[num]
    return text


def format_day_warning_line(
    day_num: Any,
    warning: Any,
    color: Any = None,
) -> str:
    """Readable day warning line with coloured alert marker in the message."""
    warning_text = describe_district_warnings(warning) or "No Warning"
    info = _district_color_info(color)
    if info:
        # Lead with the actual colour so it is visible in chat/WhatsApp text.
        head = f"Day {day_num}: {info['emoji']} {info['name']} alert — {warning_text}"
    else:
        head = f"Day {day_num}: {warning_text}"
    bits = [head]
    if warning is not None and str(warning).strip() != "":
        bits.append(f"Warning code: {str(warning).strip()}")
    if color is not None and str(color).strip() != "":
        bits.append(f"Color code: {str(color).strip()}")
    return " | ".join(bits)


def enrich_station_fields(station: dict[str, Any]) -> dict[str, Any]:
    """Replace coded station fields with readable descriptions (keep raw *_code)."""
    out = dict(station)
    wind_deg = out.get("wind_direction_deg")
    if wind_deg is not None and str(wind_deg).strip() != "":
        out["wind_direction"] = describe_wind_direction(wind_deg)

    weather_code = out.get("weather_code")
    weather_message = out.get("weather_message")
    if weather_code is not None and str(weather_code).strip() != "":
        out["weather_code_raw"] = weather_code
        out["weather_description"] = describe_current_weather(weather_code)
        out["weather_message"] = out["weather_description"]
    elif weather_message is not None and str(weather_message).strip() != "":
        described = describe_current_weather(weather_message)
        if described != str(weather_message).strip():
            out["weather_code_raw"] = weather_message
            out["weather_description"] = described
            out["weather_message"] = described

    nowcast_code = out.get("nowcast_category_code")
    if nowcast_code is not None and str(nowcast_code).strip() != "":
        out["nowcast_category"] = describe_nowcast_category(nowcast_code)
    return out


def _match_warning_day_key(key: str) -> Optional[str]:
    """Return day number if key is a district warning field (Day_1 / day1_warning)."""
    k = str(key).strip()
    if re.search(r"color", k, re.I):
        return None
    m = re.match(r"^(?:Day_?|day_?)(\d+)(?:_?warning)?$", k, re.I)
    return m.group(1) if m else None


def _match_color_day_key(key: str) -> Optional[str]:
    """Return day number if key is a district colour field (Day1_Color / day1_color)."""
    m = re.match(r"^(?:Day_?|day_?)(\d+)_?color$", str(key).strip(), re.I)
    return m.group(1) if m else None


def enrich_warning_record(record: dict[str, Any]) -> dict[str, Any]:
    """Rewrite day warning/colour codes to descriptions; keep raw as *_code.

    Supports IMD shapes seen in production:
    - Day_1 / Day_2 … (warning codes)
    - Day1_Color / Day2_Color … (colour codes)
    - day1_warning / day1_color (alternate naming)
    """
    out = dict(record)
    days: dict[str, dict[str, Any]] = {}
    for key, value in list(record.items()):
        day_w = _match_warning_day_key(str(key))
        day_c = _match_color_day_key(str(key))
        if day_w:
            days.setdefault(day_w, {})["warning"] = value
            days[day_w]["warning_key"] = key
            out[f"{key}_code"] = value
            out[key] = describe_district_warnings(value)
        elif day_c:
            days.setdefault(day_c, {})["color"] = value
            days[day_c]["color_key"] = key
            out[f"{key}_code"] = value
            out[key] = describe_district_warning_color(value)

    readable_days = []
    for day in sorted(days, key=lambda d: int(d)):
        warning_raw = days[day].get("warning")
        color_raw = days[day].get("color")
        warning_desc = describe_district_warnings(warning_raw)
        color_desc = describe_district_warning_color(color_raw)
        summary = format_day_warning_line(day, warning_raw, color_raw)
        readable_days.append(
            {
                "day": int(day),
                "warning": warning_desc,
                "warning_code": warning_raw,
                "color": color_desc,
                "color_code": color_raw,
                "summary": summary,
            }
        )
    if readable_days:
        out["warnings_readable"] = readable_days
    return out


def enrich_rainfall_record(record: dict[str, Any]) -> dict[str, Any]:
    """Rewrite rainfall status/category letter codes to descriptions.

    Handles IMD keys such as Status, Category, Daily Category, Weekly Category,
    Cumulative Category, Monthly Category, etc.
    """
    out = dict(record)
    known = set(RAINFALL_CATEGORIES.keys())

    for key, value in list(record.items()):
        if value is None or str(value).strip() == "":
            continue
        key_l = str(key).lower().replace(" ", "_")
        if key_l.endswith("_code") or key_l.endswith("_code_raw"):
            continue
        # Match Status / Category / Daily Category / Weekly_Category / …
        if "category" not in key_l and "status" not in key_l:
            continue

        raw = str(value).strip()
        code = raw.upper()
        # Only rewrite when the value is an IMD letter code (do not invent).
        if code not in known:
            continue

        described = RAINFALL_CATEGORIES[code]
        out[f"{key}_code"] = raw
        out[key] = described
        if key_l in ("status", "category", "rf_status"):
            out["rainfall_category"] = described
    return out


def enrich_subdivision_warnings_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Enrich subdivision warning rows (warning + colour codes → text)."""
    out = dict(payload)
    rows = out.get("data")
    if not isinstance(rows, list):
        return out
    new_rows = []
    for row in rows:
        if not isinstance(row, dict):
            new_rows.append(row)
            continue
        row_out = dict(row)
        warnings = row_out.get("warnings")
        if isinstance(warnings, list):
            enriched = []
            for w in warnings:
                if not isinstance(w, dict):
                    enriched.append(w)
                    continue
                w_out = dict(w)
                if w_out.get("warning") is not None:
                    w_out["warning_code"] = w_out.get("warning")
                    w_out["warning"] = describe_district_warnings(w_out["warning"])
                if w_out.get("color") is not None:
                    w_out["color_code"] = w_out.get("color")
                    w_out["color"] = describe_district_warning_color(w_out["color"])
                w_out["summary"] = format_day_warning_line(
                    str(w_out.get("day", "")).replace("Day ", ""),
                    w_out.get("warning_code", w_out.get("warning")),
                    w_out.get("color_code", w_out.get("color")),
                )
                enriched.append(w_out)
            row_out["warnings"] = enriched
        new_rows.append(row_out)
    out["data"] = new_rows
    return out


def enrich_subdivision_rainfall_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Enrich subdivision rainfall distribution letter codes → text."""
    out = dict(payload)
    rows = out.get("data")
    if not isinstance(rows, list):
        return out
    new_rows = []
    for row in rows:
        if not isinstance(row, dict):
            new_rows.append(row)
            continue
        row_out = dict(row)
        forecast = row_out.get("forecast")
        if isinstance(forecast, list):
            enriched = []
            for day in forecast:
                if not isinstance(day, dict):
                    enriched.append(day)
                    continue
                d_out = dict(day)
                dist = d_out.get("distribution")
                if dist is not None and str(dist).strip() != "":
                    d_out["distribution_code"] = dist
                    d_out["distribution"] = describe_rainfall_category(dist)
                enriched.append(d_out)
            row_out["forecast"] = enriched
        new_rows.append(row_out)
    out["data"] = new_rows
    return out
