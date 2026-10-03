# ajrasakha/agents/weather_farmer_answer.py
# Farmer-friendly rendering of weather tool results.
#
# Builds a short, query-aware markdown answer straight from the weather tool JSON.
# Only values present in the tool result are shown; values are never rounded,
# converted, or invented. Internal details (timeframe codes, field names, tool names)
# never reach the farmer.

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Optional

FARMER_WEATHER_ANSWER_PROMPT = """You are AjraSakha, helping an Indian farmer understand weather information.
You receive the farmer's question and a technical weather brief from a weather service.
Rewrite it as a short, friendly answer.

DATA RULES (never break these):
- Use ONLY values that appear in the brief. Copy numbers exactly; do not round, convert, or estimate.
- Never add rainfall, wind, UV, forecasts, alerts, or crop advice that the brief does not contain.
- Skip any field that is missing, empty, "N/A" or "None".

HIDE INTERNAL DETAILS:
- No field names (snake_case), timeframe codes such as "specific_target_date", tool/API/MCP/server names,
  raw codes, "Summary:" labels, or JSON.
- Do not repeat administrative names: say "Bathinda", not "Bathinda, Bathinda Tahsil, Bathinda".

FORMAT:
- Start with "📍 **<place>**".
- Answer the farmer's actual question first (a temperature question starts with the current temperature).
- Then short bullets, e.g. "- 🌡️ Temperature: **30.2°C**", "- 🥵 Feels like: **32.4°C**",
  "- 🌡️ Today's range: **22.7°C – 36.6°C**", "- 💧 Humidity: **56%**", "- ☀️ Condition: **Clear**".
  Keep current temperature, feels-like, and the min–max range clearly separate.
- Write dates as "30 September", not "2026-09-30". Use °C.
- Use plain weather words: "Clear Sky" → "Clear", "Mainly Clear sky" → "Mostly clear",
  "Partly Cloudy" → "Partly cloudy", "Overcast" → "Cloudy".
- Do not repeat the same fact twice.
- Add a short "🌾 **For Farmers**" note (1–2 sentences) only if the farmer asks about farming and the brief
  gives a clear basis (heat, cold, rain, or a warning). Never advise on irrigation, spraying, fertilizer, or disease.
- End with "**Source:** <source>" when the brief names one, then, if given, the station on its own line:
  "Weather station: <name>, approximately <N> km away."
- Return ONLY the answer.
"""

_EMPTY = {"", "n/a", "na", "none", "null", "nan", "-", "--"}

# Tool-side defaults that mean "no real description" — never shown to the farmer.
_PLACEHOLDER_CONDITIONS = {
    "normal weather", "normal / clear sky", "observed weather", "observed temperature",
    "observed rainfall", "rainfall expected", "no weather", "no data",
}

_CONDITION_REWRITES = [
    (r"\bmainly clear sky\b", "mostly clear"),
    (r"\bmainly clear\b", "mostly clear"),
    (r"\bgenerally cloudy sky\b", "mostly cloudy"),
    (r"\bgenerally cloudy\b", "mostly cloudy"),
    (r"\bpartly cloudy sky\b", "partly cloudy"),
    (r"\bcloudy sky\b", "cloudy"),
    (r"\bclear sky\b", "clear"),
    (r"\bovercast sky\b", "cloudy"),
    (r"\bovercast\b", "cloudy"),
    (r"^mist$", "misty"),
    (r"^haze$", "hazy"),
    (r"^fog$", "foggy"),
]

_STATION_ACRONYMS = {"AMFU", "DAMU", "AWS", "ARG", "IMD", "KVK", "AGRO", "AAS", "PAU", "IARI", "ICAR", "HQ", "RS"}

_ADMIN_PART_RE = re.compile(
    r"\b(tahsil|tehsil|taluk|taluka|mandal|block|sub-?district|subdivision|division|circle)\b", re.I
)

_INDIAN_STATES = {
    "kerala", "tamil nadu", "karnataka", "andhra pradesh", "telangana", "maharashtra", "gujarat",
    "punjab", "haryana", "uttar pradesh", "bihar", "west bengal", "odisha", "rajasthan",
    "madhya pradesh", "assam", "goa", "himachal pradesh", "uttarakhand", "jharkhand", "chhattisgarh",
    "tripura", "meghalaya", "manipur", "nagaland", "mizoram", "sikkim", "arunachal pradesh", "delhi",
    "jammu and kashmir", "jammu & kashmir", "ladakh", "puducherry", "andaman and nicobar islands",
    "andaman and nicobar", "chandigarh", "dadra and nagar haveli and daman and diu", "lakshadweep",
}

_SEVERITY_STYLE = {
    "red": ("🔴", "Red alert"),
    "orange": ("🟠", "Orange alert"),
    "yellow": ("🟡", "Yellow alert"),
}

_FOCUS_KEYWORDS = {
    "temperature": ("temperature", "temp", "garmi", "thand", "hot", "cold", "heat", "degree", "celsius", "feels like", "feel like", "frost"),
    "humidity": ("humidity", "humid", "moisture", "nami"),
    "rain": ("rain", "barish", "baarish", "shower", "monsoon", "precipitation", "drizzle"),
    "general": ("weather", "mausam", "forecast", "climate", "condition", "sky", "cloud", "sunny", "fog", "mist"),
    "farming": ("farm", "crop", "field", "sow", "harvest", "spray", "irrigat", "kheti", "fasal", "agricultur", "plough", "plow", "cultivat"),
    "stations": ("nearby", "station", "radius", "nearest"),
}


@dataclass
class _Day:
    day: Optional[date]
    condition: Optional[str] = None
    min_temp: Optional[str] = None
    max_temp: Optional[str] = None
    rain: Optional[str] = None
    humidity_morning: Optional[str] = None
    humidity_evening: Optional[str] = None
    rain_outlook: Optional[str] = None  # tool's plain-language rain likelihood, e.g. "🌦️ Good chance of rain — ..."


@dataclass
class _Current:
    temperature: Optional[str] = None
    feels_like: Optional[str] = None
    humidity: Optional[str] = None
    condition: Optional[str] = None
    rain_24h: Optional[str] = None

    def has_any(self) -> bool:
        return any((self.temperature, self.feels_like, self.humidity, self.condition, self.rain_24h))


