"""Deterministic human-readable formatting for specialist tool JSON (weather, etc.)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, date
from typing import Any, Optional

from ajrasakha.tools.weather.code import describe_current_weather, describe_wind_direction
from ajrasakha.tools.weather.weather_tools2 import LOCATION_UNRESOLVED_MESSAGE

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


_HEX_COLOR_MAP = {
    "#008000": "🟢 Green (No Warning)",
    "#00ff00": "🟢 Green (No Warning)",
    "#7cfc00": "🟢 Green (No Warning)",
    "#ffff00": "🟡 Yellow alert",
    "#ffa500": "🟠 Orange alert",
    "#ff0000": "🔴 Red alert",
}


def _map_hex_color(hex_str: Any) -> str:
    if not hex_str:
        return ""
    key = str(hex_str).strip().lower()
    return _HEX_COLOR_MAP.get(key, str(hex_str))


def _is_annam_source(raw: Any) -> bool:
    if not raw:
        return False
    s = str(raw).lower()
    return "annam" in s or "ws" in s


def _extract_primary_station(data: dict[str, Any], fallback_location: str = "Location") -> tuple[str, Optional[float | str]]:
    """Extract single primary observation station name and distance."""
    # 1. Check if Annam AWS within 10 km
    tw = data.get("weather_data", {}).get("today_weather") if isinstance(data.get("weather_data"), dict) else data.get("today_weather")
    if isinstance(tw, dict) and _is_annam_source(tw.get("data_source") or data.get("data_source")):
        st_name = tw.get("station") or fallback_location
        dist = tw.get("distance_to_station_km")
        return st_name, dist

    aws = data.get("nearest_live_aws_station")
    if isinstance(aws, dict) and aws.get("success") and _is_annam_source(aws.get("data_source")):
        aws_st = aws.get("station") if isinstance(aws.get("station"), dict) else {}
        st_name = aws_st.get("name") or aws.get("name")
        dist = aws.get("distance_km")
        if st_name and (dist is None or float(dist) <= 10.0):
            return st_name, dist

    candidates: list[tuple[float, str]] = []

    # 2. Check IMD current station
    imd_current = data.get("imd_current_weather") or (
        data.get("weather_data", {}).get("imd_current_weather") if isinstance(data.get("weather_data"), dict) else {}
    )
    if isinstance(imd_current, dict) and imd_current.get("success"):
        cur_st = imd_current.get("station") if isinstance(imd_current.get("station"), dict) else {}
        st_name = cur_st.get("name") or imd_current.get("station_name")
        dist = imd_current.get("distance_km")
        if st_name and dist is not None and float(dist) <= 50.0:
            candidates.append((float(dist), st_name))

    # 3. Check nearest_station_info
    st_info = data.get("nearest_station_info")
    if isinstance(st_info, dict) and st_info and not st_info.get("no_station_within_radius"):
        st_name = st_info.get("nearest_station_name") or st_info.get("station_name") or st_info.get("name") or st_info.get("station")
        dist = st_info.get("distance_from_requested_place_km") or st_info.get("distance_km") or st_info.get("distance_to_station_km")
        if st_name and dist is not None and float(dist) <= 50.0:
            candidates.append((float(dist), st_name))

    # 4. Check nearest_live_aws_station (IMD AWS)
    if isinstance(aws, dict) and aws.get("success"):
        aws_st = aws.get("station") if isinstance(aws.get("station"), dict) else {}
        st_name = aws_st.get("name") or aws.get("name")
        dist = aws.get("distance_km")
        if st_name and dist is not None and float(dist) <= 50.0:
            candidates.append((float(dist), st_name))

    # 5. Check today_temperature station
    today_t = data.get("temperature_timeframe_data", {}).get("today_temperature") if isinstance(data.get("temperature_timeframe_data"), dict) else None
    if isinstance(today_t, dict) and today_t.get("station_name") and not today_t.get("no_station_within_radius"):
        st_name = today_t.get("station_name")
        dist = today_t.get("distance_km")
        if dist is not None and float(dist) <= 50.0:
            candidates.append((float(dist), st_name))
        elif dist is None and st_name and st_name != "N/A":
            candidates.append((25.0, st_name))

    # 6. Check nearest_stations from station_id.json / aws_station_id.json
    nst = data.get("nearest_stations") or {}
    if isinstance(nst, dict):
        city_s = nst.get("nearest_city_station") or data.get("nearest_city_station")
        if isinstance(city_s, dict) and city_s.get("station_name"):
            cdist = city_s.get("distance_km")
            if cdist is not None and float(cdist) <= 50.0:
                candidates.append((float(cdist), city_s.get("station_name")))
        aws_s = nst.get("nearest_aws_station") or data.get("nearest_aws_station")
        if isinstance(aws_s, dict) and aws_s.get("station_name"):
            adist = aws_s.get("distance_km")
            if adist is not None and float(adist) <= 50.0:
                candidates.append((float(adist), aws_s.get("station_name")))

    if candidates:
        candidates.sort(key=lambda x: x[0])
        best_dist, best_name = candidates[0]
        return best_name, best_dist

    if isinstance(st_info, dict) and st_info.get("no_station_within_radius"):
        return None, None

    return fallback_location, None


def _format_subdiv_warning_item(s: dict[str, Any]) -> str:
    subdiv_name = s.get("subdivision") or s.get("Subdivision") or "Subdivision"
    warns = s.get("warnings") or s.get("warning") or s.get("message")
    if isinstance(warns, list):
        formatted_warns = []
        for w in warns:
            if isinstance(w, dict):
                d = w.get("day", "Day")
                desc = w.get("warning") or w.get("warning_description") or "No Warning"
                color_code = _map_hex_color(w.get("color") or w.get("color_code"))
                color_label = f"{color_code} — " if color_code else ""
                formatted_warns.append(f"  - {d}: {color_label}{desc}")
            else:
                formatted_warns.append(f"  - {w}")
        return f"- {subdiv_name}:\n" + "\n".join(formatted_warns)
    elif isinstance(warns, str):
        return f"- {subdiv_name}: {warns}"
    return f"- {subdiv_name}: {json.dumps(s, ensure_ascii=False)}"


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
            if data.get("location_unresolved") or data.get("error") == "location_unresolved":
                return data.get("message") or LOCATION_UNRESOLVED_MESSAGE
            if data.get("success") is False:
                if data.get("answer"):
                    return str(data["answer"])
                err = str(data.get("error") or "")
                if err and "HTTPConnectionPool" not in err and "Traceback" not in err:
                    return err
                return data.get("message") or "Weather data is currently unavailable from the weather service. Please try again shortly."
            # Envelope: {"answer": "...", "tool_data": {...}} — prefer synthesized answer
            if "tool_data" in data and isinstance(data["tool_data"], dict):
                td = data["tool_data"]
                if td.get("location_unresolved") or td.get("error") == "location_unresolved":
                    return td.get("message") or data.get("answer") or LOCATION_UNRESOLVED_MESSAGE
                if td.get("success") is False:
                    if data.get("answer"):
                        return str(data["answer"])
                    return td.get("message") or "Weather data is currently unavailable from the weather service. Please try again shortly."
                if data.get("answer") and str(data["answer"]).strip():
                    return str(data["answer"]).strip()
                return format_new_weather_tool_dict(td)
            if "resolved_location" in data or "summary" in data or "district_5day_warnings" in data or "weather_data" in data or "results" in data:
                return format_new_weather_tool_dict(data)
            if "answer" in data:
                return str(data.get("answer") or "")
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
    """Format new weather tool responses into rich structured text with full available details."""
    if not isinstance(data, dict):
        return str(data)

    if data.get("location_unresolved") or data.get("error") == "location_unresolved":
        return data.get("message") or LOCATION_UNRESOLVED_MESSAGE

    if data.get("success") is False:
        return data.get("message") or "Weather data is currently unavailable from the weather service. Please try again shortly."

    lines: list[str] = []
    today_str = datetime.now().strftime("%Y-%m-%d")
    _raw_loc = data.get("resolved_location") or data.get("district") or data.get("location") or "Location"
    if str(_raw_loc).strip().lower() in {"location", "none", "", "null"} and not data.get("weather_data") and not data.get("today_weather") and not data.get("district_5day_warnings"):
        return LOCATION_UNRESOLVED_MESSAGE
    # Preserve parenthetical info like "(Central Observation Location: ...)" without breaking on commas
    if "(" in _raw_loc and ")" in _raw_loc:
        location = _raw_loc
    else:
        # Trim overly verbose reverse-geocode strings: keep at most first 3 comma-parts
        _loc_parts = [p.strip() for p in _raw_loc.split(",") if p.strip()]
        # Drop numeric postal codes and pure-country tail when 4+ parts present
        _loc_filtered = [p for p in _loc_parts if not re.match(r'^\d+$', p)]
        location = ", ".join(_loc_filtered[:3]) if len(_loc_filtered) > 3 else ", ".join(_loc_filtered)
        if location.count('(') > location.count(')'):
            location += ")"

    summary = data.get("summary")
    if isinstance(summary, str):
        summary = re.sub(r"\bNIL\s*mm\b", "0.0 mm", summary, flags=re.IGNORECASE)
        summary = re.sub(r"\bNIL\b", "0.0", summary, flags=re.IGNORECASE)

    # ------------------------------------------------------------------
    # Tool 6: get_weather_alerts
    # ------------------------------------------------------------------
    if "district_5day_warnings" in data or "district_alerts_list" in data or data.get("is_state_wide_query"):
        st_name, dist = _extract_primary_station(data, fallback_location=location)

        lines.append(f"Weather warnings & alerts — {location}")
        if st_name and (st_name.lower() != location.lower() or dist is not None):
            dist_str = f" (~{float(dist):.1f} km away)" if dist is not None else ""
            lines.append(f"Observation station: {st_name}{dist_str}")
        lines.append("")

        if "district_5day_warnings" in data:
            warnings = data.get("district_5day_warnings", [])
            req_days = data.get("requested_days_count") or 5
            if isinstance(warnings, list) and req_days < len(warnings):
                warnings = warnings[:req_days]

            has_active_alert = any(
                any(c in str(w.get("severity") or "") for c in ("Yellow", "Orange", "Red"))
                for w in warnings if isinstance(w, dict)
            )
            day1_active = bool(warnings and any(c in str(warnings[0].get("severity") or "") for c in ("Yellow", "Orange", "Red")))
            if not has_active_alert:
                lines.append(f"🟢 All Clear: No active weather alerts for {location} for the upcoming forecast period.")
            elif day1_active:
                lines.append(f"Active weather alerts for {location}:")
            else:
                lines.append(f"🟢 No active weather warnings today for {location}. Active warnings in upcoming forecast:")

            if isinstance(summary, str) and summary.strip():
                lines.append(f"Summary: {summary.strip()}")
            lines.append("")

            base_dt = datetime.now()
            for i, w in enumerate(warnings):
                if not isinstance(w, dict):
                    continue
                item_dt = base_dt + timedelta(days=i)
                dt_str = item_dt.strftime("%Y-%m-%d")
                if i == 0:
                    day_label = f"Today (Day 1 - {dt_str})"
                else:
                    day_label = f"Day {i+1} ({dt_str})"
                desc = w.get("warning_description", "No Warning")
                w_code = str(w.get("warning_codes") or "1").strip()
                sev = str(w.get("severity") or "")
                # Show warning code(s) directly when meaningful
                code_descs = [wc.strip() for wc in w_code.split(",") if wc.strip() and wc.strip() != "1"]
                if "Red" in sev:
                    lines.append(f"- {day_label}: 🔴 Red — {desc}")
                elif "Orange" in sev:
                    lines.append(f"- {day_label}: 🟠 Orange — {desc}")
                elif "Yellow" in sev:
                    lines.append(f"- {day_label}: 🟡 Yellow — {desc}")
                else:
                    lines.append(f"- {day_label}: 🟢 No Warning")
                if code_descs:
                    lines.append(f"  Warning code(s): {', '.join(code_descs)}")


        elif "district_alerts_list" in data:
            dist_list = data.get("district_alerts_list", [])
            lines.append(
                f"State Summary: {data.get('districts_under_alert_count', 0)} of "
                f"{data.get('total_districts_in_state', 0)} districts under active weather alerts"
            )
            lines.append("")
            for item in dist_list:
                if not isinstance(item, dict):
                    continue
                d_name = item.get("district")
                w_desc = item.get("today_warning", "No Warning")
                sev = str(item.get("severity") or "")
                if "Red" in sev:
                    lines.append(f"- {d_name}: 🔴 Red alert — {w_desc} | {sev}")
                elif "Orange" in sev:
                    lines.append(f"- {d_name}: 🟠 Orange alert — {w_desc} | {sev}")
                elif "Yellow" in sev:
                    lines.append(f"- {d_name}: 🟡 Yellow alert — {w_desc} | {sev}")
                else:
                    lines.append(f"- {d_name}: 🟢 Green (No Warning) — {w_desc} | {sev or 'Green (No Warning)'}")

        subdiv = data.get("subdivision_warnings")
        if isinstance(subdiv, list) and subdiv:
            lines.append("")
            lines.append("Subdivision warnings")
            for s in subdiv[:10]:
                if isinstance(s, dict):
                    lines.append(_format_subdiv_warning_item(s))
        elif isinstance(subdiv, dict) and subdiv.get("data"):
            lines.append("")
            lines.append("Subdivision warnings")
            for s in (subdiv.get("data") or [])[:10]:
                if isinstance(s, dict):
                    lines.append(_format_subdiv_warning_item(s))

    # ------------------------------------------------------------------
    # Tool 2: get_rainfall_and_monsoon_info
    # ------------------------------------------------------------------
    elif "results" in data:
        results = data.get("results", {}) if isinstance(data.get("results"), dict) else {}
        rec = (
            results.get("district_cumulative_monsoon_rainfall")
            or results.get("district_rainfall_departures")
            or results.get("district_rainfall_record")
            or results.get("today_rainfall_record")
            or {}
        )
        if not isinstance(rec, dict):
            rec = {}
        tf = str(results.get("timeframe") or "")
        rf_list = None
        if "specific_target_date" in tf or "rainfall_target_date" in results:
            tdr = results.get("rainfall_target_date") or results.get("target_date_rainfall")
            if isinstance(tdr, dict):
                if tdr.get("notice"):
                    lines.append(str(tdr.get("notice")))
                    lines.append("")
                if "forecast" in tdr or "observed_past_24hrs_rainfall_mm" in tdr or "observed_past_24hrs_rainfall" in tdr:
                    rf_list = [tdr]
                elif "available_7day_rainfall_forecast_trend" in tdr:
                    rf_list = tdr.get("available_7day_rainfall_forecast_trend", [])
        elif "rainfall_range" in results:
            rf_list = results.get("rainfall_range")
        elif "rainfall_forecast_list" in results:
            rf_list = results.get("rainfall_forecast_list")

        if rf_list is None and "today_rainfall" in results:
            rf_list = [results.get("today_rainfall")]

        st_name, dist = _extract_primary_station(data, fallback_location=location)

        lines.append(f"Rainfall — {location}")
        if st_name and (st_name.lower() != location.lower() or dist is not None):
            dist_str = f" (~{float(dist):.1f} km away)" if dist is not None else ""
            lines.append(f"Observation station: {st_name}{dist_str}")
        lines.append("")

        # Direct rain chance indicator (only when an explicit forecast string is present)
        rain_chance = None
        today_rf = results.get("today_rainfall") or (rf_list[0] if (rf_list and len(rf_list) == 1) else None)
        if isinstance(today_rf, dict) and today_rf.get("forecast"):
            fc_str = str(today_rf.get("forecast") or "").lower()
            rain_keywords = ["rain", "shower", "thunder", "drizzle", "wet"]
            if any(k in fc_str for k in rain_keywords):
                rain_chance = f"Rain forecast: Yes, there is a chance of rain today ({today_str}) in {location}."
            else:
                rain_chance = f"Rain forecast: No significant rain expected today ({today_str}) in {location}."

        top_notice = results.get("notice") or data.get("notice")
        if top_notice:
            lines.append(str(top_notice))
            lines.append("")

        is_hist_tf = "date_range" in tf or "previous" in tf or "historical" in tf
        if rain_chance and not is_hist_tf:
            lines.append(rain_chance)
            lines.append("")

        if isinstance(summary, str) and summary.strip():
            lines.append(f"Summary: {summary.strip()}")
            lines.append("")

        if isinstance(rf_list, list) and rf_list:
            for item in rf_list:
                lines.extend(_rainfall_item_detail_lines(item, rec=rec, today_str=today_str))
            # Only show district stats if rf_list didn't already embed the same numbers
            rf_has_stats = any(
                isinstance(it, dict) and (
                    it.get("district_daily_actual_mm") is not None
                    or it.get("observed_past_24hrs_rainfall_mm") is not None
                )
                for it in rf_list if isinstance(it, dict)
            )
            if rec and not rf_has_stats:
                lines.append("")
                lines.append("District rainfall statistics")
                lines.extend(_district_rainfall_record_lines(rec))
        elif rec:
            lines.append("")
            lines.append("District rainfall statistics")
            lines.extend(_district_rainfall_record_lines(rec))

    # ------------------------------------------------------------------
    # Tool 1: get_current_and_forecast_info
    # ------------------------------------------------------------------
    elif "weather_data" in data:
        w_data = data.get("weather_data", {}) if isinstance(data.get("weather_data"), dict) else {}
        st_timeframe = str(w_data.get("selected_timeframe") or "")
        is_today_current = (
            st_timeframe == "today"
            or (
                "today_weather" in w_data
                and not w_data.get("forecast_list")
                and "days_forecast" not in st_timeframe
                and "specific_target_date" not in st_timeframe
                and "date_range" not in st_timeframe
            )
        )

        st_name, dist = _extract_primary_station(data, fallback_location=location)

        query_type_val = str(data.get("query_type") or "").lower().strip()
        if query_type_val == "current":
            title = f"Live weather — {location}"
        else:
            title = f"Today's weather — {location}"

        if st_name and (st_name.lower() != location.lower() or dist is not None):
            dist_str = f" (~{float(dist):.1f} km away)" if dist is not None else ""
            st_header = f"Observation station: {st_name}{dist_str}"
        elif not st_name:
            st_header = f"Notice: No active IMD weather station found within 50.0 km radius search range of {location}."
        else:
            st_header = None

        fc_list = None
        if is_today_current:
            tw = w_data.get("today_weather", {}) if isinstance(w_data.get("today_weather"), dict) else {}
            imd_current = data.get("imd_current_weather") or w_data.get("imd_current_weather")
            cur_st = imd_current.get("station") if isinstance(imd_current, dict) and imd_current.get("success") and isinstance(imd_current.get("station"), dict) else {}
            has_annam = bool(tw and _is_annam_source(tw.get("data_source") or data.get("data_source")))

            lines.append(title)
            if st_header:
                lines.append(st_header)
            # Observation date/time from station data
            obs_st = tw if has_annam else (cur_st or tw)
            if isinstance(obs_st, dict):
                obs_ts = obs_st.get("observation_timestamp") or obs_st.get("TimeStamp") or _join_date_time(obs_st.get("date"), obs_st.get("time"))
                if obs_ts and len(str(obs_ts).strip()) > 10:
                    lines.append(f"Observed at: {obs_ts}")
            lines.append("")

            if isinstance(summary, str) and summary.strip():
                lines.append(f"Summary: {summary.strip()}")
                lines.append("")

            if has_annam:
                lines.extend(_live_station_detail_lines(tw, fallback_location=location))
            elif cur_st:
                lines.extend(_live_station_detail_lines(cur_st, fallback_location=location))
            elif tw:
                lines.extend(_today_weather_fallback_lines(tw, location=location))
        else:
            top_notice = w_data.get("notice") or data.get("notice")
            if top_notice:
                lines.append(str(top_notice))
                lines.append("")

            if "target_date_weather" in w_data:
                tdw = w_data.get("target_date_weather", {})
                if isinstance(tdw, dict):
                    if tdw.get("notice"):
                        lines.append(str(tdw.get("notice")))
                        lines.append("")
                    if "forecast" in tdw or "min_temp" in tdw or "max_temp" in tdw or "observed_min_temp" in tdw:
                        fc_list = [tdw]
                    elif "available_7day_forecast_trend" in tdw:
                        fc_list = tdw.get("available_7day_forecast_trend", [])
            if fc_list is None:
                fc_list = w_data.get("forecast_list") or w_data.get("historical_weather_range") or []

            target_dt = data.get("target_date") or w_data.get("target_date")
            from_dt = data.get("from_date") or w_data.get("from_date")
            if "date_range" in st_timeframe or "previous" in st_timeframe or from_dt or (target_dt and target_dt < today_str):
                header_title = f"Historical weather ({target_dt})" if target_dt else "Historical weather"
            elif target_dt == today_str or st_timeframe == "today":
                header_title = f"Today's weather ({today_str})"
            else:
                header_title = "Forecast"
            lines.append(f"{header_title} — {location}")
            fc_src = (
                data.get("forecast_data_source")
                or (data.get("weather_data", {}).get("forecast_data_source") if isinstance(data.get("weather_data"), dict) else None)
            )
            obs_src = data.get("observation_data_source") or data.get("data_source")
            if st_header:
                if fc_src and obs_src and str(obs_src).strip() != str(fc_src).strip() and "Annam" in str(obs_src):
                    dist_str = f" (~{float(dist):.1f} km away)" if dist is not None else ""
                    lines.append(f"Observation station (Today): {st_name}{dist_str}")
                    fc_st_info = data.get("forecast_station_info") or (
                        data.get("weather_data", {}).get("forecast_station_info")
                        if isinstance(data.get("weather_data"), dict) else None
                    )
                    fc_st_name = fc_st_info.get("station_name") if isinstance(fc_st_info, dict) else None
                    fc_st_dist = fc_st_info.get("distance_km") if isinstance(fc_st_info, dict) else None
                    if fc_st_name:
                        fc_dist_str = f" (~{float(fc_st_dist):.1f} km away)" if fc_st_dist is not None else ""
                        lines.append(f"Forecast station (Upcoming days): {fc_st_name} (IMD){fc_dist_str}")
                    else:
                        lines.append(f"Forecast model (Upcoming days): {fc_src}")
                else:
                    lines.append(st_header)
            lines.append("")


            # Show summary only for today, not for historical ranges or plain forecast
            if isinstance(summary, str) and summary.strip() and not header_title.startswith("Historical") and "today" in header_title.lower():
                lines.append(f"Summary: {summary.strip()}")
                lines.append("")
            if isinstance(fc_list, list):
                if fc_list:
                    is_single_dt = bool(target_dt and target_dt != today_str and "date_range" not in st_timeframe and "forecast" not in st_timeframe)
                    for item in fc_list:
                        lines.extend(_forecast_item_detail_lines(item, is_single_target_date=is_single_dt))
                elif header_title.startswith("Historical"):
                    lines.append(f"Historical daily observations are not available in station records for {location}.")


    # ------------------------------------------------------------------
    # Tool 3: get_temperature_info
    # ------------------------------------------------------------------
    elif "temperature_timeframe_data" in data:
        temp_data = data.get("temperature_timeframe_data", {}) if isinstance(data.get("temperature_timeframe_data"), dict) else {}
        st_tf = str(temp_data.get("selected_timeframe") or "")
        today_t = temp_data.get("today_temperature", {}) if isinstance(temp_data.get("today_temperature"), dict) else {}
        is_today_temp = st_tf == "today" or (
            bool(today_t)
            and "days_temperature_forecast" not in st_tf
            and "specific_target_date" not in st_tf
            and "date_range" not in st_tf
        )

        st_name, dist = _extract_primary_station(data, fallback_location=location)

        lines.append(f"Temperature — {location}")
        if st_name and (st_name.lower() != location.lower() or dist is not None):
            dist_str = f" (~{float(dist):.1f} km away)" if dist is not None else ""
            lines.append(f"Observation station: {st_name}{dist_str}")
        elif not st_name:
            lines.append(f"Notice: No active IMD weather station found within 50.0 km radius search range of {location}.")

        if st_tf and st_tf != "today":
            lines.append(f"Timeframe: {st_tf}")
        lines.append("")

        if isinstance(summary, str) and summary.strip():
            lines.append(f"Summary: {summary.strip()}")
            lines.append("")

        if not st_name:
            pass
        elif is_today_temp and today_t:
            # Temperature focused readings
            cur_temp = today_t.get("observed_temp_c") or today_t.get("temperature_c") or today_t.get("max_temp_c") or today_t.get("max_temp")
            feel = today_t.get("feel_like_c")
            min_t = today_t.get("forecast_min_temp_c") or today_t.get("min_temp_c") or today_t.get("min_temp") or today_t.get("observed_min_temp")
            max_t = today_t.get("forecast_max_temp_c") or today_t.get("max_temp_c") or today_t.get("max_temp") or today_t.get("observed_max_temp")
            hum = today_t.get("humidity_pct") or today_t.get("humidity_0830") or today_t.get("humidity_1730")
            cond = today_t.get("forecast_condition") or today_t.get("weather_condition") or today_t.get("condition")

            if cur_temp is not None and str(cur_temp).strip() not in {"", "N/A"}:
                cur_str = f"- Current temperature: {cur_temp}°C"
                if feel is not None and str(feel).strip() not in {"", "N/A", "0"}:
                    cur_str += f" (Feels like: {feel}°C)"
                lines.append(cur_str)

            temp_range = _fmt_temp(min_t, max_t)
            if temp_range:
                lines.append(f"- Expected range: {temp_range}")
            if hum is not None and str(hum).strip() not in {"", "N/A"}:
                lines.append(f"- Humidity: {hum}%")
            if cond and str(cond).strip() not in {"", "N/A"}:
                lines.append(f"- Condition: {cond}")
        else:
            temp_list = None
            if "specific_target_date" in st_tf or "target_date_temperature" in temp_data:
                tdt = temp_data.get("target_date_temperature", {})
                if isinstance(tdt, dict):
                    if tdt.get("notice"):
                        lines.append(str(tdt.get("notice")))
                        lines.append("")
                    if any(k in tdt for k in ("min_temp", "max_temp", "forecast_min_temp", "observed_min_temp", "observed_min_temp_c", "min_temp_c")):
                        temp_list = [tdt]
                    elif "available_7day_temperature_forecast_trend" in tdt:
                        temp_list = tdt.get("available_7day_temperature_forecast_trend", [])
            elif "temperature_range" in temp_data:
                temp_list = temp_data.get("temperature_range")
            elif "temperature_forecast_list" in temp_data:
                temp_list = temp_data.get("temperature_forecast_list")

            if temp_list is None and today_t:
                temp_list = [today_t]

            if isinstance(temp_list, list) and temp_list:
                for item in temp_list:
                    lines.extend(_temperature_item_detail_lines(item))

    # ------------------------------------------------------------------
    # Tool 5: get_weather_nowcast
    # ------------------------------------------------------------------
    elif "severity_color" in data or "valid_upto" in data or "active_nowcast_categories" in data:
        st_name, dist = _extract_primary_station(data, fallback_location=location)

        lines.append(f"Nowcast & Thunderstorm — {location}")
        if st_name and (st_name.lower() != location.lower() or dist is not None):
            dist_str = f" (~{float(dist):.1f} km away)" if dist is not None else ""
            lines.append(f"Observation station: {st_name}{dist_str}")
        lines.append("")

        sev = str(data.get("severity_color") or "Green")
        msg = data.get("consolidated_message")
        if "Red" in sev:
            lines.append(f"Nowcast Status: 🔴 Red alert — {sev}")
        elif "Orange" in sev:
            lines.append(f"Nowcast Status: 🟠 Orange alert — {sev}")
        elif "Yellow" in sev:
            lines.append(f"Nowcast Status: 🟡 Yellow alert — {sev}")
        else:
            lines.append(f"Nowcast Status: 🟢 Normal (No Warning) — {sev}")

        if data.get("valid_upto"):
            lines.append(f"Valid Upto: {data.get('valid_upto')}")
        if msg:
            lines.append(f"Details: {msg}")

        active_cats = data.get("active_nowcast_categories", [])
        if active_cats:
            lines.append("")
            lines.append("Active nowcast warnings:")
            for c in active_cats:
                if isinstance(c, dict):
                    desc = c.get("category_description") or c.get("category_key")
                    lines.append(f"  - {desc}")
                elif isinstance(c, str):
                    lines.append(f"  - {c}")

        if isinstance(summary, str) and summary.strip():
            lines.append("")
            lines.append(f"Summary: {summary.strip()}")

        # Concise live observation snapshot from single primary station (no duplicate AWS dump)
        imd_current = data.get("imd_current_weather") if isinstance(data.get("imd_current_weather"), dict) else {}
        cur_st = imd_current.get("station") if imd_current.get("success") and isinstance(imd_current.get("station"), dict) else {}
        aws = data.get("nearest_live_aws_station", {})
        aws_st = aws.get("station", {}) if isinstance(aws, dict) and aws.get("success") else {}
        st = cur_st or aws_st
        if st:
            lines.append("")
            lines.append("Live observation snapshot:")
            temp_c = st.get("temperature_c") or st.get("observed_max_temp") or st.get("Temperature")
            if temp_c is not None:
                lines.append(f"  - Temperature: {temp_c}°C")
            cond = st.get("weather_description") or st.get("weather_message")
            if cond:
                lines.append(f"  - Condition: {cond}")
            wind = _station_wind(st)
            if wind:
                lines.append(f"  - Wind: {wind}")
            rain = st.get("past_24hrs_rainfall_mm") or st.get("past_24hrs_rainfall") or st.get("Rainfall")
            if rain is not None:
                lines.append(f"  - Rainfall (24h): {rain} mm")

    # ------------------------------------------------------------------
    # Tool 4: get_location_weather
    # ------------------------------------------------------------------
    elif "weather_details" in data:
        w_det = data.get("weather_details", {}) if isinstance(data.get("weather_details"), dict) else {}
        fc_block = w_det.get("forecast", {}) if isinstance(w_det.get("forecast"), dict) else {}
        fc_today = fc_block.get("today", {}) if isinstance(fc_block.get("today"), dict) else {}
        fc_days = fc_block.get("forecast") if isinstance(fc_block.get("forecast"), list) else []

        st_name, dist = _extract_primary_station(data, fallback_location=location)

        lines.append(f"Location weather — {location}")
        if st_name and (st_name.lower() != location.lower() or dist is not None):
            dist_str = f" (~{float(dist):.1f} km away)" if dist is not None else ""
            lines.append(f"Observation station: {st_name}{dist_str}")
        lines.append("")

        if isinstance(summary, dict):
            for k, v in summary.items():
                if v is None:
                    continue
                lines.append(f"{k.replace('_', ' ').title()}: {v}")
            lines.append("")
        elif isinstance(summary, str) and summary.strip():
            lines.append(f"Summary: {summary.strip()}")
            lines.append("")

        imd_current = data.get("imd_current_weather") if isinstance(data.get("imd_current_weather"), dict) else {}
        cur_st = imd_current.get("station") if imd_current.get("success") and isinstance(imd_current.get("station"), dict) else {}
        aws_block = w_det.get("nearest_aws", {}) if isinstance(w_det.get("nearest_aws"), dict) else {}
        aws_st = aws_block.get("station", {}) if isinstance(aws_block.get("station"), dict) else {}
        st = cur_st or aws_st

        if st:
            lines.append("Live observation")
            lines.extend(_live_station_detail_lines(st, fallback_location=location))
            lines.append("")

        if fc_today:
            lines.append("Today's forecast")
            lines.extend(_forecast_item_detail_lines(fc_today, default_date=fc_today.get("date") or "Today"))
            lines.append("")

        if fc_days:
            lines.append("Upcoming days")
            for item in fc_days:
                if isinstance(item, dict):
                    day_num = item.get("day")
                    labeled = dict(item)
                    if day_num is not None and not labeled.get("date"):
                        labeled["date"] = f"Day {day_num}"
                    lines.extend(_forecast_item_detail_lines(labeled))

        district_block = w_det.get("district") if isinstance(w_det.get("district"), dict) else None
        if district_block:
            lines.append("")
            lines.append("District details")
            for k, v in district_block.items():
                if v is None or k in {"raw", "success"}:
                    continue
                if isinstance(v, (dict, list)):
                    continue
                lines.append(f"  {k}: {v}")

    # Consolidated Data Source Emission (Single deduplicated block)
    st_info = data.get("nearest_station_info")
    obs_src = (
        data.get("observation_data_source")
        or data.get("data_source")
        or (st_info.get("data_source") if isinstance(st_info, dict) else None)
        or (summary.get("data_source") if isinstance(summary, dict) else None)
    )
    if not obs_src:
        w_data = data.get("weather_data") if isinstance(data.get("weather_data"), dict) else {}
        results = data.get("results") if isinstance(data.get("results"), dict) else {}
        temp_data = data.get("temperature_timeframe_data") if isinstance(data.get("temperature_timeframe_data"), dict) else {}
        obs_src = (
            w_data.get("data_source")
            or results.get("data_source")
            or temp_data.get("data_source")
        )
    fc_src = (
        data.get("forecast_data_source")
        or (data.get("weather_data", {}).get("forecast_data_source") if isinstance(data.get("weather_data"), dict) else None)
    )

    if obs_src and fc_src and str(obs_src).strip() != str(fc_src).strip() and "Annam" in str(obs_src):
        single_source = f"Data Sources:\n- Today's observation: {obs_src}\n- Multi-day forecast: {fc_src}"

    elif obs_src:
        single_source = f"Data Source: {obs_src}"
    elif fc_src:
        single_source = f"Data Source: {fc_src}"
    else:
        single_source = None

    if single_source:
        lines.append("")
        lines.append(single_source)

    note = data.get("annam_unavailable_note") or (
        data.get("weather_data", {}).get("annam_unavailable_note")
        if isinstance(data.get("weather_data"), dict) else None
    )
    if note and single_source and "Annam" not in str(single_source):
        lines.append(str(note))

    # Fallback to summary if lines are empty
    if not lines:
        if isinstance(summary, dict):
            return json.dumps(summary, indent=2, ensure_ascii=False)
        return str(summary or json.dumps(data, indent=2, ensure_ascii=False))

    # Drop accidental blank-only runs and deduplicate Data Source lines
    cleaned: list[str] = []
    data_source_seen = False
    for line in lines:
        if line.startswith("Data Source:") or line.startswith("Observation source:") or line.startswith("Data source:"):
            if data_source_seen:
                continue
            data_source_seen = True
        if line == "" and cleaned and cleaned[-1] == "":
            continue
        cleaned.append(line)
    res = "\n".join(cleaned)
    return _ensure_weather_answer_spacing(res)


def _ensure_weather_answer_spacing(text: str) -> str:
    if not text or not isinstance(text, str):
        return text
    # Ensure blank line before Summary: if preceded by a non-empty line
    text = re.sub(r"([^\n])\n(Summary:)", r"\1\n\n\2", text)
    # Ensure blank line after Summary: if followed by a date line or non-empty line
    text = re.sub(r"(Summary:[^\n]+)\n(?=(?:Today \()?\d{4}-\d{2}-\d{2})", r"\1\n\n", text)
    # General: Ensure blank line before any date breakdown line (e.g., 2026-08-14 | ... or Today (2026-08-14) | ...) if preceded by non-empty line
    text = re.sub(r"([^\n])\n((?:Today \()?\d{4}-\d{2}-\d{2}[^\n]*\|)", r"\1\n\n\2", text)
    # Ensure blank line before station context sections (e.g., Annam AWS ground sensor or IMD observation station)
    text = re.sub(r"([^\n])\n(Annam AWS ground sensor|IMD observation station|Nearest IMD Station|Live observation)", r"\1\n\n\2", text)
    # Ensure blank line before Data Source: line if preceded by non-empty line
    text = re.sub(r"([^\n])\n(Data Source:|Observation source:|Data source:)", r"\1\n\n\2", text)
    # Collapse any accidental 3+ consecutive newlines to double newline
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def format_weather_envelope(data: dict[str, Any]) -> str:
    if data.get("location_unresolved") or data.get("error") == "location_unresolved":
        return data.get("message") or LOCATION_UNRESOLVED_MESSAGE

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
    """Format temperature range, rounding floats to 1 decimal place."""
    def _round_val(v: Any) -> Optional[str]:
        if _is_empty_val(v):
            return None
        try:
            return f"{float(v):.1f}"
        except (TypeError, ValueError):
            return str(v).strip() or None
    lo = _round_val(min_temp)
    hi = _round_val(max_temp)
    if lo and hi:
        return f"{lo}\u00b0C\u2013{hi}\u00b0C"
    if lo:
        return f"{lo}\u00b0C min"
    if hi:
        return f"{hi}\u00b0C max"
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
            _station_wind(station),
        ),
        _fmt_val("Pressure", station.get("mslp")),
        _fmt_val(
            "Conditions",
            station.get("weather_description") or station.get("weather_message"),
        ),
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
        if t.isdigit():
            t = f"{int(t):02d}:00"
        return f"{d} {t}"
    return d or t


def _with_unit(value: Any, unit: str) -> Optional[str]:
    if _is_empty_val(value):
        return None
    s = str(value).strip()
    if s.endswith(unit):
        return s
    return f"{s}{unit}"


def _present(value: Any) -> bool:
    return value is not None and str(value).strip() not in {"", "N/A", "None", "null"}


def _fmt_rain_val(val: Any) -> str:
    """Format rainfall value numerically. Converts NIL/NA/None to '0.0'."""
    if val is None:
        return "0.0"
    s = str(val).strip()
    if not s or s.upper() in {"NIL", "NA", "N/A", "NONE", "NULL", "TRACE", "TR"}:
        return "0.0"
    return s


def _forecast_item_detail_lines(item: Any, *, default_date: str = "Today", is_single_target_date: bool = False) -> list[str]:
    if not isinstance(item, dict):
        return []
    dt = str(item.get("date") or default_date).strip()
    day_num = item.get("day")
    today_str = datetime.now().strftime("%Y-%m-%d")

    if not is_single_target_date:
        if dt.lower() in ("today", "day 1", "day-1") or dt == today_str or day_num == 1:
            dt = f"Today (Day 1 - {today_str})"
        elif day_num:
            try:
                d_int = int(day_num)
                if d_int > 1:
                    dt = f"Day {d_int} ({dt})"
            except Exception:
                pass
    elif dt.lower() in ("today", "day 1", "day-1") or dt == today_str:
        dt = f"Today ({today_str})"
    fc_text = (
        item.get("forecast")
        or item.get("forecast_text")
        or item.get("forecast_condition")
        or item.get("weather_condition")
        or "Normal weather"
    )
    min_t = (
        item.get("forecast_min_temp")
        or item.get("forecast_min_temp_c")
        or item.get("observed_min_temp")
        or item.get("observed_min_temp_c")
        or item.get("min_temp")
        or item.get("min_temp_c")
    )
    max_t = (
        item.get("forecast_max_temp")
        or item.get("forecast_max_temp_c")
        or item.get("observed_max_temp")
        or item.get("observed_max_temp_c")
        or item.get("max_temp")
        or item.get("max_temp_c")
    )
    lines = [f"{dt} | {fc_text} | {_fmt_temp(min_t, max_t) or 'N/A'}"]
    is_historical_item = (
        str(item.get("date") or "").strip() < today_str
        or "observed" in str(fc_text).lower()
        or "history" in str(item.get("data_source") or "").lower()
    )
    rain_24h = (
        item.get("past_24hrs_rainfall")
        or item.get("observed_past_24hrs_rainfall")
        or item.get("observed_past_24hrs_rainfall_mm")
        or item.get("rainfall")
    )
    if is_historical_item:
        if _present(max_t) and str(max_t).strip().upper() not in {"N/A", "NA"}:
            lines.append(f"  Max Temp: {max_t}°C")
        if _present(min_t) and str(min_t).strip().upper() not in {"N/A", "NA"}:
            lines.append(f"  Min Temp: {min_t}°C")
        if _present(rain_24h) and str(rain_24h).strip().upper() not in {"N/A", "NA"}:
            lines.append(f"  Past 24h Rain: {_fmt_rain_val(rain_24h)} mm")
    if _present(item.get("humidity_0830")) and str(item.get("humidity_0830")).strip().upper() not in {"N/A", "NA"}:
        lines.append(f"  Humidity (Morning - 08:30 IST): {item.get('humidity_0830')}%")
    if _present(item.get("humidity_1730")) and str(item.get("humidity_1730")).strip().upper() not in {"N/A", "NA"}:
        lines.append(f"  Humidity (Evening - 17:30 IST): {item.get('humidity_1730')}%")
    if is_historical_item and _present(item.get("station")):
        lines.append(f"  Station: {item.get('station')}")
    # Sunrise/Sunset omitted — not relevant for farmers
    return lines


def _temperature_item_detail_lines(item: Any, *, default_date: str = "Today") -> list[str]:
    if not isinstance(item, dict):
        return []
    dt = str(item.get("date") or default_date).strip()
    today_str = datetime.now().strftime("%Y-%m-%d")
    if dt.lower() in ("today", "day 1", "day-1"):
        dt = f"Today ({today_str})"
    cond = (
        item.get("weather_condition")
        or item.get("forecast_condition")
        or item.get("forecast")
        or item.get("source")
        or "Normal weather"
    )
    lo = (
        item.get("min_temp")
        or item.get("min_temp_c")
        or item.get("forecast_min_temp_c")
        or item.get("forecast_min_temp")
        or item.get("observed_min_temp_c")
        or item.get("observed_min_temp")
        or item.get("observed_temp_c")
    )
    hi = (
        item.get("max_temp")
        or item.get("max_temp_c")
        or item.get("forecast_max_temp_c")
        or item.get("forecast_max_temp")
        or item.get("observed_max_temp_c")
        or item.get("observed_max_temp")
        or item.get("observed_temp_c")
    )
    lines = [f"{dt} | {cond} | {_fmt_temp(lo, hi) or 'N/A'}"]
    if _present(item.get("feel_like_c")):
        lines.append(f"  Feels like: {item.get('feel_like_c')}°C")
    if _present(item.get("humidity_pct")):
        lines.append(f"  Humidity: {item.get('humidity_pct')}%")
    if _present(item.get("humidity_0830")):
        lines.append(f"  Humidity 0830: {item.get('humidity_0830')}%")
    if _present(item.get("humidity_1730")):
        lines.append(f"  Humidity 1730: {item.get('humidity_1730')}%")
    return lines


def _rainfall_item_detail_lines(
    item: Any,
    *,
    rec: dict[str, Any] | None = None,
    today_str: str = "",
) -> list[str]:
    if not isinstance(item, dict):
        return []
    rec = rec or {}
    dt = item.get("date") or "Today"
    if str(dt).lower() in ("today", "day 1", "day-1"):
        dt = f"Today ({today_str})"
    desc = (
        item.get("forecast")
        or item.get("distribution_description")
        or item.get("category_description")
        or ("Observed rainfall" if today_str and str(dt) < today_str else "Rainfall Expected")
    )
    # Prefer station observed 24h rainfall first; if absent, use district actual
    station_rain = item.get("observed_past_24hrs_rainfall") or item.get("observed_past_24hrs_rainfall_mm") or item.get("observed_rainfall_mm")
    dist_rain = item.get("district_daily_actual_mm") or rec.get("Daily Actual")
    rain_val = station_rain if _present(station_rain) and str(station_rain).strip().upper() not in {"N/A", "NA", "NONE"} else dist_rain

    norm_val = item.get("district_daily_normal_mm") or rec.get("Daily Normal")
    dep_val = item.get("departure_pct") or rec.get("Daily Departure Per")
    cat = item.get("category_code") or item.get("category") or rec.get("Daily Category")
    cat_desc = item.get("category_description") or rec.get("Daily Category Description")
    lines = [f"{dt} | {desc}"]
    if _present(rain_val) and str(rain_val).strip().upper() not in {"N/A", "NA", "NONE"}:
        lines.append(f"  Recorded rainfall (Past 24 hours): {_fmt_rain_val(rain_val)} mm")
    if _present(norm_val) and str(norm_val).strip().upper() not in {"N/A", "NA", "NONE"}:
        lines.append(f"  Normal: {norm_val} mm")
    if _present(dep_val) and str(dep_val).strip().upper() not in {"N/A", "NA", "NONE"}:
        dep_str = str(dep_val).strip()
        lines.append(f"  Departure from normal: {dep_str}" if dep_str.endswith("%") else f"  Departure from normal: {dep_str}%")
    if _present(cat) and str(cat).strip().upper() not in {"N/A", "NA", "NONE", "ND"}:
        from ajrasakha.tools.weather.code import describe_rainfall_category
        cat_label = describe_rainfall_category(cat) or cat_desc or cat
        lines.append(f"  Category: {cat_label}")
    if _present(item.get("weekly_cumulative_mm")) and str(item.get("weekly_cumulative_mm")).strip().upper() not in {"N/A", "NA", "NONE"}:
        lines.append(f"  Weekly cumulative: {item.get('weekly_cumulative_mm')} mm")
    return lines


def _district_rainfall_record_lines(rec: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    mapping = [
        ("Daily Actual", "Daily actual", "mm"),
        ("Daily Normal", "Daily normal", "mm"),
        ("Daily Departure Per", "Daily departure", "%"),
        ("Daily Category", "Daily category", ""),
        ("Daily Category Description", "Daily category description", ""),
        ("Weekly Actual", "Weekly actual", "mm"),
        ("Weekly Normal", "Weekly normal", "mm"),
        ("Weekly Departure Per", "Weekly departure", "%"),
        ("Weekly Category", "Weekly category", ""),
        ("Weekly Category Description", "Weekly category description", ""),
        ("Monthly Actual", "Monthly actual", "mm"),
        ("Monthly Normal", "Monthly normal", "mm"),
        ("Monthly Departure Per", "Monthly departure", "%"),
        ("Monthly Category", "Monthly category", ""),
        ("Monthly Category Description", "Monthly category description", ""),
        ("Cumulative Actual", "Monsoon cumulative actual", "mm"),
        ("Cumulative Normal", "Monsoon cumulative normal", "mm"),
        ("Cumulative Departure Per", "Monsoon cumulative departure", "%"),
        ("Cumulative Category", "Monsoon category", ""),
        ("Cumulative Category Description", "Monsoon category description", ""),
    ]
    for key, label, unit in mapping:
        val = rec.get(key)
        if not _present(val) or str(val).strip().upper() in {"N/A", "NA", "NONE", "NULL", "ND"}:
            continue
        suffix = f" {unit}" if unit and not str(val).endswith(unit) else ""
        lines.append(f"  {label}: {val}{suffix}")
    return lines


def _today_weather_fallback_lines(tw: dict[str, Any], *, location: str) -> list[str]:
    cond = (
        tw.get("weather_description")
        or tw.get("weather_message")
        or tw.get("forecast")
        or "Normal weather"
    )
    obs_temp = tw.get("observed_max_temp") or tw.get("observed_min_temp") or tw.get("forecast_max_temp")
    lines: list[str] = []
    if obs_temp is not None:
        lines.append(f"Temperature: {obs_temp}°C")
    hum = tw.get("humidity_0830") or tw.get("humidity_1730")
    if _present(hum):
        lines.append(f"Humidity: {hum}%")
    rain = tw.get("past_24hrs_rainfall")
    if _present(rain):
        lines.append(f"Rain 24h: {_fmt_rain_val(rain)} mm")
    wind_val = _station_wind(tw)
    if wind_val:
        lines.append(f"Wind: {wind_val}")
    if cond and cond != "Normal weather":
        lines.append(f"Condition: {cond}")
    return lines


def _common_weather_extra_lines(
    data: dict[str, Any],
    *,
    location: str,
    skip_live_current: bool = False,
    skip_summary: bool = False,
) -> list[str]:
    """Append shared extras available on any weather tool payload."""
    lines: list[str] = []
    summary = data.get("summary")
    if not skip_summary and isinstance(summary, str) and summary.strip():
        clean_sum = re.sub(r"\bNIL\s*mm\b", "0.0 mm", summary, flags=re.I)
        lines.append("")
        lines.append(f"Summary: {clean_sum.strip()}")
        lines.append("")

    if not skip_live_current:
        imd_current = data.get("imd_current_weather")
        if isinstance(imd_current, dict) and imd_current.get("success"):
            st = imd_current.get("station") if isinstance(imd_current.get("station"), dict) else {}
            if st:
                lines.append("")
                title = f"Live current weather — {st.get('name') or location}"
                if imd_current.get("distance_km") is not None:
                    title += f" (~{imd_current.get('distance_km')} km away)"
                lines.append(title)
                lines.extend(_live_station_detail_lines(st, fallback_location=location))

        aws = data.get("nearest_live_aws_station")
        if isinstance(aws, dict) and aws.get("success"):
            aws_st = aws.get("station") if isinstance(aws.get("station"), dict) else {}
            if aws_st and not (
                isinstance(imd_current, dict)
                and imd_current.get("success")
                and isinstance(imd_current.get("station"), dict)
            ):
                lines.append("")
                title = f"Nearest AWS station — {aws_st.get('name') or location}"
                if aws.get("distance_km") is not None:
                    title += f" (~{aws.get('distance_km')} km away)"
                lines.append(title)
                lines.extend(_live_station_detail_lines(aws_st, fallback_location=location))

    st_info = data.get("nearest_station_info")
    if isinstance(st_info, dict) and st_info and not skip_live_current:
        lines.append("")
        # Label by data source role for clarity
        st_src = str(st_info.get("data_source") or "").lower()
        if "annam" in st_src:
            lines.append("Annam AWS ground sensor (observations)")
        elif "imd" in st_src:
            lines.append("IMD observation station")
        else:
            lines.append("Nearest observation station")
        for key, label in (
            ("nearest_station_name", "Station"),
            ("station_name", "Station"),
            ("distance_from_requested_place_km", "Distance"),
            ("distance_km", "Distance"),
            ("district", "District"),
            ("state", "State"),
            ("nearest_station_note", "Note"),
        ):
            val = st_info.get(key)
            if _present(val):
                if "distance" in key:
                    try:
                        lines.append(f"  {label}: {float(val):.1f} km")
                    except (TypeError, ValueError):
                        lines.append(f"  {label}: {val} km")
                else:
                    lines.append(f"  {label}: {val}")
        details = st_info.get("station_details")
        if isinstance(details, dict):
            for k, v in details.items():
                if _present(v) and not isinstance(v, (dict, list)):
                    if k in {"data_source", "source", "observation_data_source", "forecast_data_source"}:
                        continue
                    if k in {"wind_direction_code", "wind_direction_deg"} and details.get("wind_direction"):
                        continue
                    if k == "weather_code" and details.get("weather_description"):
                        continue
                    lines.append(f"  {_format_station_detail_field(k, v)}")

    nearby = data.get("nearby_stations_within_radius")
    nearby_list = None
    if isinstance(nearby, dict):
        nearby_list = nearby.get("nearby_stations") or nearby.get("stations")
        if nearby.get("total_returned") is not None:
            lines.append("")
            lines.append(
                f"Nearby stations: {nearby.get('total_returned')} within "
                f"{nearby.get('max_radius_km', 'N/A')} km"
            )
    elif isinstance(nearby, list):
        nearby_list = nearby
    if isinstance(nearby_list, list) and nearby_list:
        if not any(l.startswith("Nearby stations") for l in lines[-3:]):
            lines.append("")
            lines.append(f"Nearby stations ({len(nearby_list)})")
        for st in nearby_list[:8]:
            if not isinstance(st, dict):
                continue
            name = st.get("name") or st.get("station") or "Station"
            dist = st.get("distance_km")
            temp = st.get("temperature_c")
            hum = st.get("humidity_pct")
            cond = st.get("weather_description") or st.get("weather_message")
            bit = f"- {name}"
            if dist is not None:
                bit += f" (~{dist} km)"
            if temp is not None:
                bit += f" | {temp}°C"
            if hum is not None:
                bit += f" | humidity {hum}%"
            if cond:
                bit += f" | {cond}"
            lines.append(bit)
    return lines


def _format_station_detail_field(key: str, value: Any) -> str:
    """Render a station detail field with code → description and proper units."""
    k_lower = key.lower()
    if key in {"wind_direction_code", "wind_direction_deg"}:
        return f"Wind direction: {describe_wind_direction(value)}"
    if key == "weather_code":
        desc = describe_current_weather(value)
        return f"Weather: {desc or value}"
    if "temperature" in k_lower or k_lower in {"temp", "temp_c", "feel_like_c"}:
        try:
            return f"{key.replace('_', ' ').title()}: {float(value):.1f}°C"
        except (TypeError, ValueError):
            return f"{key.replace('_', ' ').title()}: {value}°C"
    if "humidity" in k_lower:
        try:
            return f"{key.replace('_', ' ').title()}: {float(value):.1f}%"
        except (TypeError, ValueError):
            return f"{key.replace('_', ' ').title()}: {value}%"
    if "rainfall" in k_lower:
        return f"{key.replace('_', ' ').title()}: {value} mm"
    if "wind_speed" in k_lower or k_lower == "windspeed":
        unit = "km/h" if "kmph" in k_lower else "m/s"
        return f"{key.replace('_', ' ').title()}: {value} {unit}"
    if k_lower in {"mslp", "atm_pressure", "atmpressure", "pressure"}:
        return f"{key.replace('_', ' ').title()}: {value} hPa"
    if "distance" in k_lower:
        try:
            return f"{key.replace('_', ' ').title()}: {float(value):.1f} km"
        except (TypeError, ValueError):
            return f"{key.replace('_', ' ').title()}: {value} km"
    label = key.replace("_", " ").strip().title()
    return f"{label}: {value}"


def _wind(speed: Any, direction: Any) -> Optional[str]:
    parts: list[str] = []
    if not _is_empty_val(speed):
        parts.append(f"{speed} km/h")
    if not _is_empty_val(direction):
        d = str(direction).strip()
        if d.replace(".", "", 1).isdigit():
            described = describe_wind_direction(d)
            parts.append(described if described and described != d else f"direction {d}°")
        else:
            parts.append(d)
    return " ".join(parts) if parts else None


def _station_wind(station: dict[str, Any] | None) -> Optional[str]:
    if not isinstance(station, dict):
        return None
    direction = station.get("wind_direction")
    if _is_empty_val(direction):
        direction = describe_wind_direction(
            station.get("wind_direction_code") or station.get("wind_direction_deg")
        )
    speed = station.get("wind_speed_kmph")
    if _is_empty_val(speed) and station.get("wind_speed_mps") is not None:
        try:
            speed = round(float(station["wind_speed_mps"]) * 3.6, 1)
        except (TypeError, ValueError):
            speed = station.get("wind_speed_mps")
    return _wind(speed, direction)


def _live_station_detail_lines(
    station: dict[str, Any] | None,
    *,
    fallback_location: str | None = None,
) -> list[str]:
    """Full live observation lines for Annam AWS or IMD current_wx / AWS station dicts."""
    st = station if isinstance(station, dict) else {}
    today_date_str = datetime.now().strftime("%Y-%m-%d")
    raw_obs_date = st.get("date")
    if not raw_obs_date or str(raw_obs_date) < today_date_str:
        raw_obs_date = today_date_str
    raw_obs_time = st.get("time")
    obs_at = (
        st.get("observation_timestamp")
        or st.get("TimeStamp")
        or _join_date_time(raw_obs_date, raw_obs_time)
        or str(raw_obs_date)
    )

    # Resolve weather condition: prefer text description, then decode raw code
    cond = st.get("weather_description") or st.get("weather_message")
    code_raw = st.get("weather_code_raw") or st.get("weather_code")
    if code_raw is not None and str(code_raw).strip() not in {"", "0", "00"}:
        cond = f"{cond} (code {str(code_raw).strip()})" if cond else (describe_current_weather(code_raw) or f"Code {str(code_raw).strip()}")
    cond = cond or "Clear Sky"

    def _fmt_obs_temp(v: Any) -> str:
        if _is_empty_val(v):
            return "N/A"
        try:
            return f"{float(v):.1f}°C"
        except (TypeError, ValueError):
            return f"{v}°C"

    lines: list[str] = []

    is_annam = _is_annam_source(st.get("data_source"))
    dev_id = st.get("station_code") or st.get("device_id") or st.get("DeviceId") or st.get("Annam_ID")
    if dev_id and ("ANNAM" in str(dev_id).upper() or str(dev_id).isdigit()):
        is_annam = True

    # Temperature
    temp_c = st.get("temperature_c") if st.get("temperature_c") is not None else (
        st.get("observed_max_temp") if st.get("observed_max_temp") is not None else st.get("Temperature")
    )
    temp_str = _fmt_obs_temp(temp_c)
    feel = st.get("feel_like_c")
    if feel is not None and str(feel).strip() not in {"", "N/A"}:
        lines.append(f"Temperature: {temp_str} (Feels like: {_fmt_obs_temp(feel)})")
    else:
        lines.append(f"Temperature: {temp_str}")

    # Humidity
    hum = st.get("humidity_pct") if st.get("humidity_pct") is not None else (
        st.get("humidity_0830") if st.get("humidity_0830") is not None else (
            st.get("humidity_1730") if st.get("humidity_1730") is not None else st.get("Humidity")
        )
    )
    if hum is not None and str(hum).strip() not in {"", "N/A"}:
        lines.append(f"Humidity: {hum}%")

    # Rainfall (24h)
    rain = _fmt_rain_val(st.get("past_24hrs_rainfall_mm") if st.get("past_24hrs_rainfall_mm") is not None else (
        st.get("past_24hrs_rainfall") if st.get("past_24hrs_rainfall") is not None else st.get("Rainfall")
    ))
    if rain is not None and str(rain).strip() not in {"", "N/A"}:
        lines.append(f"Rain 24h: {rain} mm")

    # Wind
    wind_val = _station_wind(st)
    if not wind_val and st.get("wind_speed_mps") is not None:
        ws = st.get("wind_speed_mps")
        wdir = st.get("wind_direction") or st.get("wind_direction_deg")
        w_desc = f"{float(ws):.1f} m/s" if isinstance(ws, (int, float)) else f"{ws} m/s"
        if wdir:
            w_desc += f" ({wdir})"
        wind_val = w_desc
    if wind_val:
        lines.append(f"Wind: {wind_val}")

    # Sky condition
    if cond and cond != "Clear Sky":
        lines.append(f"Condition: {cond}")
    elif not is_annam:
        lines.append(f"Condition: {cond}")

    # Pressure — only for Annam (IMD pressure less reliable from synoptic)
    if is_annam:
        press = st.get("mslp") if st.get("mslp") is not None else (
            st.get("atm_pressure") if st.get("atm_pressure") is not None else st.get("AtmPressure")
        )
        if press is not None and str(press).strip() not in {"", "N/A"}:
            lines.append(f"Pressure: {press} hPa")

    return lines


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