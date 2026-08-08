# ajrasakha/tools/weather/test_weather_tools.py
# Standalone Weather Tools Tester:
# Active Tools (Tools 1 to 6):
# - TOOL 1: get_current_and_forecast_info (Today, 5-day forecast, target_date, previous date, date range)
# - TOOL 2: get_rainfall_and_monsoon_info (Today, 5-day forecast, target_date, date range, monsoon_status)
# - TOOL 3: get_temperature_info (Observations, Feel-like, Humidity, Hot/Cold status, Timeframes)
# - TOOL 4: get_location_weather (Hyper-local weather & nearby 50km stations)
# - TOOL 5: get_weather_nowcast (Short-term 0-3 hour rain/storm predictions)
# - TOOL 6: get_weather_alerts (Official IMD 5-day warnings & Red/Orange alerts)
# integrate later Tool: Tool 7 (get_sowing_weather_guide)

import asyncio
import json
import os
import sys

# Ensure ajrasakha package directory is in sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
_ai_root = os.path.abspath(os.path.join(_current_dir, "..", "..", ".."))
if _ai_root not in sys.path:
    sys.path.insert(0, _ai_root)

from ajrasakha.tools.weather.weather_tools import (
    get_current_and_forecast_info,
    get_rainfall_and_monsoon_info,
    get_temperature_info,
    get_sowing_weather_guide,
    get_location_weather,
    get_weather_nowcast,
    get_weather_alerts,
)