@dataclass
class _View:
    kind: str
    place: Optional[str] = None
    current: Optional[_Current] = None
    days: list[_Day] = field(default_factory=list)
    is_forecast_window: bool = False
    notices: list[str] = field(default_factory=list)
    has_data_notice: bool = False  # a notice that answers the question by itself ("records not available")
    rain_stats: list[tuple[str, Optional[str], Optional[str], Optional[str], Optional[str]]] = field(default_factory=list)
    monsoon: bool = False
    alerts: list[tuple[Optional[date], str, str]] = field(default_factory=list)
    state_alerts: Optional[tuple[Any, Any, list[tuple[str, str, str]]]] = None
    nowcast: dict[str, Any] = field(default_factory=dict)
    nearby: list[dict[str, Any]] = field(default_factory=list)
    station: Optional[str] = None
    station_km: Optional[str] = None
    sources: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Small value helpers
# ---------------------------------------------------------------------------

def _v(value: Any) -> Optional[str]:
    """String form of a present scalar value, else None."""
    if value is None or isinstance(value, (dict, list, bool)):
        return None
    s = str(value).strip().strip("'\"").strip()
    return None if s.lower() in _EMPTY else s


def _first(*values: Any) -> Optional[str]:
    for value in values:
        s = _v(value)
        if s is not None:
            return s
    return None


def _bare(value: Any) -> Optional[str]:
    """Drop a trailing unit (°C, %, mm) but keep the number exactly as given."""
    s = _v(value)
    if s is None:
        return None
    s = re.sub(r"\s*(°\s*C|℃|%|mm)\s*$", "", s, flags=re.I).strip()
    return s or None


def _num(value: Optional[str]) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _c(value: Optional[str]) -> str:
    return f"{value}°C"


def _temp_range(lo: Optional[str], hi: Optional[str]) -> Optional[str]:
    if lo and hi:
        return f"{_c(lo)} – {_c(hi)}"
    if hi:
        return f"up to {_c(hi)}"
    if lo:
        return f"from {_c(lo)}"
    return None


def _rain_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    upper = value.upper()
    if upper == "NIL":
        return "Nil (no rain)"
    if upper in {"TRACE", "TR"}:
        return "Trace (very light)"
    return f"{value} mm"


def _rain_positive(value: Optional[str]) -> bool:
    """True when a rain amount is worth mentioning outside rain-focused answers."""
    if value is None or value.upper() == "NIL":
        return False
    n = _num(value)
    return n is None or n > 0


def _parse_date(value: Any) -> Optional[date]:
    s = _v(value)
    if not s:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%Y-%m-%d").date()
    except ValueError:
        return None


def _nice_date(d: date, today: date) -> str:
    text = f"{d.day} {d.strftime('%B')}"
    return text if d.year == today.year else f"{text} {d.year}"


def _short_day(d: Optional[date], today: date) -> str:
    if d is None:
        return "Today"
    short = f"{d.day} {d.strftime('%b')}"
    delta = (d - today).days
    if delta == 0:
        return f"Today, {short}"
    if delta == 1:
        return f"Tomorrow, {short}"
    if delta == -1:
        return f"Yesterday, {short}"
    return f"{d.strftime('%a')}, {short}"


def _day_name(d: Optional[date], today: date) -> str:
    """'Today' / 'Tomorrow' / 'Yesterday' / 'Monday' for headings."""
    if d is None:
        return "Today"
    delta = (d - today).days
    return {0: "Today", 1: "Tomorrow", -1: "Yesterday"}.get(delta, d.strftime("%A"))


def _day_heading(d: Optional[date], today: date) -> str:
    if d is None:
        return "Today's Weather"
    name = _day_name(d, today)
    nice = _nice_date(d, today)
    if name in {"Today", "Tomorrow", "Yesterday"}:
        return f"{name}'s Weather — {nice}"
    return f"Weather on {name}, {nice}"


def _when(d: Optional[date], today: date) -> str:
    if d is None or d == today:
        return " today"
    if (d - today).days == 1:
        return " tomorrow"
    if (d - today).days == -1:
        return " yesterday"
    return f" on {_nice_date(d, today)}"


def natural_condition(raw: Any) -> Optional[str]:
    """'Mainly Clear sky' → 'Mostly clear'; placeholders → None."""
    s = _v(raw)
    if not s:
        return None
    s = re.sub(r"\s*\((?:code|Code)\s*[^)]*\)\s*$", "", s).strip()
    low = re.sub(r"\s+", " ", s.lower())
    if low in _PLACEHOLDER_CONDITIONS or low.startswith("observed rainfall"):
        return None
    for pattern, repl in _CONDITION_REWRITES:
        low = re.sub(pattern, repl, low)
    low = low.strip(" .")
    return low[:1].upper() + low[1:] if low else None


def _condition_emoji(condition: Optional[str]) -> str:
    t = (condition or "").lower()
    if any(k in t for k in ("thunder", "lightning")):
        return "⛈️"
    if any(k in t for k in ("rain", "shower", "drizzle")):
        return "🌧️"
    if "snow" in t:
        return "🌨️"
    if any(k in t for k in ("fog", "mist", "haze", "hazy", "smoke", "dust")):
        return "🌫️"
    if "partly cloudy" in t:
        return "⛅"
    if "cloud" in t:
        return "☁️"
    if "mostly clear" in t:
        return "🌤️"
    if any(k in t for k in ("clear", "sunny")):
        return "☀️"
    return "🌤️"


def _mentions_rain(condition: Optional[str]) -> bool:
    t = (condition or "").lower()
    return any(k in t for k in ("rain", "shower", "drizzle", "thunder"))


def _pretty_station(name: Any) -> Optional[str]:
    """'BHATINDA_AMFU' → 'Bhatinda AMFU'; mixed-case names are kept as given."""
    s = _v(name)
    if not s:
        return None
    if "_" not in s and not s.isupper():
        return s
    words = [w for w in re.split(r"[_\s]+", s) if w]
    return " ".join(w.upper() if w.upper() in _STATION_ACRONYMS else w.capitalize() for w in words)


def _km(value: Any) -> Optional[str]:
    s = _bare(value)
    n = _num(s)
    if n is None or n <= 0.5:
        return None
    return s[:-2] if s.endswith(".0") else s


