"""Deterministic human-readable formatting for specialist tool JSON (weather, etc.)."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Optional

from ajrasakha.tools.weather.code import describe_current_weather, describe_wind_direction

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

    if tool_name in ["weather", "new_weather", "get_current_and_forecast_info", "get_rainfall_and_monsoon_info", "get_temperature_info", "get_location_weather", "get_weather_nowcast", "get_weather_alerts", "get_sowing_weather_guide"]:
        try:
            data = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return text
        if isinstance(data, dict):
            # Envelope: {"answer": "...", "tool_data": {...}} — prefer deterministic tool_data formatter
            if "tool_data" in data and isinstance(data["tool_data"], dict):
                return format_new_weather_tool_dict(data["tool_data"])
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

    lines: list[str] = []
    today_str = datetime.now().strftime("%Y-%m-%d")
    location = data.get("resolved_location") or data.get("district") or "Location"
    summary = data.get("summary")
    shown_live_current = False

    # ------------------------------------------------------------------
    # Tool 7: get_sowing_weather_guide
    # ------------------------------------------------------------------
    if data.get("tool") == "get_sowing_weather_guide" or "sowing_guidance" in data:
        crop = data.get("crop_name") or "crop"
        lines.append(f"Sowing weather guide — {location}")
        lines.append("")
        if data.get("query_type"):
            lines.append(f"- Query type: {data.get('query_type')}")
        lines.append(f"- Crop: {crop}")
        if data.get("sowing_guidance"):
            lines.append(f"- Guidance: {data.get('sowing_guidance')}")
        ctx = data.get("sowing_weather_context")
        if isinstance(ctx, dict) and ctx:
            lines.append("- Current weather context:")
            for k in ("date", "forecast", "forecast_min_temp", "forecast_max_temp", "past_24hrs_rainfall", "humidity_0830", "humidity_1730"):
                if ctx.get(k) is not None and str(ctx.get(k)).strip() != "":
                    lines.append(f"  - {k}: {ctx.get(k)}")

    # ------------------------------------------------------------------
    # Tool 6: get_weather_alerts
    # ------------------------------------------------------------------
    elif "district_5day_warnings" in data or "district_alerts_list" in data or data.get("is_state_wide_query"):
        lines.append(f"District weather warnings — {location}")
        lines.append("")
        if isinstance(summary, str) and summary.strip():
            lines.append(f"Summary: {summary.strip()}")
            lines.append("")

        if "district_5day_warnings" in data:
            warnings = data.get("district_5day_warnings", [])
            req_days = data.get("requested_days_count") or 5
            if isinstance(warnings, list) and req_days < len(warnings):
                warnings = warnings[:req_days]
            for w in warnings:
                if not isinstance(w, dict):
                    continue
                day_label = w.get("day", "Day")
                desc = w.get("warning_description", "No Warning")
                w_code = w.get("warning_codes", "1")
                sev = str(w.get("severity") or "")
                if "Red" in sev:
                    lines.append(f"{day_label}: 🔴 Red alert — {desc}")
                elif "Orange" in sev:
                    lines.append(f"{day_label}: 🟠 Orange alert — {desc}")
                elif "Yellow" in sev:
                    lines.append(f"{day_label}: 🟡 Yellow alert — {desc}")
                else:
                    lines.append(f"{day_label}: 🟢 Green (No Warning) — {desc}")
                lines.append(f"  Warning code(s): {w_code}")
                if sev:
                    lines.append(f"  Severity: {sev}")

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

        lines.append(f"Rainfall — {location}")
        if tf:
            lines.append(f"Timeframe: {tf}")
        lines.append("")
        if isinstance(summary, str) and summary.strip():
            lines.append(f"Summary: {summary.strip()}")
            lines.append("")

        if isinstance(rf_list, list) and rf_list:
            for item in rf_list:
                lines.extend(_rainfall_item_detail_lines(item, rec=rec, today_str=today_str))
        if rec:
            lines.append("")
            lines.append("District rainfall statistics")
            lines.extend(_district_rainfall_record_lines(rec))

        subdiv = results.get("subdivision_rainfall") or results.get("matched_subdivision_rainfall") or data.get("subdivision_rainfall")
        if isinstance(subdiv, dict) and subdiv:
            lines.append("")
            lines.append("Subdivision rainfall")
            for k, v in subdiv.items():
                if v is None or k in {"success", "raw"}:
                    continue
                lines.append(f"  {k}: {v}")

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

        imd_current = data.get("imd_current_weather") or w_data.get("imd_current_weather")
        cur_st = {}
        if isinstance(imd_current, dict) and imd_current.get("success"):
            cur_st = imd_current.get("station") if isinstance(imd_current.get("station"), dict) else {}

        fc_list = None
        fc_list = None
        if is_today_current:
            tw = w_data.get("today_weather", {}) if isinstance(w_data.get("today_weather"), dict) else {}
            has_annam = bool(tw and _is_annam_source(tw.get("data_source") or data.get("data_source")))

            if has_annam:
                st_name = tw.get("station") or location
                dist = tw.get("distance_to_station_km")
            else:
                st_info = data.get("nearest_station_info") if isinstance(data.get("nearest_station_info"), dict) else {}
                st_info_dist = st_info.get("distance_from_requested_place_km") if st_info else None
                if st_info_dist is None and st_info:
                    st_info_dist = st_info.get("distance_km")
                imd_dist = imd_current.get("distance_km") if isinstance(imd_current, dict) else None

                if st_info and st_info_dist is not None and (imd_dist is None or float(st_info_dist) <= float(imd_dist)):
                    st_name = st_info.get("nearest_station_name") or st_info.get("station_name") or cur_st.get("name") or location
                    dist = st_info_dist
                    st_det = st_info.get("station_details")
                    if isinstance(st_det, dict) and st_det:
                        cur_st = st_det
                else:
                    st_name = cur_st.get("name") or tw.get("station") or location
                    dist = imd_dist if imd_dist is not None else tw.get("distance_to_station_km")

            query_type_val = str(data.get("query_type") or "").lower().strip()
            if query_type_val == "current":
                title = f"Live weather — {st_name}"
            else:
                title = f"Today's weather — {st_name} ({today_str})"

            if dist is not None and str(dist).strip() not in {"", "N/A"}:
                title += f" (~{dist} km away)"
            lines.append(title)
            lines.append("")
            if isinstance(summary, str) and summary.strip():
                lines.append(f"Summary: {summary.strip()}")
                lines.append("")

            if has_annam:
                lines.extend(_forecast_item_detail_lines(tw, default_date=tw.get("date") or "Today"))
                shown_live_current = True
            elif cur_st:
                lines.extend(_live_station_detail_lines(cur_st, fallback_location=location))
                shown_live_current = True
            elif tw:
                lines.extend(_today_weather_fallback_lines(tw, location=location))
                shown_live_current = True
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
                    elif "fallback_today_weather" in tdw:
                        fb = tdw.get("fallback_today_weather")
                        fc_list = [fb] if isinstance(fb, dict) else []
                    elif "available_7day_forecast_trend" in tdw:
                        fc_list = tdw.get("available_7day_forecast_trend", [])
            if fc_list is None:
                fc_list = w_data.get("forecast_list") or w_data.get("historical_weather_range") or []

            target_dt = data.get("target_date") or w_data.get("target_date")
            from_dt = data.get("from_date") or w_data.get("from_date")
            if "date_range" in st_timeframe or "previous" in st_timeframe or from_dt or (target_dt and target_dt < today_str):
                title = f"Historical weather ({target_dt})" if target_dt else "Historical weather"
            elif target_dt == today_str or st_timeframe == "today":
                title = f"Today's weather ({today_str})"
            else:
                title = "Forecast"
            lines.append(f"{title} — {location}")
            lines.append("")
            if isinstance(summary, str) and summary.strip():
                sum_text = summary.strip()
                if title.startswith("Historical weather") or (target_dt and target_dt < today_str) or from_dt or "previous" in st_timeframe or "date_range" in st_timeframe:
                    sum_text = (
                        sum_text.replace("Recorded/forecast weather range", "Recorded historical weather range")
                        .replace("Weather forecast for", "Historical weather for")
                        .replace(", Forecast:", ", Condition:")
                    )
                elif target_dt and target_dt == today_str:
                    sum_text = sum_text.replace("Weather forecast for", "Today's weather for").replace(", Forecast:", ", Condition:")
                lines.append(f"Summary: {sum_text}")
                lines.append("")
            if isinstance(fc_list, list):
                for item in fc_list:
                    lines.extend(_forecast_item_detail_lines(item))

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

        imd_current = data.get("imd_current_weather") if isinstance(data.get("imd_current_weather"), dict) else {}
        cur_st = imd_current.get("station") if imd_current.get("success") and isinstance(imd_current.get("station"), dict) else {}

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

        if is_today_temp and cur_st:
            st_name = cur_st.get("name") or today_t.get("station_name") or location
            dist = imd_current.get("distance_km")
            title = f"Current weather — {st_name}"
            if dist is not None:
                title += f" (~{dist} km away)"
            lines.append(title)
            if st_tf:
                lines.append(f"Timeframe: {st_tf}")
            lines.append("")
            if isinstance(summary, str) and summary.strip():
                lines.append(f"Summary: {summary.strip()}")
                lines.append("")
            lines.extend(_live_station_detail_lines(cur_st, fallback_location=location))
            shown_live_current = True
            if today_t:
                lines.append("")
                lines.append("Today's temperature details")
                lines.extend(_temperature_item_detail_lines(today_t, default_date=today_t.get("date") or "Today"))
        else:
            if temp_list is None and today_t:
                temp_list = [today_t]
            lines.append(f"Temperature — {location}")
            if st_tf:
                lines.append(f"Timeframe: {st_tf}")
            lines.append("")
            if isinstance(summary, str) and summary.strip():
                lines.append(f"Summary: {summary.strip()}")
                lines.append("")
            if isinstance(temp_list, list) and temp_list:
                for item in temp_list:
                    lines.extend(_temperature_item_detail_lines(item))

    # ------------------------------------------------------------------
    # Tool 5: get_weather_nowcast
    # ------------------------------------------------------------------
    elif "severity_color" in data or "valid_upto" in data or "active_nowcast_categories" in data:
        imd_current = data.get("imd_current_weather") if isinstance(data.get("imd_current_weather"), dict) else {}
        cur_st = imd_current.get("station") if imd_current.get("success") and isinstance(imd_current.get("station"), dict) else {}
        aws = data.get("nearest_live_aws_station", {})
        aws_st = aws.get("station", {}) if isinstance(aws, dict) and aws.get("success") else {}
        st = cur_st or (aws_st if isinstance(aws_st, dict) else {})
        st_name = st.get("name") or location
        dist = (
            imd_current.get("distance_km")
            if isinstance(imd_current, dict) and imd_current.get("distance_km") is not None
            else (aws.get("distance_km") if isinstance(aws, dict) else None)
        )
        if dist is None and isinstance(data.get("nearest_station_info"), dict):
            dist = data.get("nearest_station_info", {}).get("distance_from_requested_place_km")

        title = f"Nowcast — {st_name}"
        if dist is not None:
            title += f" (~{dist} km away)"
        lines.append(title)
        lines.append("")
        if isinstance(summary, str) and summary.strip():
            lines.append(f"Summary: {summary.strip()}")
            lines.append("")
        if st:
            lines.append("Live observation")
            lines.extend(_live_station_detail_lines(st, fallback_location=location))
            shown_live_current = True
            lines.append("")

        # Show nearest AWS separately when it differs from the IMD current station already shown.
        if (
            isinstance(aws, dict)
            and aws.get("success")
            and isinstance(aws_st, dict)
            and aws_st
        ):
            aws_name = aws_st.get("name")
            imd_name = cur_st.get("name") if isinstance(cur_st, dict) else None
            if aws_name and aws_name != imd_name:
                title = f"Nearest AWS station — {aws_name}"
                if aws.get("distance_km") is not None:
                    title += f" (~{aws.get('distance_km')} km away)"
                lines.append(title)
                lines.extend(_live_station_detail_lines(aws_st, fallback_location=location))
                lines.append("")

        sev = str(data.get("severity_color") or "Green")
        if "Red" in sev:
            lines.append(f"Nowcast Warning Status: 🔴 Red alert — {sev}")
        elif "Orange" in sev:
            lines.append(f"Nowcast Warning Status: 🟠 Orange alert — {sev}")
        elif "Yellow" in sev:
            lines.append(f"Nowcast Warning Status: 🟡 Yellow alert — {sev}")
        else:
            lines.append(f"Nowcast Warning Status: No Warning — {sev}")

        if data.get("valid_upto"):
            lines.append(f"Valid Upto: {data.get('valid_upto')}")
        if data.get("consolidated_message"):
            lines.append(f"Consolidated message: {data.get('consolidated_message')}")

        active_cats = data.get("active_nowcast_categories", [])
        if active_cats:
            lines.append("Active nowcast categories:")
            for c in active_cats:
                if isinstance(c, dict):
                    code = c.get("category_code")
                    desc = c.get("category_description")
                    key = c.get("category_key")
                    lines.append(f"  - {desc or 'N/A'} (code {code or 'N/A'}{', ' + key if key else ''})")
                elif isinstance(c, str):
                    lines.append(f"  - {c}")

    # ------------------------------------------------------------------
    # Tool 4: get_location_weather
    # ------------------------------------------------------------------
    elif "weather_details" in data:
        w_det = data.get("weather_details", {}) if isinstance(data.get("weather_details"), dict) else {}
        fc_block = w_det.get("forecast", {}) if isinstance(w_det.get("forecast"), dict) else {}
        fc_today = fc_block.get("today", {}) if isinstance(fc_block.get("today"), dict) else {}
        fc_days = fc_block.get("forecast") if isinstance(fc_block.get("forecast"), list) else []
        imd_current = data.get("imd_current_weather") if isinstance(data.get("imd_current_weather"), dict) else {}
        cur_st = imd_current.get("station") if imd_current.get("success") and isinstance(imd_current.get("station"), dict) else {}
        aws_block = w_det.get("nearest_aws", {}) if isinstance(w_det.get("nearest_aws"), dict) else {}
        aws_st = aws_block.get("station", {}) if isinstance(aws_block.get("station"), dict) else {}
        st = cur_st or aws_st

        st_name = st.get("name") or "Nearest Active Weather Station"
        dist = imd_current.get("distance_km") if imd_current.get("distance_km") is not None else aws_block.get("distance_km")
        title = f"Location weather — {st_name}"
        if dist is not None:
            title += f" (~{dist} km away)"
        lines.append(title)
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

        if st:
            lines.append("Live observation")
            lines.extend(_live_station_detail_lines(st, fallback_location=location))
            shown_live_current = True
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

    # ------------------------------------------------------------------
    # Common extras for every weather tool response
    # ------------------------------------------------------------------
    lines.extend(
        _common_weather_extra_lines(
            data,
            location=location,
            skip_live_current=shown_live_current,
            skip_summary=True,  # already inlined above where useful
        )
    )

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
        single_source = f"Data Source: {obs_src} (Observations) | {fc_src} (Multi-day Forecast)"
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


def _forecast_item_detail_lines(item: Any, *, default_date: str = "Today") -> list[str]:
    if not isinstance(item, dict):
        return []
    dt = str(item.get("date") or default_date).strip()
    today_str = datetime.now().strftime("%Y-%m-%d")
    if dt.lower() in ("today", "day 1", "day-1") or dt == today_str:
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
    if is_historical_item and _present(rain_24h):
        lines.append(f"  Observed Rain 24h: {rain_24h} mm")
    if _present(item.get("humidity_0830")):
        lines.append(f"  Humidity 0830: {item.get('humidity_0830')}%")
    if _present(item.get("humidity_1730")):
        lines.append(f"  Humidity 1730: {item.get('humidity_1730')}%")
    if _present(item.get("station")):
        lines.append(f"  Station: {item.get('station')}")
    if _present(item.get("sunrise")):
        lines.append(f"  Sunrise: {item.get('sunrise')}")
    if _present(item.get("sunset")):
        lines.append(f"  Sunset: {item.get('sunset')}")
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
    if _present(item.get("station_name") or item.get("station")):
        lines.append(f"  Station: {item.get('station_name') or item.get('station')}")
    if _present(item.get("sunrise")):
        lines.append(f"  Sunrise: {item.get('sunrise')}")
    if _present(item.get("sunset")):
        lines.append(f"  Sunset: {item.get('sunset')}")
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
    desc = (
        item.get("forecast")
        or item.get("distribution_description")
        or item.get("category_description")
        or ("Observed rainfall" if today_str and str(dt) < today_str else "Rainfall Expected")
    )
    rain_val = (
        item.get("observed_past_24hrs_rainfall_mm")
        or item.get("observed_rainfall_mm")
        or item.get("district_daily_actual_mm")
        or item.get("observed_past_24hrs_rainfall")
        or rec.get("Daily Actual")
    )
    norm_val = item.get("district_daily_normal_mm") or rec.get("Daily Normal")
    dep_val = item.get("departure_pct") or rec.get("Daily Departure Per")
    cat = item.get("category_code") or item.get("category") or rec.get("Daily Category")
    cat_desc = item.get("category_description") or rec.get("Daily Category Description")
    lines = [f"{dt} | {desc}"]
    if _present(rain_val):
        lines.append(f"  Rain 24h / actual: {rain_val} mm")
    if _present(norm_val):
        lines.append(f"  Normal: {norm_val} mm")
    if _present(dep_val):
        lines.append(f"  Departure: {dep_val}%")
    if _present(cat):
        lines.append(f"  Category: {cat}" + (f" — {cat_desc}" if _present(cat_desc) else ""))
    if _present(item.get("weekly_cumulative_mm")):
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
        if not _present(val):
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
    lines = [f"District: {location}"]
    obs_at = _join_date_time(tw.get("date"), tw.get("observation_timestamp"))
    if obs_at:
        lines.append(f"Observed at: {obs_at}")
    lines.append(f"Temperature: {obs_temp if obs_temp is not None else 'N/A'}°C")
    if _present(tw.get("humidity_0830") or tw.get("humidity_1730")):
        lines.append(f"Humidity: {tw.get('humidity_0830') or tw.get('humidity_1730')}%")
    if _present(tw.get("past_24hrs_rainfall")):
        lines.append(f"Rain 24h: {tw.get('past_24hrs_rainfall')} mm")
    wind_val = _station_wind(tw)
    if wind_val:
        lines.append(f"Wind: {wind_val}")
    if _present(tw.get("atm_pressure") or tw.get("mslp")):
        lines.append(f"Pressure: {tw.get('atm_pressure') or tw.get('mslp')}")
    lines.append(f"Conditions: {cond}")
    if _present(tw.get("sunrise")):
        lines.append(f"Sunrise: {tw.get('sunrise')}")
    if _present(tw.get("sunset")):
        lines.append(f"Sunset: {tw.get('sunset')}")
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
        lines.append("")
        lines.append(f"Summary: {summary.strip()}")
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
            ("distance_from_requested_place_km", "Distance from your location"),
            ("distance_km", "Distance from your location"),
            ("district", "District"),
            ("state", "State"),
            ("nearest_station_note", "Note"),
        ):
            if _present(st_info.get(key)):
                lines.append(f"  {label}: {st_info.get(key)}")
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
    """Render a station detail field with code → description when applicable."""
    if key == "wind_direction_code":
        return f"Wind direction: {describe_wind_direction(value)}"
    if key == "wind_direction_deg":
        return f"Wind direction: {describe_wind_direction(value)}"
    if key == "weather_code":
        desc = describe_current_weather(value)
        return f"Weather: {desc or value}"
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
    """Full live observation lines for IMD current_wx / AWS station dicts."""
    st = station if isinstance(station, dict) else {}
    today_date_str = datetime.now().strftime("%Y-%m-%d")
    raw_obs_date = st.get("date")
    if not raw_obs_date or str(raw_obs_date) < today_date_str:
        raw_obs_date = today_date_str
    raw_obs_time = st.get("time")
    obs_time = _join_date_time(raw_obs_date, raw_obs_time) or str(raw_obs_date)

    cond = (
        st.get("weather_description")
        or st.get("weather_message")
        or "Clear Sky"
    )
    code_raw = st.get("weather_code_raw") or st.get("weather_code")
    if code_raw is not None and str(code_raw).strip() not in {"", "0", "00"}:
        cond = f"{cond} (code {str(code_raw).strip()})"

    lines: list[str] = []
    district_val = st.get("district") or fallback_location
    if district_val:
        lines.append(f"District: {district_val}")
    if st.get("state"):
        lines.append(f"State: {st.get('state')}")
    lines.append(f"Observed at: {obs_time}")
    lines.append(f"Temperature: {st.get('temperature_c', 'N/A')}°C")
    feel = st.get("feel_like_c")
    if feel is not None and str(feel).strip() not in {"", "N/A"}:
        lines.append(f"Feels like: {feel}°C")
    hum = st.get("humidity_pct")
    if hum is not None and str(hum).strip() not in {"", "N/A"}:
        lines.append(f"Humidity: {hum}%")
    wind_val = _station_wind(st)
    if wind_val:
        lines.append(f"Wind: {wind_val}")
    if st.get("mslp") is not None and str(st.get("mslp")).strip() not in {"", "N/A"}:
        lines.append(f"Pressure: {st.get('mslp')}")
    rain = st.get("past_24hrs_rainfall_mm")
    if rain is not None and str(rain).strip() not in {"", "N/A"}:
        lines.append(f"Rain 24h: {rain} mm")
    if st.get("nebulosity") is not None and str(st.get("nebulosity")).strip() not in {"", "N/A"}:
        lines.append(f"Nebulosity: {st.get('nebulosity')}")
    lines.append(f"Conditions: {cond}")
    if st.get("sunrise"):
        lines.append(f"Sunrise: {st.get('sunrise')}")
    if st.get("sunset"):
        lines.append(f"Sunset: {st.get('sunset')}")
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