async def main():
    print("=" * 85)
    print(" 🌦️ MCP WEATHER TOOLS TESTER)")
    print("=" * 85)

    district_name = "Ernakulam"
    state_name = "Kerala"

    print(f"\n📍 Primary Test Location: District='{district_name}', State='{state_name}'\n")

    # =========================================================================
    # TOOL 1: get_current_and_forecast_info 
    # =========================================================================
    print("-" * 85)
    print("1️⃣ TOOL 1: get_current_and_forecast_info (General Weather & Forecasts)")
    print("   Test 1A: Today's Weather (query_type='today')")
    print("-" * 85)
    res1a = await get_current_and_forecast_info(
        district=district_name,
        state=state_name,
        query_type="today"
    )
    print(json.dumps(res1a, indent=2, ensure_ascii=False) + "\n")

    print("   Test 1B: 5-Day Forecast (query_type='forecast', forecast_days=5)")
    res1b = await get_current_and_forecast_info(
        district=district_name,
        state=state_name,
        query_type="forecast",
        forecast_days=5
    )
    print(json.dumps(res1b, indent=2, ensure_ascii=False) + "\n")

    print("   Test 1C: Specific Target Date Forecast (target_date='2026-08-05')")
    res1c = await get_current_and_forecast_info(
        district=district_name,
        state=state_name,
        target_date="2026-08-05"
    )
    print(json.dumps(res1c, indent=2, ensure_ascii=False) + "\n")

    print("   Test 1D: Previous Historical Date (query_type='previous', from_date='2026-08-01')")
    res1d = await get_current_and_forecast_info(
        district=district_name,
        state=state_name,
        query_type="previous",
        from_date="2026-08-01"
    )
    print(json.dumps(res1d, indent=2, ensure_ascii=False) + "\n")

    print("   Test 1E: Historical Date Range (from_date='2026-07-28', to_date omitted -> defaults to today)")
    res1e = await get_current_and_forecast_info(
        district=district_name,
        state=state_name,
        from_date="2026-07-28"
    )
    print(json.dumps(res1e, indent=2, ensure_ascii=False) + "\n")

    # =========================================================================
    # TOOL 2: get_rainfall_and_monsoon_info 
    # =========================================================================
    print("-" * 85)
    print("2️⃣ TOOL 2: get_rainfall_and_monsoon_info (Rainfall & Monsoon Enquiries)")
    print("   Test 2A: Today's Current Rainfall (data_type='current')")
    print("-" * 85)
    res2a = await get_rainfall_and_monsoon_info(
        district=district_name,
        state=state_name,
        data_type="current"
    )
    print(json.dumps(res2a, indent=2, ensure_ascii=False) + "\n")

    print("   Test 2B: 5-Day Rainfall Forecast (data_type='forecast', forecast_days=5)")
    res2b = await get_rainfall_and_monsoon_info(
        district=district_name,
        state=state_name,
        data_type="forecast",
        forecast_days=5
    )
    print(json.dumps(res2b, indent=2, ensure_ascii=False) + "\n")

    print("   Test 2C: Specific Target Date Rainfall (target_date='2026-08-05')")
    res2c = await get_rainfall_and_monsoon_info(
        district=district_name,
        state=state_name,
        target_date="2026-08-05"
    )
    print(json.dumps(res2c, indent=2, ensure_ascii=False) + "\n")

    print("   Test 2D: Historical Rainfall Date Range (from_date='2026-07-28', to_date omitted -> defaults to today)")
    res2d = await get_rainfall_and_monsoon_info(
        district=district_name,
        state=state_name,
        data_type="historical",
        from_date="2026-07-28"
    )
    print(json.dumps(res2d, indent=2, ensure_ascii=False) + "\n")

    print("   Test 2E: Farmer Query on Monsoon Status (data_type='monsoon_status')")
    res2e = await get_rainfall_and_monsoon_info(
        district=district_name,
        state=state_name,
        data_type="monsoon_status"
    )
    print("2E Monsoon Status Summary (Local Subdivision & IMD Feed):")
    print(json.dumps({
        "success": res2e.get("success"),
        "resolved_location": res2e.get("resolved_location"),
        "district": res2e.get("district"),
        "timeframe": res2e.get("results", {}).get("timeframe"),
        "local_subdivision_monsoon_status": res2e.get("results", {}).get("local_subdivision_monsoon_status"),
        "district_cumulative_monsoon_rainfall": res2e.get("results", {}).get("district_cumulative_monsoon_rainfall")
    }, indent=2, ensure_ascii=False) + "\n")

    # =========================================================================
    # TOOL 3: get_temperature_info 
    # =========================================================================
    print("-" * 85)
    print("3️⃣ TOOL 3: get_temperature_info (Temperature, Humidity, Hot/Cold & All Timeframe Queries)")
    print("   Test 3A: Today's Temperature (query_type='today')")
    print("-" * 85)
    res3a = await get_temperature_info(
        district=district_name,
        state=state_name,
        query_type="today"
    )
    print(json.dumps(res3a, indent=2, ensure_ascii=False) + "\n")

    print("   Test 3B: 5-Day Temperature Forecast (query_type='forecast', forecast_days=5)")
    res3b = await get_temperature_info(
        district=district_name,
        state=state_name,
        query_type="forecast",
        forecast_days=5
    )
    print(json.dumps(res3b, indent=2, ensure_ascii=False) + "\n")

    print("   Test 3C: Particular Target Date Temperature (target_date='2026-08-05')")
    res3c = await get_temperature_info(
        district=district_name,
        state=state_name,
        target_date="2026-08-05"
    )
    print(json.dumps(res3c, indent=2, ensure_ascii=False) + "\n")

    print("   Test 3D: Previous Historical Date Temperature (query_type='previous', from_date='2026-08-01')")
    res3d = await get_temperature_info(
        district=district_name,
        state=state_name,
        query_type="previous",
        from_date="2026-08-01"
    )
    print(json.dumps(res3d, indent=2, ensure_ascii=False) + "\n")

    print("   Test 3E: Specific Temperature Date Range (from_date='2026-07-28', to_date='2026-08-03')")
    res3e = await get_temperature_info(
        district=district_name,
        state=state_name,
        from_date="2026-07-28",
        to_date="2026-08-03"
    )
    print(json.dumps(res3e, indent=2, ensure_ascii=False) + "\n")

    # =========================================================================
    # TOOL 4: get_location_weather 
    # =========================================================================
    print("-" * 85)
    print("4️⃣ TOOL 4: get_location_weather (Hyper-local Weather & Nearby 50km Stations)")
    print("-" * 85)
    res4 = await get_location_weather(
        block="Piravom",
        district=district_name,
        state=state_name,
        include_nearby_stations=True,
        radius_km=50.0,
        max_stations=5
    )
    print("4 Location Weather Summary:")
    print(json.dumps({
        "success": res4.get("success"),
        "requested_location": res4.get("requested_location"),
        "resolved_location": res4.get("resolved_location"),
        "human_summary": res4.get("human_summary"),
        "nearby_stations_within_50km": res4.get("nearby_stations_within_radius")
    }, indent=2, ensure_ascii=False) + "\n")

    # =========================================================================
    # TOOL 5: get_weather_nowcast 
    # =========================================================================
    print("-" * 85)
    print("5️⃣ TOOL 5: get_weather_nowcast (Short-term 0–3 Hour Rain/Storm Predictions)")
    print("-" * 85)
    res5 = await get_weather_nowcast(
        district=district_name,
        state=state_name,
        hours_ahead=3,
        include_nearby_stations=True,
        radius_km=50.0,
        max_stations=5
    )
    print("5 Nowcast Summary (Next 2-3 Hours):")
    print(json.dumps({
        "success": res5.get("success"),
        "resolved_location": res5.get("resolved_location"),
        "nowcast_window_hours": res5.get("nowcast_window_hours"),
        "nowcast_summary": res5.get("nowcast_summary"),
        "severity_color": res5.get("severity_color"),
        "valid_upto": res5.get("valid_upto"),
        "active_nowcast_categories": res5.get("active_nowcast_categories"),
        "nearby_stations_within_50km": res5.get("nearby_stations_within_radius")
    }, indent=2, ensure_ascii=False) + "\n")

    # =========================================================================
    # TOOL 6: get_weather_alerts 
    # =========================================================================
    print("-" * 85)
    print("6️⃣ TOOL 6: get_weather_alerts (Official IMD Weather Warnings & Red/Orange Alerts)")
    print("-" * 85)
    res6 = await get_weather_alerts(
        district=district_name,
        state=state_name,
        alert_type="all",
        severity="all"
    )
    print("6 Weather Alerts Summary:")
    print(json.dumps({
        "success": res6.get("success"),
        "resolved_location": res6.get("resolved_location"),
        "district": res6.get("district"),
        "alerts_summary": res6.get("alerts_summary"),
        "district_5day_warnings": res6.get("district_5day_warnings")
    }, indent=2, ensure_ascii=False) + "\n")

    # TOOL 7: get_sowing_weather_guide #integrate later 
    # res7 = await get_sowing_weather_guide(district="Etah", state="Uttar Pradesh", crop_name="mustard", query_type="sowing_time")

    print("=" * 85)
    print(" ✅ TOOLS 1, 2, 3, 4, 5 & 6 TESTING COMPLETED SUCCESSFULLY (TOOL 7 COMMENTED OUT)!")
    print("=" * 85)

if __name__ == "__main__":
    asyncio.run(main())