def _short_place(raw: Any) -> Optional[str]:
    """'Bathinda, Bathinda Tahsil, Bathinda, Punjab, 151001, India' → 'Bathinda'."""
    s = _v(raw)
    if not s or s.lower() == "location":
        return None
    parts = []
    for part in s.split(","):
        p = part.strip()
        if not p or p.lower() in {"india", "location"} or p.lower() in _INDIAN_STATES or re.fullmatch(r"\d{3,}", p):
            continue
        parts.append(p)
    if not parts:
        # Only a state name was given.
        first = s.split(",")[0].strip()
        return first or None
    head = parts[0]
    district_like = [p for p in parts[1:] if not _ADMIN_PART_RE.search(p)]
    if district_like and district_like[-1].lower() != head.lower():
        return f"{head}, {district_like[-1]}"
    return head


def question_focus(query: str) -> set[str]:
    q = (query or "").lower()
    return {
        topic for topic, words in _FOCUS_KEYWORDS.items()
        if any(re.search(rf"\b{re.escape(w)}", q) for w in words)
    }


# ---------------------------------------------------------------------------
# Extraction: tool JSON → _View
# ---------------------------------------------------------------------------

def _rain_outlook(value: Any) -> Optional[str]:
    s = _v(value)
    return None if not s or "not available" in s.lower() else s


def _day_from_item(item: Any, today: date) -> Optional[_Day]:
    if not isinstance(item, dict):
        return None
    d = _Day(
        day=_parse_date(item.get("date")),
        condition=natural_condition(_first(
            item.get("forecast"), item.get("forecast_condition"), item.get("weather_condition"),
            item.get("forecast_text"), item.get("weather_description"),
        )),
        min_temp=_bare(_first(
            item.get("forecast_min_temp"), item.get("forecast_min_temp_c"), item.get("min_temp"),
            item.get("min_temp_c"), item.get("observed_min_temp"), item.get("observed_min_temp_c"),
        )),
        max_temp=_bare(_first(
            item.get("forecast_max_temp"), item.get("forecast_max_temp_c"), item.get("max_temp"),
            item.get("max_temp_c"), item.get("observed_max_temp"), item.get("observed_max_temp_c"),
        )),
        rain=_bare(_first(
            item.get("observed_past_24hrs_rainfall_mm"), item.get("observed_past_24hrs_rainfall"),
            item.get("observed_rainfall_mm"), item.get("past_24hrs_rainfall"),
        )),
        humidity_morning=_bare(item.get("humidity_0830")),
        humidity_evening=_bare(item.get("humidity_1730")),
    )
    # The tool also derives a likelihood from its "Rainfall Expected" placeholder; trust it only
    # when backed by IMD distribution data or a real forecast text.
    if _v(item.get("_raw_distribution")) or d.condition:
        d.rain_outlook = _rain_outlook(item.get("rain_likelihood"))
    if d.day is None and _v(item.get("day")) and str(item.get("day")).isdigit():
        d.day = today + timedelta(days=int(item["day"]) - 1)
    return d


def _days_from(items: Any, today: date) -> list[_Day]:
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        return []
    return [d for d in (_day_from_item(i, today) for i in items) if d is not None]


_MAX_STATION_KM = 50.0  # same radius the weather tools use for "active station nearby"


def _station_obs(data: dict[str, Any]) -> tuple[dict[str, Any], Optional[str], Optional[str]]:
    """Live reading from the closest station within 50 km that actually reported one.

    Candidates: IMD current_wx, the nearest live AWS, and the nearest-station context. The
    current/forecast tool attaches IMD current_wx at any distance (seen live: 104 km away),
    so far stations are ignored rather than shown as the farmer's local weather.
    """
    w_data = data.get("weather_data") if isinstance(data.get("weather_data"), dict) else {}
    st_info = data.get("nearest_station_info") if isinstance(data.get("nearest_station_info"), dict) else {}
    blocks = [
        (data.get("imd_current_weather") or w_data.get("imd_current_weather"), "station", "distance_km"),
        (data.get("nearest_live_aws_station"), "station", "distance_km"),
        ({"success": True, **st_info}, "station_details", "distance_from_requested_place_km"),
    ]
    candidates = []
    for block, station_key, dist_key in blocks:
        if not (isinstance(block, dict) and block.get("success") and isinstance(block.get(station_key), dict)):
            continue
        station = block[station_key]
        if _v(station.get("temperature_c")) is None and _v(station.get("humidity_pct")) is None:
            continue  # station without a reading (e.g. Annam context carries only name/coords)
        dist = _num(_bare(block.get(dist_key)))
        if dist is not None and dist > _MAX_STATION_KM:
            continue
        candidates.append((dist if dist is not None else float("inf"), station, block.get(dist_key)))
    if not candidates:
        return {}, None, None
    _, station, dist = min(candidates, key=lambda c: c[0])  # stable: IMD wins ties, like the tool
    return station, station.get("name"), dist


def _current_from_obs(obs: dict[str, Any]) -> _Current:
    return _Current(
        temperature=_bare(obs.get("temperature_c")),
        feels_like=_bare(obs.get("feel_like_c")),
        humidity=_bare(obs.get("humidity_pct")),
        condition=natural_condition(_first(obs.get("weather_description"), obs.get("weather_message"))),
        rain_24h=_bare(obs.get("past_24hrs_rainfall_mm")),
    )


_SUMMARY_PATTERNS = {
    "temperature": r"(?:Observed Temperature:|station temperature is)\s*(-?\d+(?:\.\d+)?)\s*°C",
    "feels_like": r"Feel-like:\s*(-?\d+(?:\.\d+)?)\s*°C",
    "humidity": r"Humidity(?: is|:)\s*(\d+(?:\.\d+)?)\s*%",
    "condition": r"Weather Condition:\s*'([^']+)'",
}


def _fill_from_summary(current: _Current, summary: Any) -> None:
    """Fill missing current fields from the tool's own summary sentence (temperature tool)."""
    if not isinstance(summary, str):
        return
    for attr, pattern in _SUMMARY_PATTERNS.items():
        if getattr(current, attr):
            continue
        m = re.search(pattern, summary, re.I)
        if m:
            value = m.group(1)
            setattr(current, attr, natural_condition(value) if attr == "condition" else value)


def _clean_notice(notice: Any, today: date) -> Optional[str]:
    s = _v(notice)
    if not s:
        return None
    low = s.lower()
    m = re.search(r"requested date \((\d{4}-\d{2}-\d{2})\)", s)
    d = _parse_date(m.group(1)) if m else None
    when = f" for {_nice_date(d, today)}" if d else ""
    # Checked before the 7-day rule: these notices also mention "up to 7 days" (of station history).
    if "not available" in low and any(k in low for k in ("historical", "history", "archives")):
        text = f"Past weather records{when} are not available for this place."
        if "past 24 hours" in low:
            text += " Showing the rain recorded in the last 24 hours."
        return text
    if "no active imd weather station found within" in low:
        return "There is no active weather station within 50 km of this place, so live readings are not available."
    if "7 days" in low:
        return "IMD gives daily forecasts only up to 7 days ahead. Showing the forecast that is available."
    if d and "not available" in low:
        return f"Weather data{when} is not available. Showing today's weather instead."
    return None


def _collect_notices(view: _View, today: date, *candidates: Any) -> None:
    for c in candidates:
        n = _clean_notice(c, today)
        if n and n not in view.notices:
            view.notices.append(n)


def _target_payload(
    block: Any, list_key: str, today: date, fallback_key: Optional[str] = None
) -> tuple[list[_Day], Any]:
    """Days and notice from a target-date block (single item, fallback, or 7-day trend)."""
    if not isinstance(block, dict):
        return [], None
    notice = block.get("notice")
    if list_key in block:
        return _days_from(block.get(list_key), today), notice
    if fallback_key and isinstance(block.get(fallback_key), dict):
        return _days_from(block[fallback_key], today), notice
    return _days_from(block, today), notice


def _extract_weather(data: dict[str, Any], view: _View, today: date) -> None:
    w = data.get("weather_data") if isinstance(data.get("weather_data"), dict) else {}
    _collect_notices(view, today, w.get("notice"), data.get("notice"))
    if "target_date_weather" in w:
        days, notice = _target_payload(
            w["target_date_weather"], "available_7day_forecast_trend", today, "fallback_today_weather"
        )
        _collect_notices(view, today, notice)
        view.days = days
    elif w.get("forecast_list"):
        view.days = _days_from(w["forecast_list"], today)
        view.is_forecast_window = True
    elif w.get("historical_weather_range"):
        view.days = _days_from(w["historical_weather_range"], today)
    elif isinstance(w.get("today_weather"), dict) and w["today_weather"]:
        tw = w["today_weather"]
        view.days = _days_from(tw, today)
        if view.days and view.days[0].day is None:
            view.days[0].day = today
        if str((tw.get("data_source") or "")).lower().startswith("annam"):
            # Annam ground sensor reading is the live observation.
            view.current = _Current(
                temperature=_bare(_first(tw.get("current_temp_c"), tw.get("observed_max_temp"), tw.get("observed_min_temp"))),
                humidity=_bare(_first(tw.get("humidity_pct"), tw.get("humidity_0830"), tw.get("humidity_1730"))),
                rain_24h=_bare(tw.get("past_24hrs_rainfall")),
            )


def _extract_temperature(data: dict[str, Any], view: _View, today: date) -> None:
    t = data.get("temperature_timeframe_data") if isinstance(data.get("temperature_timeframe_data"), dict) else {}
    _collect_notices(view, today, t.get("notice"))
    if "target_date_temperature" in t:
        days, notice = _target_payload(t["target_date_temperature"], "available_7day_temperature_forecast_trend", today)
        _collect_notices(view, today, notice)
        view.days = days
    elif t.get("temperature_forecast_list"):
        view.days = _days_from(t["temperature_forecast_list"], today)
        view.is_forecast_window = True
    elif t.get("temperature_range"):
        view.days = _days_from(t["temperature_range"], today)
    elif isinstance(t.get("today_temperature"), dict):
        tt = t["today_temperature"]
        view.days = _days_from(tt, today)
        if view.days:
            view.days[0].day = view.days[0].day or today
            view.days[0].condition = None  # current condition is shown instead
        view.current = _Current(
            temperature=_bare(tt.get("observed_temp_c")),
            feels_like=_bare(tt.get("feel_like_c")),
            humidity=_bare(tt.get("humidity_pct")),
            condition=natural_condition(tt.get("weather_condition")),
        )


def _extract_rainfall(data: dict[str, Any], view: _View, today: date) -> None:
    r = data.get("results") if isinstance(data.get("results"), dict) else {}
    _collect_notices(view, today, r.get("notice"))
    target = r.get("rainfall_target_date") or r.get("target_date_rainfall")
    if isinstance(target, dict):
        trend_key = next(
            (k for k in ("available_7day_rainfall_trend", "available_7day_rainfall_forecast_trend") if k in target),
            "available_7day_rainfall_trend",
        )
        days, notice = _target_payload(target, trend_key, today)
        _collect_notices(view, today, notice)
        view.days = days
    elif r.get("rainfall_range"):
        view.days = _days_from(r["rainfall_range"], today)
    elif r.get("rainfall_forecast_list"):
        view.days = _days_from(r["rainfall_forecast_list"], today)
        view.is_forecast_window = True
    elif isinstance(r.get("today_rainfall"), dict):
        tr = r["today_rainfall"]
        view.days = [_Day(
            day=_parse_date(tr.get("date")) or today,
            rain=_bare(tr.get("observed_past_24hrs_rainfall")),
            condition=natural_condition(tr.get("forecast")),
        )]
        if _v(tr.get("_raw_distribution")) or view.days[0].condition:
            view.days[0].rain_outlook = _rain_outlook(tr.get("rain_likelihood"))
        stat = (
            "District rainfall today",
            _bare(tr.get("district_daily_actual_mm")),
            _bare(tr.get("district_daily_normal_mm")),
            _bare(tr.get("departure_pct")),
            _v(tr.get("category_description")),
        )
        if stat[1]:
            view.rain_stats.append(stat)
        weekly = _bare(tr.get("weekly_cumulative_mm"))
        if weekly:
            view.rain_stats.append(("District rainfall this week", weekly, None, None, None))

    # When no daily rows came back (e.g. past records unavailable), the tool still reports the last 24 hours.
    recent = _bare(r.get("observed_past_24hrs_rainfall_mm"))
    if recent is not None and not any(d.rain is not None or d.condition or d.rain_outlook for d in view.days):
        view.days = [_Day(day=today, rain=recent)]

    rec = r.get("district_cumulative_monsoon_rainfall") or r.get("district_rainfall_departures")
    if isinstance(rec, dict) and rec:
        view.monsoon = "district_cumulative_monsoon_rainfall" in r
        periods = [("Cumulative", "Monsoon season so far")] if view.monsoon else [
            ("Daily", "Last 24 hours"), ("Weekly", "This week"), ("Monthly", "This month"), ("Cumulative", "Season so far"),
        ]
        for key, label in periods:
            actual = _bare(rec.get(f"{key} Actual"))
            if actual is None:
                continue
            view.rain_stats.append((
                label,
                actual,
                _bare(rec.get(f"{key} Normal")),
                _bare(rec.get(f"{key} Departure Per")),
                _v(rec.get(f"{key} Category Description")),
            ))


def _extract_location(data: dict[str, Any], view: _View, today: date) -> None:
    det = data.get("weather_details") if isinstance(data.get("weather_details"), dict) else {}
    fc = det.get("forecast") if isinstance(det.get("forecast"), dict) else {}
    today_fc = fc.get("today") if isinstance(fc.get("today"), dict) else {}
    view.days = _days_from(today_fc, today)
    if view.days:
        view.days[0].day = view.days[0].day or today
    upcoming = fc.get("forecast") if isinstance(fc.get("forecast"), list) else []
    view.days += [d for d in _days_from(upcoming, today) if d.day is None or d.day > today]
    nearby = data.get("nearby_stations_within_radius")
    if isinstance(nearby, dict):
        nearby = nearby.get("nearby_stations") or nearby.get("stations")
    if isinstance(nearby, list):
        view.nearby = [s for s in nearby if isinstance(s, dict)]


def _extract_alerts(data: dict[str, Any], view: _View, today: date) -> None:
    for w in data.get("district_5day_warnings") or []:
        if not isinstance(w, dict):
            continue
        m = re.search(r"(\d+)", str(w.get("day") or ""))
        d = today + timedelta(days=int(m.group(1)) - 1) if m else None
        view.alerts.append((d, str(w.get("severity") or ""), str(w.get("warning_description") or "")))


def _extract_state_alerts(data: dict[str, Any], view: _View) -> None:
    rows = []
    for item in data.get("district_alerts_list") or []:
        if isinstance(item, dict) and item.get("district"):
            desc = item.get("warning_description") or item.get("today_warning") or ""
            rows.append((str(item["district"]), str(item.get("severity") or ""), str(desc)))
    view.state_alerts = (data.get("districts_under_alert_count"), data.get("total_districts_in_state"), rows)


_NOWCAST_DEFAULT_MESSAGES = {"no active severe convective warnings for this station."}


def _extract_nowcast(data: dict[str, Any], view: _View) -> None:
    cats = []
    for c in data.get("active_warnings") or data.get("active_nowcast_categories") or []:
        if isinstance(c, dict) and str(c.get("category_code")) != "1" and _v(c.get("category_description")):
            cats.append(str(c["category_description"]))
        elif isinstance(c, str) and _v(c):
            cats.append(c)
    msg = _v(data.get("nowcast_message") or data.get("consolidated_message"))
    if msg and msg.lower() in _NOWCAST_DEFAULT_MESSAGES:
        msg = None
    summary = str(data.get("summary") or "")
    hours = _v(data.get("hours_ahead"))
    if not hours:
        m = re.search(r"next (\d) hours", summary, re.I)
        hours = m.group(1) if m else None
    view.nowcast = {
        "severity": str(data.get("overall_severity") or data.get("severity_color") or ""),
        "valid_upto": _v(data.get("valid_upto")),
        "categories": cats,
        "message": msg if msg and re.search(r"[A-Za-z]{3}", msg) else None,
        "hours": hours,
    }
    # The summary's "Current conditions ..." may come from an IMD station at any distance, so live
    # readings are taken only from stations within 50 km (see _station_obs).


def _sources(data: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for key in ("observation_data_source", "data_source", "forecast_data_source", "district_stats_data_source"):
        s = _v(data.get(key))
        if s and s not in out:
            out.append(s)
    return out


def _place_and_state_notice(data: dict[str, Any], view: _View) -> None:
    raw = _v(data.get("resolved_location")) or ""
    m = re.match(r"^\s*([^()]+?)\s*\(Central Observation Location:\s*(.+)\)\s*$", raw)
    if m:
        view.place = m.group(1).strip()
        central = _short_place(m.group(2))
        if central:
            view.notices.append(f"{view.place} is a large area — showing weather for {central}.")
        return
    view.place = _short_place(raw) or _short_place(data.get("district")) or _short_place(data.get("location"))


def build_weather_view(tool_result: Any, today: Optional[date] = None) -> Optional[_View]:
    """Normalize a weather tool payload; None when the shape is not recognised."""
    if not isinstance(tool_result, dict) or tool_result.get("success") is False or tool_result.get("error"):
        return None
    today = today or date.today()
    data = tool_result

    if "district_alerts_list" in data:
        kind = "state_alerts"
    elif "district_5day_warnings" in data:
        kind = "alerts"
    elif "results" in data:
        kind = "rainfall"
    elif "weather_data" in data:
        kind = "weather"
    elif "temperature_timeframe_data" in data:
        kind = "temperature"
    elif any(k in data for k in ("overall_severity", "active_warnings", "severity_color", "active_nowcast_categories")):
        kind = "nowcast"
    elif "weather_details" in data:
        kind = "location"
    else:
        return None

    view = _View(kind=kind, sources=_sources(data))
    _place_and_state_notice(data, view)
    place_notices = len(view.notices)

    {
        "state_alerts": lambda: _extract_state_alerts(data, view),
        "alerts": lambda: _extract_alerts(data, view, today),
        "rainfall": lambda: _extract_rainfall(data, view, today),
        "weather": lambda: _extract_weather(data, view, today),
        "temperature": lambda: _extract_temperature(data, view, today),
        "nowcast": lambda: _extract_nowcast(data, view),
        "location": lambda: _extract_location(data, view, today),
    }[kind]()

    view.days = [d for d in view.days if _day_has_data(d)]

    # Live observation applies only when the answer is about today.
    requested = _parse_date(data.get("target_date"))
    about_today = (
        (requested in (None, today))
        and not data.get("from_date")
        and (
            not view.days
            or (len(view.days) == 1 and view.days[0].day in (None, today))
            or (kind == "location" and view.days[0].day == today)
        )
    )
    obs_name = obs_dist = None
    if about_today and kind in {"weather", "temperature", "nowcast", "location"}:
        obs, obs_name, obs_dist = _station_obs(data)
        live = _current_from_obs(obs)
        if view.current is None:
            view.current = live
        else:
            for attr in ("temperature", "feels_like", "humidity", "condition", "rain_24h"):
                if not getattr(view.current, attr):
                    setattr(view.current, attr, getattr(live, attr))
        if kind == "temperature":
            _fill_from_summary(view.current, data.get("summary"))
        if view.current is not None and not view.current.has_any():
            view.current = None
        if view.current is None:
            _collect_notices(view, today, data.get("summary"))  # e.g. "No active IMD weather station found within 50 km"

    st_info = data.get("nearest_station_info") if isinstance(data.get("nearest_station_info"), dict) else {}
    st_name = _first(st_info.get("nearest_station_name"), st_info.get("station_name"))
    st_dist = _first(st_info.get("distance_from_requested_place_km"), st_info.get("distance_km"))
    if obs_name and view.current is not None:
        # Live readings are shown, so name the station they came from.
        st_name, st_dist = obs_name, obs_dist
    if kind not in {"alerts", "state_alerts"}:
        view.station = _pretty_station(st_name)
        view.station_km = _km(st_dist)

    view.has_data_notice = len(view.notices) > place_notices
    has_content = bool(
        (view.current and view.current.has_any())
        or view.days or view.has_data_notice
        or view.rain_stats or view.alerts or view.state_alerts or view.nowcast
    )
    return view if has_content else None


def _day_has_data(d: _Day) -> bool:
    return any((d.condition, d.min_temp, d.max_temp, d.rain, d.humidity_morning, d.humidity_evening, d.rain_outlook))


# ---------------------------------------------------------------------------
# Rendering: _View → markdown
# ---------------------------------------------------------------------------

def _humidity_text(cur: Optional[_Current], day: Optional[_Day]) -> Optional[str]:
    if cur and cur.humidity:
        return f"{cur.humidity}%"
    if day and (day.humidity_morning or day.humidity_evening):
        parts = []
        if day.humidity_morning:
            parts.append(f"{day.humidity_morning}% (morning)")
        if day.humidity_evening:
            parts.append(f"{day.humidity_evening}% (evening)")
        return ", ".join(parts)
    return None


def _single_day_block(view: _View, day: Optional[_Day], focus: set[str], today: date) -> list[str]:
    cur = view.current
    d = day.day if day else today
    is_today = d in (None, today)
    condition = (cur.condition if (cur and is_today and cur.condition) else None) or (day.condition if day else None)
    lo, hi = (day.min_temp, day.max_temp) if day else (None, None)
    rng = _temp_range(lo, hi)
    humidity = _humidity_text(cur if is_today else None, day)
    rain = (cur.rain_24h if (cur and is_today and cur.rain_24h) else None) or (day.rain if day else None)

    only = focus - {"farming", "stations"}
    blocks: list[str] = []

    if only == {"temperature"}:
        if is_today and cur and cur.temperature:
            lines = [f"🌡️ **Current temperature: {_c(cur.temperature)}**"]
            if cur.feels_like:
                lines.append(f"🥵 **Feels like: {_c(cur.feels_like)}**")
            blocks.append("\n".join(lines))
            if rng:
                blocks.append(f"Today's range: **{rng}**")
            return blocks
        if lo or hi:
            lines = [f"🌡️ **{_day_name(d, today)}, {_nice_date(d or today, today)}**"]
            if lo:
                lines.append(f"- Minimum: **{_c(lo)}**")
            if hi:
                lines.append(f"- Maximum: **{_c(hi)}**")
            return ["\n".join(lines)]
        blocks.append("Temperature data is not available for this place right now.")

    if only == {"humidity"}:
        if humidity:
            lines = [f"💧 **Humidity{'' if is_today else ' ' + _when(d, today).strip()}: {humidity}**"]
            if is_today and cur and cur.temperature:
                lines.append(f"🌡️ Temperature: **{_c(cur.temperature)}**")
            return ["\n".join(lines)]
        blocks.append("Humidity data is not available for this place right now.")

    bullets: list[str] = []
    if is_today and cur and cur.temperature:
        bullets.append(f"- 🌡️ Temperature: **{_c(cur.temperature)}**")
    if is_today and cur and cur.feels_like:
        bullets.append(f"- 🥵 Feels like: **{_c(cur.feels_like)}**")
    if rng:
        label = "Today's range" if is_today else "Temperature range"
        bullets.append(f"- 🌡️ {label}: **{rng}**")
    if humidity:
        bullets.append(f"- 💧 Humidity: **{humidity}**")
    if condition:
        bullets.append(f"- {_condition_emoji(condition)} Condition: **{condition}**")
    if rain and (_rain_positive(rain) or "rain" in focus):
        bullets.append(f"- 🌧️ Rain (last 24 hours): **{_rain_text(rain)}**")
    if bullets:
        blocks.append(f"{_condition_emoji(condition)} **{_day_heading(d, today)}**\n\n" + "\n".join(bullets))
    return blocks


def _multi_day_block(view: _View, focus: set[str], today: date) -> list[str]:
    days = view.days
    dated = [d.day for d in days if d.day]
    if view.is_forecast_window and dated and dated[0] <= today:
        title = f"Forecast for the next {len(days)} days"
    elif dated and all(x < today for x in dated):
        title = f"Past weather: {_nice_date(dated[0], today)} – {_nice_date(dated[-1], today)}"
    elif dated:
        title = f"Weather: {_nice_date(dated[0], today)} – {_nice_date(dated[-1], today)}"
    else:
        title = "Upcoming days"
    temp_only = focus - {"farming", "stations"} == {"temperature"}
    rows = []
    for d in days:
        bits = []
        if d.condition and not temp_only:
            bits.append(f"{_condition_emoji(d.condition)} {d.condition}")
        rng = _temp_range(d.min_temp, d.max_temp)
        if rng:
            bits.append(rng)
        if d.rain and (_rain_positive(d.rain) or "rain" in focus):
            bits.append(f"rain {_rain_text(d.rain)}")
        if "humidity" in focus:
            h = _humidity_text(None, d)
            if h:
                bits.append(f"humidity {h}")
        if bits:
            rows.append(f"- **{_short_day(d.day, today)}:** " + ", ".join(bits))
    if not rows:
        return []
    note = " (min – max)" if any(d.min_temp and d.max_temp for d in days) else ""
    return [f"🗓️ **{title}**{note}\n\n" + "\n".join(rows)]


def _stat_line(label: str, actual: Optional[str], normal: Optional[str], dep: Optional[str], cat: Optional[str]) -> str:
    line = f"- {label}: **{_rain_text(actual)}**"
    if normal:
        line += f" (normal: {_rain_text(normal)})"
    extra = []
    if dep:
        extra.append(f"{dep if dep.endswith('%') else dep + '%'} compared to normal")
    if cat and cat.lower() not in {"no data", "n/a"}:
        extra.append(cat)
    if extra:
        line += " — " + ", ".join(extra)
    return line


def _rain_forecast_text(day: _Day) -> Optional[str]:
    """Rain outlook for a day: the tool's likelihood text, else a phrase from the forecast condition."""
    if day.rain_outlook:
        return day.rain_outlook
    if day.condition:
        emoji = _condition_emoji(day.condition)
        if _mentions_rain(day.condition):
            return f"{emoji} {day.condition}"
        return f"{emoji} No rain in the forecast ({day.condition})"
    return None


def _rain_blocks(view: _View, today: date) -> list[str]:
    blocks: list[str] = []
    if len(view.days) == 1:
        day = view.days[0]
        d = day.day or today
        if d <= today and day.rain is not None:
            period = "in the last 24 hours" if d == today else _when(d, today).strip()
            if _rain_positive(day.rain):
                blocks.append(f"🌧️ **Rain recorded {period}: {_rain_text(day.rain)}**")
            else:
                blocks.append(f"☀️ **No rain recorded {period}** ({_rain_text(day.rain)})")
        outlook = _rain_forecast_text(day)
        if outlook and d >= today:
            blocks.append(f"**{_day_name(d, today)}, {_nice_date(d, today)}:** {outlook}")
    elif view.days:
        rows = []
        for day in view.days:
            d = day.day or today
            outlook = _rain_forecast_text(day) if d >= today else None
            recorded = day.rain is not None and d <= today and (d < today or _rain_positive(day.rain) or not outlook)
            bits = []
            if outlook:
                bits.append(outlook)
            if recorded:
                bits.append(f"{_rain_text(day.rain)} recorded" if outlook else _rain_text(day.rain))
            if bits:
                rows.append(f"- **{_short_day(day.day, today)}:** " + "; ".join(bits))
        if rows:
            dated = [d.day for d in view.days if d.day]
            past = dated and all(x < today for x in dated)
            title = "Rainfall" if past else "Rain forecast"
            if dated:
                title += f": {_nice_date(dated[0], today)} – {_nice_date(dated[-1], today)}"
            blocks.append(f"🌧️ **{title}**\n\n" + "\n".join(rows))
    if view.rain_stats:
        title = "Monsoon rainfall" if view.monsoon else "District rainfall"
        blocks.append(f"📊 **{title}**\n\n" + "\n".join(_stat_line(*s) for s in view.rain_stats))
    return blocks


def _severity(sev: str) -> Optional[tuple[str, str, str]]:
    """'Orange (Be Prepared)' → ('🟠', 'Orange alert', 'be prepared'); None for green/unknown."""
    low = sev.lower()
    for color, (emoji, label) in _SEVERITY_STYLE.items():
        if re.search(rf"\b{color}\b", low):  # whole word: "prepared" must not match "red"
            m = re.search(r"\(([^)]+)\)", sev)
            return emoji, label, (m.group(1).lower() if m else "")
    return None


def _warning_text(desc: str) -> Optional[str]:
    d = desc.strip()
    return None if not d or d.lower() in {"no warning", "nil", "none"} else d


def _alert_blocks(view: _View, today: date) -> list[str]:
    rows = []
    active = 0
    for d, sev, desc in view.alerts:
        style = _severity(sev)
        warning = _warning_text(desc)
        if style or warning:
            active += 1
            emoji, label, advice = style or ("⚠️", "Warning", "")
            text = f"{emoji} {label}" + (f" ({advice})" if advice else "")
            if warning:
                text += f" — {warning}"
        else:
            text = "🟢 No warning"
        rows.append(f"- **{_short_day(d, today)}:** {text}")
    if not rows:
        return []
    if active == 0:
        return [f"✅ **No IMD weather warnings for the next {len(rows)} days.**"]
    return ["⚠️ **IMD weather warnings**\n\n" + "\n".join(rows)]


def _state_alert_blocks(view: _View) -> list[str]:
    count, total, rows = view.state_alerts or (None, None, [])
    flagged = []
    for district, sev, desc in rows:
        style = _severity(sev)
        warning = _warning_text(desc)
        if style or warning:
            emoji, label, advice = style or ("⚠️", "Warning", "")
            text = f"{emoji} {label}" + (f" ({advice})" if advice else "") + (f" — {warning}" if warning else "")
            flagged.append(f"- **{district}:** {text}")
    if not flagged:
        where = f" in {view.place}" if view.place else ""
        return [f"✅ **No district{where} has an IMD weather warning today.**"]
    head = f"⚠️ **{count} of {total} districts have weather warnings today**" if count is not None and total else "⚠️ **Districts with weather warnings today**"
    return [head + "\n\n" + "\n".join(flagged)]


def _nowcast_blocks(view: _View) -> list[str]:
    n = view.nowcast
    window = f"next {n['hours']} hours" if n.get("hours") else "next few hours"
    style = _severity(n.get("severity") or "")
    if style:
        emoji, label, advice = style
        head = f"{emoji} **{label} for the {window}**" + (f" ({advice})" if advice else "")
    elif n.get("categories"):
        head = f"⚠️ **Weather warning for the {window}**"
    else:
        head = f"✅ **No severe weather expected in the {window}.**"
    lines = []
    if n.get("categories"):
        lines.append(f"- Expected: **{', '.join(n['categories'])}**")
    if n.get("message") and (style or n.get("categories")):
        lines.append(f"- {n['message']}")
    if n.get("valid_upto") and (style or n.get("categories")):
        lines.append(f"- Valid until: {n['valid_upto']}")
    return [head + ("\n\n" + "\n".join(lines) if lines else "")]


def _current_bullets(cur: Optional[_Current]) -> list[str]:
    if not cur:
        return []
    out = []
    if cur.temperature:
        out.append(f"- 🌡️ Temperature: **{_c(cur.temperature)}**")
    if cur.feels_like:
        out.append(f"- 🥵 Feels like: **{_c(cur.feels_like)}**")
    if cur.humidity:
        out.append(f"- 💧 Humidity: **{cur.humidity}%**")
    if cur.condition:
        out.append(f"- {_condition_emoji(cur.condition)} Condition: **{cur.condition}**")
    return out


def _nearby_block(view: _View) -> list[str]:
    rows = []
    for st in view.nearby[:5]:
        name = _pretty_station(st.get("name") or st.get("station"))
        if not name:
            continue
        bits = []
        if _bare(st.get("temperature_c")):
            bits.append(_c(_bare(st.get("temperature_c"))))
        if _bare(st.get("humidity_pct")):
            bits.append(f"humidity {_bare(st.get('humidity_pct'))}%")
        cond = natural_condition(_first(st.get("weather_description"), st.get("weather_message")))
        if cond:
            bits.append(cond)
        km = _km(st.get("distance_km"))
        label = f"{name} (~{km} km)" if km else name
        rows.append(f"- **{label}:** " + (", ".join(bits) if bits else "no current reading"))
    return ["📡 **Nearby weather stations**\n\n" + "\n".join(rows)] if rows else []


def _farmer_note(view: _View, today: date) -> Optional[str]:
    days = view.days
    focus_days = [d for d in days if d.day is None or d.day >= today] or days
    notes: list[str] = []

    severe = [s for _, s, _ in view.alerts[:2] if (_severity(s) or ("", "", ""))[1] in {"Orange alert", "Red alert"}]
    if view.nowcast and (_severity(view.nowcast.get("severity") or "") or ("", "", ""))[1] in {"Orange alert", "Red alert"}:
        severe.append(view.nowcast["severity"])
    if severe:
        notes.append("There is an active IMD warning. Follow official advisories and avoid field work during severe weather.")

    conds = [(d, d.condition) for d in focus_days if d.condition]
    if view.current and view.current.condition:
        conds.append((_Day(day=today), view.current.condition))
    thunder = [d for d, c in conds if any(k in c.lower() for k in ("thunder", "lightning"))]
    rainy = [d for d, c in conds if _mentions_rain(c) and d not in thunder]
    if thunder:
        notes.append(f"Thunderstorms are possible{_when(thunder[0].day, today)}. Avoid working in open fields during thunder and lightning.")
    elif rainy:
        notes.append(f"Rain is expected{_when(rainy[0].day, today)}. Plan field work around the rain where possible.")

    highs = [(_num(d.max_temp), d) for d in focus_days if _num(d.max_temp) is not None]
    if view.current and _num(view.current.temperature) is not None:
        highs.append((_num(view.current.temperature), _Day(day=today, max_temp=view.current.temperature)))
    lows = [(_num(d.min_temp), d) for d in focus_days if _num(d.min_temp) is not None]
    if highs:
        hottest, hd = max(highs, key=lambda x: x[0])
        if hottest >= 35:
            notes.append(
                f"It is expected to get quite hot{_when(hd.day, today)} (up to {_c(hd.max_temp)}). "
                "If possible, plan strenuous field work for the cooler morning or evening hours."
            )
    if lows:
        coldest, cd = min(lows, key=lambda x: x[0])
        if coldest <= 10:
            notes.append(f"It is expected to be cold{_when(cd.day, today)} (down to {_c(cd.min_temp)}), especially at night and early morning.")

    if notes:
        return " ".join(notes)
    if highs or lows or conds or view.alerts:
        return "Nothing in the available weather data (temperature, rain, or warnings) points to a problem for routine field work."
    return None


def _footer(view: _View) -> list[str]:
    out = []
    if view.sources:
        out.append(f"**Source:** {'; '.join(view.sources)}")
    if view.station:
        line = f"Weather station: {view.station}"
        line += f", approximately {view.station_km} km away." if view.station_km else "."
        out.append(line)
    return out


def render_farmer_weather_answer(query: str, tool_result: Any, today: Optional[date] = None) -> str:
    """Farmer-friendly markdown answer for a weather tool result; '' when the shape is unknown."""
    today = today or date.today()
    view = build_weather_view(tool_result, today=today)
    if view is None:
        return ""
    focus = question_focus(query)
    blocks: list[str] = []
    if view.place:
        blocks.append(f"📍 **{view.place}**")
    blocks += [f"ℹ️ {n}" for n in view.notices]

    if view.kind == "alerts":
        blocks += _alert_blocks(view, today)
    elif view.kind == "state_alerts":
        blocks += _state_alert_blocks(view)
    elif view.kind == "nowcast":
        blocks += _nowcast_blocks(view)
        cur = _current_bullets(view.current)
        if cur:
            blocks.append("**Right now**\n\n" + "\n".join(cur))
    elif view.kind == "rainfall" or (focus & {"rain"} and not focus & {"general", "temperature", "humidity"}):
        rain = _rain_blocks(view, today)
        blocks += rain or _single_day_block(view, view.days[0] if view.days else None, focus, today)
    elif view.kind == "location" and len(view.days) > 1:
        blocks += _single_day_block(view, view.days[0], focus, today)
        if re.search(r"\b(forecast|week|days|upcoming|coming|next|tomorrow)\b", (query or "").lower()):
            rest = _View(kind=view.kind, days=view.days[1:])
            blocks += _multi_day_block(rest, focus, today)
    elif len(view.days) > 1:
        blocks += _multi_day_block(view, focus, today)
    else:
        blocks += _single_day_block(view, view.days[0] if view.days else None, focus, today)

    if "stations" in focus and view.nearby:
        blocks += _nearby_block(view)

    if "farming" in focus:
        note = _farmer_note(view, today)
        if note:
            blocks.append(f"🌾 **For Farmers**\n\n{note}")

    body = [b for b in blocks if b.strip()]
    if len(body) <= (1 if view.place else 0) + len(view.notices) and not view.has_data_notice:
        return ""
    return "\n\n".join(body + _footer(view)).strip()
