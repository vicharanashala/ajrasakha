from __future__ import annotations

from typing import Any, Dict

# ==============================================================================
# 1. WEATHER CODE DESCRIPTIONS (01 TO 99)
# ==============================================================================
WEATHER_CODE_DESCRIPTIONS: Dict[str, str] = {
    "01": "Clouds generally dissolving or becoming less developed",
    "02": "State of sky on the whole unchanged",
    "03": "Clouds generally forming or developing",
    "04": "Visibility reduced by smoke (e.g. veldt/forest fires, industrial smoke, volcanic ashes)",
    "05": "Haze",
    "06": "Widespread dust in suspension in the air, not raised by wind at or near the station",
    "07": "Dust or sand raised by wind at or near the station, no well-developed whirl(s), no duststorm/sandstorm seen",
    "08": "Well-developed dust/sand whirl(s) at or near station, but no duststorm/sandstorm",
    "09": "Duststorm or sandstorm within sight",
    "10": "Mist",
    "11": "Patches of shallow fog/ice fog at station (not deeper than about 2 m on land / 10 m at sea)",
    "12": "More or less continuous shallow fog/ice fog at station",
    "13": "Lightning visible, no thunder heard",
    "14": "Precipitation within sight, not reaching ground/sea surface",
    "15": "Precipitation within sight, reaching ground/sea, but distant (> 5 km)",
    "16": "Precipitation within sight, reaching ground/sea, near but not at station",
    "17": "Thunderstorm, no precipitation at observation time",
    "18": "Squalls at or within sight during preceding hour / at observation",
    "19": "Funnel cloud(s) at or within sight during preceding hour / at observation",
    "20": "Drizzle (not freezing) or snow grains not falling as showers",
    "21": "Rain (not freezing) not falling as showers",
    "22": "Snow not falling as showers",
    "23": "Rain and snow / ice pellets type (a), not falling as showers",
    "24": "Freezing drizzle / freezing rain not falling as showers",
    "25": "Showers of rain",
    "26": "Showers of snow, or rain and snow",
    "27": "Showers of hail, or rain and hail",
    "28": "Fog or ice fog",
    "29": "Thunderstorm (with or without precipitation)",
    "30": "Slight/moderate duststorm or sandstorm - decreased during preceding hour",
    "31": "Slight/moderate duststorm or sandstorm - no appreciable change",
    "32": "Slight/moderate duststorm or sandstorm - begun/increased during preceding hour",
    "33": "Severe duststorm or sandstorm - decreased during preceding hour",
    "34": "Severe duststorm or sandstorm - no appreciable change",
    "35": "Severe duststorm or sandstorm - begun/increased during preceding hour",
    "36": "Slight/moderate blowing snow generally low (below eye level)",
    "37": "Heavy drifting snow generally low (below eye level)",
    "38": "Slight/moderate blowing snow generally high (above eye level)",
    "39": "Heavy drifting snow generally high (above eye level)",
    "40": "Fog/ice fog at a distance, not at station during preceding hour",
    "41": "Fog or ice fog in patches",
    "42": "Fog/ice fog, sky visible, becoming thinner",
    "43": "Fog/ice fog, sky invisible, becoming thinner",
    "44": "Fog/ice fog, sky visible, no appreciable change",
    "45": "Fog/ice fog, sky invisible, no appreciable change",
    "46": "Fog/ice fog, sky visible, begun/become thicker",
    "47": "Fog/ice fog, sky invisible, begun/become thicker",
    "48": "Fog depositing rime, sky visible",
    "49": "Fog depositing rime, sky invisible",
    "50": "Drizzle, not freezing, intermittent slight",
    "51": "Drizzle, not freezing, continuous slight",
    "52": "Drizzle, not freezing, intermittent moderate",
    "53": "Drizzle, not freezing, continuous moderate",
    "54": "Drizzle, not freezing, intermittent heavy (dense)",
    "55": "Drizzle, not freezing, continuous heavy (dense)",
    "56": "Drizzle, freezing, slight",
    "57": "Drizzle, freezing, moderate or heavy (dense)",
    "58": "Drizzle and rain, slight",
    "59": "Drizzle and rain, moderate or heavy",
    "60": "Rain, not freezing, intermittent slight",
    "61": "Rain, not freezing, continuous slight",
    "62": "Rain, not freezing, intermittent moderate",
    "63": "Rain, not freezing, continuous moderate",
    "64": "Rain, not freezing, intermittent heavy",
    "65": "Rain, not freezing, continuous heavy",
    "66": "Rain, freezing, slight",
    "67": "Rain, freezing, moderate or heavy",
    "68": "Rain, or drizzle and snow, slight",
    "69": "Rain, or drizzle and snow, moderate or heavy",
    "70": "Intermittent fall of snowflakes, slight",
    "71": "Continuous fall of snowflakes, slight",
    "72": "Intermittent fall of snowflakes, moderate",
    "73": "Continuous fall of snowflakes, moderate",
    "74": "Intermittent fall of snowflakes, heavy",
    "75": "Continuous fall of snowflakes, heavy",
    "76": "Ice prisms (with or without fog)",
    "77": "Snow grains (with or without fog)",
    "78": "Isolated star-like snow crystals (with or without fog)",
    "79": "Ice pellets, type (a)",
    "80": "Rain shower(s), slight",
    "81": "Rain shower(s), moderate or heavy",
    "82": "Rain shower(s), violent",
    "83": "Shower(s) of rain and snow mixed, slight",
    "84": "Shower(s) of rain and snow mixed, moderate or heavy",
    "85": "Snow shower(s), slight",
    "86": "Snow shower(s), moderate or heavy",
    "87": "Shower(s) of snow pellets/ice pellets type (b), slight",
    "88": "Shower(s) of snow pellets/ice pellets type (b), moderate or heavy",
    "89": "Shower(s) of hail, with/without rain or rain and snow mixed, not associated with thunder, slight",
    "90": "Shower(s) of hail, with/without rain or rain and snow mixed, not associated with thunder, moderate or heavy",
    "91": "Slight rain at observation; thunderstorm during preceding hour but not at observation",
    "92": "Moderate/heavy rain at observation; thunderstorm during preceding hour but not at observation",
    "93": "Slight snow/rain+snow mixed/hail at observation; thunderstorm during preceding hour but not at observation",
    "94": "Moderate/heavy snow/rain+snow mixed/hail at observation; thunderstorm during preceding hour but not at observation",
    "95": "Thunderstorm, slight/moderate, without hail, with rain and/or snow at observation",
    "96": "Thunderstorm, slight/moderate, with hail at observation",
    "97": "Thunderstorm, heavy, without hail, with rain and/or snow at observation",
    "98": "Thunderstorm combined with duststorm/sandstorm at observation",
    "99": "Thunderstorm, heavy, with hail at observation"
}

# ==============================================================================
# 2. WIND DIRECTION DESCRIPTIONS
# ==============================================================================
WIND_DIRECTION_DESCRIPTIONS: Dict[int, str] = {
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
    360: "Northerly"
}

# ==============================================================================
# 3. NOWCAST CATEGORY CODES (Cat1 to Cat19)
# ==============================================================================
NOWCAST_CATEGORY_CODES: Dict[str, Dict[str, str]] = {
    "Cat1": {"Code": "1", "Description": "No Weather"},
    "Cat2": {"Code": "2", "Description": "Light rain: < 5 mm/hr"},
    "Cat3": {"Code": "3", "Description": "Light snow: < 5 cm/hr"},
    "Cat4": {"Code": "4", "Description": "Light Thunderstorms with maximum surface wind speed less than 40 kmph (in gusts)"},
    "Cat5": {"Code": "5", "Description": "Slight dust storm: wind speed up to 41 kmph and visibility less than 1000 m but more than 500 m"},
    "Cat6": {"Code": "6", "Description": "Low cloud to ground Lightning probability (< 30%)"},
    "Cat7": {"Code": "7", "Description": "Moderate rain: 5-15 mm/hr"},
    "Cat8": {"Code": "8", "Description": "Moderate snow: 5-15 cm/hr"},
    "Cat9": {"Code": "9", "Description": "Moderate Thunderstorms with maximum surface wind speed between 41 - 61 kmph (in gusts)"},
    "Cat10": {"Code": "10", "Description": "Moderate dust storm: wind speed between 41-61 kmph and visibility between 200 and 500 m due to dust"},
    "Cat11": {"Code": "11", "Description": "Moderate cloud to ground Lightning probability (30 - 60%)"},
    "Cat12": {"Code": "12", "Description": "Heavy rain: > 15 mm/hr"},
    "Cat13": {"Code": "13", "Description": "Heavy snow: > 15 cm/hr"},
    "Cat14": {"Code": "14", "Description": "Severe Thunderstorms with maximum surface wind speed 62 - 87 kmph (in gusts)"},
    "Cat15": {"Code": "15", "Description": "Very Severe Thunderstorms with maximum surface wind speed > 87 kmph (in gusts)"},
    "Cat16": {"Code": "Text", "Description": "Other Warnings (text warnings can be entered)"},
    "Cat17": {"Code": "31", "Description": "Thunderstorms with Hail"},
    "Cat18": {"Code": "32", "Description": "Severe dust storm: surface wind speed (in gusts) exceeding 61 kmph and visibility less than 200 m due to dust"},
    "Cat19": {"Code": "33", "Description": "High cloud to ground Lightning probability (> 60%)"}
}

NOWCAST_COLOR_CODES: Dict[str, Dict[str, str]] = {
    "1": {"Category_Usage": "Cat1", "Color_Name": "Green", "Hex": "#008000"},
    "2": {"Category_Usage": "Cat2 to Cat6", "Color_Name": "Yellow", "Hex": "#FFFF00"},
    "3": {"Category_Usage": "Cat7 to Cat11", "Color_Name": "Orange", "Hex": "#FFA500"},
    "4": {"Category_Usage": "Cat12 to Cat19", "Color_Name": "Red", "Hex": "#ff0000"}
}

# ==============================================================================
# 4. DISTRICT WARNING CODES & COLORS
# ==============================================================================
DISTRICT_WARNING_CODES: Dict[str, str] = {
    "1": "No Warning",
    "2": "Heavy Rain",
    "3": "Heavy Snow",
    "4": "Thunderstorm & Lightning, Squall etc",
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
    "17": "Extremely Heavy Rain"
}

DISTRICT_WARNING_COLOR_CODES: Dict[str, Dict[str, str]] = {
    "1": {"Color_Name": "Red", "Hex": "#FF0000"},
    "2": {"Color_Name": "Orange", "Hex": "#ffa500"},
    "3": {"Color_Name": "Yellow", "Hex": "#ffff00"},
    "4": {"Color_Name": "Green", "Hex": "#7cfc00"}
}

# ==============================================================================
# 5. RAINFALL CATEGORY CODES
# ==============================================================================
RAINFALL_CATEGORY_CODES: Dict[str, str] = {
    "LE": "Large Excess (60% or more)",
    "E": "Excess (20% to 59%)",
    "N": "Normal (-19% to 19%)",
    "D": "Deficient (-59% to -20%)",
    "LD": "Large Deficient (-99% to -60%)",
    "NR": "No Rain (-100%)",
    "ND": "No Data"
}

# ==============================================================================
# CODE → DESCRIPTION LOOKUP HELPERS
# ==============================================================================
_WIND_COMPASS_KEYS: tuple[int, ...] = tuple(
    k for k in WIND_DIRECTION_DESCRIPTIONS if k != 0
)

_COLOR_EMOJI: Dict[str, str] = {
    "Red": "🔴",
    "Orange": "🟠",
    "Yellow": "🟡",
    "Green": "🟢",
}


def as_int_code(value: Any) -> int | None:
    """Parse IMD numeric code; None if blank/unparseable."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def describe_wind_direction(code: Any) -> str:
    """Map IMD wind-direction code or compass degrees to compass text."""
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    if not text.replace(".", "", 1).isdigit():
        return text
    num = as_int_code(text)
    if num is None:
        return text
    if num == 0:
        return WIND_DIRECTION_DESCRIPTIONS[0]
    if num in WIND_DIRECTION_DESCRIPTIONS:
        return WIND_DIRECTION_DESCRIPTIONS[num]
    if 0 < num <= 360:
        best_key = min(
            _WIND_COMPASS_KEYS,
            key=lambda k: min(abs(num - k), 360 - abs(num - k)),
        )
        return WIND_DIRECTION_DESCRIPTIONS[best_key]
    best_key = min(WIND_DIRECTION_DESCRIPTIONS, key=lambda k: abs(num - k))
    return WIND_DIRECTION_DESCRIPTIONS[best_key]


def describe_current_weather(code: Any) -> str:
    """Map present-weather code 01–99 to description; pass through free text."""
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    num = as_int_code(text)
    if num is None:
        return text
    if num == 0:
        return ""
    return WEATHER_CODE_DESCRIPTIONS.get(f"{num:02d}", text)


def describe_district_warnings(code: Any) -> str:
    """Map one or more district warning codes to labels."""
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    if text.upper() == "NO_WARNING":
        return "No Warning"
    parts = [p.strip() for p in text.replace(";", ",").split(",") if p.strip()]
    labels: list[str] = []
    for part in parts:
        label = DISTRICT_WARNING_CODES.get(part)
        if not label:
            num = as_int_code(part)
            label = DISTRICT_WARNING_CODES.get(str(num)) if num is not None else None
        labels.append(label or part)
    return "; ".join(labels)


def describe_district_warning_color(code: Any) -> str:
    """Map district warning color code/name to emoji + label."""
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    for name, emoji in _COLOR_EMOJI.items():
        if text.lower() == name.lower():
            return f"{emoji} {name}"
    entry = DISTRICT_WARNING_COLOR_CODES.get(text)
    if not entry:
        num = as_int_code(text)
        entry = DISTRICT_WARNING_COLOR_CODES.get(str(num)) if num is not None else None
    if entry:
        name = entry["Color_Name"]
        emoji = _COLOR_EMOJI.get(name, "")
        return f"{emoji} {name}".strip()
    return text


def describe_nowcast_category(code: Any) -> str:
    """Map nowcast category code (CatN or numeric) to description."""
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    if text in NOWCAST_CATEGORY_CODES:
        desc = NOWCAST_CATEGORY_CODES[text]["Description"]
        return f"{text}: {desc}" if text.startswith("Cat") else desc
    cat_key = text if text.startswith("Cat") else f"Cat{text}"
    if cat_key in NOWCAST_CATEGORY_CODES:
        return NOWCAST_CATEGORY_CODES[cat_key]["Description"]
    for cat_name, meta in NOWCAST_CATEGORY_CODES.items():
        if str(meta.get("Code")) == text:
            return meta["Description"]
    if text.isdigit():
        num = int(text)
        if num >= 30 and "Cat16" in NOWCAST_CATEGORY_CODES:
            return f"Cat16: {NOWCAST_CATEGORY_CODES['Cat16']['Description']}"
        return f"Cat{text}"
    return text


def describe_rainfall_category(code: Any) -> str:
    """Map rainfall departure category code to label."""
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    upper = text.upper()
    if upper in RAINFALL_CATEGORY_CODES:
        return RAINFALL_CATEGORY_CODES[upper]
    for key, label in RAINFALL_CATEGORY_CODES.items():
        if label.lower() == text.lower():
            return label
    return text


# ==============================================================================
# 6. AWS/ARG STATE ID MAPPING (1 TO 36)
# ==============================================================================
STATE_ID_MAPPING: Dict[str, str] = {
    "1": "TELANGANA",
    "2": "ANDHRA_PRADESH",
    "3": "HIMACHAL_PRADESH",
    "4": "KERALA",
    "5": "UTTAR_PRADESH",
    "6": "MEGHALAYA",
    "7": "DELHI",
    "8": "RAJASTHAN",
    "9": "GUJARAT",
    "10": "ODISHA",
    "11": "BIHAR",
    "12": "CHHATTISGARH",
    "13": "KARNATAKA",
    "14": "MIZORAM",
    "15": "JHARKHAND",
    "16": "TRIPURA",
    "17": "CHANDIGARH",
    "18": "JAMMU_AND_KASHMIR",
    "19": "GOA",
    "20": "SIKKIM",
    "21": "MAHARASHTRA",
    "22": "HARYANA",
    "23": "LADAKH",
    "24": "ASSAM",
    "25": "TAMIL_NADU",
    "26": "WEST_BENGAL",
    "27": "MADHYA_PRADESH",
    "28": "ARUNACHAL_PRADESH",
    "29": "LAKSHADWEEP",
    "30": "MANIPUR",
    "31": "UTTARAKHAND",
    "32": "NAGALAND",
    "33": "PUDUCHERRY",
    "34": "PUNJAB",
    "35": "ANDAMAN_AND_NICOBAR",
    "36": "DAMAN_AND_DIU"
}

# ==============================================================================
# 7. ALL IMD API ENDPOINTS & FIELD DEFINITIONS BY CATEGORY HEADING
# ==============================================================================
IMD_API_CATALOG: Dict[str, Dict[str, Any]] = {

    # --------------------------------------------------------------------------
    # HEADING 1: Weather Forecast APIs
    # --------------------------------------------------------------------------
    "Weather_Forecast_APIs": {
        "City_Weather_Forecast_7_Days": {
            "URL": "https://api.imd.gov.in/api/v1/cityforecast",
            "Param_URL": "https://api.imd.gov.in/api/v1/cityforecast?id=42182",
            "Visualize_Data": "https://city.imd.gov.in",
            "Mapping_URL": "https://api.imd.gov.in/api/v1/cityforecast_mapping",
            "Fields": [
                {"Field": "Date", "Value": "YYYY-mm-dd", "Description": "Date of Observation in YYYY-mm-dd"},
                {"Field": "Station_Code", "Value": "Code", "Description": "Station Code is unique for each station"},
                {"Field": "Station_Name", "Value": "Text", "Description": "Station name"},
                {"Field": "Today_Max_temp", "Value": "deg C", "Description": "Max Temp records at 1730 Hr IST (oC)"},
                {"Field": "Today_Max_Departure_from_Normal", "Value": "deg C", "Description": "Departure of today max temp from normal (oC)"},
                {"Field": "Previous_Day_Max_temp", "Value": "deg C", "Description": "Max Temp of previous day records at 1730 Hr IST (oC)"},
                {"Field": "Previous_Day_Max_Departure_from_Normal", "Value": "deg C", "Description": "Departure of previous day max temp from normal (oC)"},
                {"Field": "Today_Min_temp", "Value": "deg C", "Description": "Min Temp records at 0530 Hr IST (oC)"},
                {"Field": "Today_Min_Departure_from_Normal", "Value": "deg C", "Description": "Departure of today min temp from normal (oC)"},
                {"Field": "Past_24_hrs_Rainfall", "Value": "mm", "Description": "Recorded from 0830 hrs IST of previous day to 0830 hrs IST of today"},
                {"Field": "Relative_Humidity_at_0830", "Value": "%", "Description": "Relative Humidity recorded at 0830 hrs (%)"},
                {"Field": "Relative_Humidity_at_1730", "Value": "%", "Description": "Relative Humidity recorded at 1730 hrs (%)"},
                {"Field": "Previous_Day_Relative_Humidity_at_1730", "Value": "%", "Description": "Relative Humidity of previous day recorded at 1730 hrs (%)"},
                {"Field": "Sunset_time", "Value": "HH:MM", "Description": "Sunset Time"},
                {"Field": "Sunrise_time", "Value": "HH:MM", "Description": "Sunrise Time"},
                {"Field": "Moonset_time", "Value": "HH:MM", "Description": "Moonset Time"},
                {"Field": "Moonrise_time", "Value": "HH:MM", "Description": "Moonrise Time"},
                {"Field": "Todays_Forecast_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-1 (i.e. Today) (oC)"},
                {"Field": "Todays_Forecast_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-1 (i.e. Today) (oC)"},
                {"Field": "Todays_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-1 (i.e. Today)"},
                {"Field": "Day_2_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-2 (oC)"},
                {"Field": "Day_2_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-2 (oC)"},
                {"Field": "Day_2_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-2"},
                {"Field": "Day_3_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-3 (oC)"},
                {"Field": "Day_3_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-3 (oC)"},
                {"Field": "Day_3_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-3"},
                {"Field": "Day_4_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-4 (oC)"},
                {"Field": "Day_4_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-4 (oC)"},
                {"Field": "Day_4_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-4"},
                {"Field": "Day_5_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-5 (oC)"},
                {"Field": "Day_5_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-5 (oC)"},
                {"Field": "Day_5_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-5"},
                {"Field": "Day_6_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-6 (oC)"},
                {"Field": "Day_6_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-6 (oC)"},
                {"Field": "Day_6_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-6"},
                {"Field": "Day_7_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-7 (oC)"},
                {"Field": "Day_7_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-7 (oC)"},
                {"Field": "Day_7_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-7"}
            ]
        },

        "City_Weather_Forecast_Loc_Lat_Lon": {
            "URL": "https://api.imd.gov.in/api/v1/cityforecastloc",
            "Param_URL": "https://api.imd.gov.in/api/v1/cityforecastloc?id=42182",
            "Visualize_Data": "https://city.imd.gov.in",
            "Mapping_URL": "https://api.imd.gov.in/api/v1/cityforecast_mapping",
            "Fields": [
                {"Field": "Date", "Value": "YYYY-mm-dd", "Description": "Date of Observation in YYYY-mm-dd"},
                {"Field": "Station_Code", "Value": "Code", "Description": "Station Code is unique for each station"},
                {"Field": "Station_Name", "Value": "Text", "Description": "Station name"},
                {"Field": "Today_Max_temp", "Value": "deg C", "Description": "Max Temp records at 1730 Hr IST (oC)"},
                {"Field": "Today_Max_Departure_from_Normal", "Value": "deg C", "Description": "Departure of today max temp from normal (oC)"},
                {"Field": "Previous_Day_Max_temp", "Value": "deg C", "Description": "Max Temp of previous day records at 1730 Hr IST (oC)"},
                {"Field": "Previous_Day_Max_Departure_from_Normal", "Value": "deg C", "Description": "Departure of previous day max temp from normal (oC)"},
                {"Field": "Today_Min_temp", "Value": "deg C", "Description": "Min Temp records at 0530 Hr IST (oC)"},
                {"Field": "Today_Min_Departure_from_Normal", "Value": "deg C", "Description": "Departure of today min temp from normal (oC)"},
                {"Field": "Past_24_hrs_Rainfall", "Value": "mm", "Description": "Recorded from 0830 hrs IST of previous day to 0830 hrs IST of today"},
                {"Field": "Relative_Humidity_at_0830", "Value": "%", "Description": "Relative Humidity recorded at 0830 hrs (%)"},
                {"Field": "Relative_Humidity_at_1730", "Value": "%", "Description": "Relative Humidity recorded at 1730 hrs (%)"},
                {"Field": "Previous_Day_Relative_Humidity_at_1730", "Value": "%", "Description": "Relative Humidity of previous day recorded at 1730 hrs (%)"},
                {"Field": "Sunset_time", "Value": "HH:MM", "Description": "Sunset Time"},
                {"Field": "Sunrise_time", "Value": "HH:MM", "Description": "Sunrise Time"},
                {"Field": "Moonset_time", "Value": "HH:MM", "Description": "Moonset Time"},
                {"Field": "Moonrise_time", "Value": "HH:MM", "Description": "Moonrise Time"},
                {"Field": "Todays_Forecast_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-1 (i.e. Today)"},
                {"Field": "Todays_Forecast_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-1 (i.e. Today)"},
                {"Field": "Todays_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-1 (i.e. Today)"},
                {"Field": "Day_2_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-2"},
                {"Field": "Day_2_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-2"},
                {"Field": "Day_2_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-2"},
                {"Field": "Day_3_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-3"},
                {"Field": "Day_3_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-3"},
                {"Field": "Day_3_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-3"},
                {"Field": "Day_4_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-4"},
                {"Field": "Day_4_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-4"},
                {"Field": "Day_4_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-4"},
                {"Field": "Day_5_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-5"},
                {"Field": "Day_5_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-5"},
                {"Field": "Day_5_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-5"},
                {"Field": "Day_6_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-6"},
                {"Field": "Day_6_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-6"},
                {"Field": "Day_6_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-6"},
                {"Field": "Day_7_Max_Temp", "Value": "deg C", "Description": "Forecasted Max Temp of Day-7"},
                {"Field": "Day_7_Min_temp", "Value": "deg C", "Description": "Forecasted Min Temp of Day-7"},
                {"Field": "Day_7_Forecast", "Value": "Text", "Description": "Weather Forecast of Day-7"},
                {"Field": "Latitude", "Value": "float", "Description": "Station latitude"},
                {"Field": "Longitude", "Value": "float", "Description": "Station longitude"}
            ]
        },

        "Subdivisional_Rainfall_Forecast_7_Days": {
            "URL": "https://api.imd.gov.in/api/v1/subdivision_rainfall_forecast",
            "Fields": [
                {"Field": "date_obs", "Value": "YYYY-MM-DD", "Description": "Date of Observation"},
                {"Field": "SUBDIV", "Value": "Text", "Description": "Subdivision Name"},
                {"Field": "day1_color", "Value": "Hex Code", "Description": "Color code for Day-1 (e.g. #004de6)"},
                {"Field": "day1_distribution", "Value": "Text", "Description": "Rainfall distribution label (e.g. Widespread)"},
                {"Field": "day1_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage (e.g. Stations [76-100]%)"},
                {"Field": "day2_color", "Value": "Hex Code", "Description": "Color code for Day-2"},
                {"Field": "day2_distribution", "Value": "Text", "Description": "Rainfall distribution label for Day-2"},
                {"Field": "day2_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-2"},
                {"Field": "day3_color", "Value": "Hex Code", "Description": "Color code for Day-3"},
                {"Field": "day3_distribution", "Value": "Text", "Description": "Rainfall distribution label for Day-3"},
                {"Field": "day3_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-3"},
                {"Field": "day4_color", "Value": "Hex Code", "Description": "Color code for Day-4"},
                {"Field": "day4_distribution", "Value": "Text", "Description": "Rainfall distribution label for Day-4"},
                {"Field": "day4_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-4"},
                {"Field": "day5_color", "Value": "Hex Code", "Description": "Color code for Day-5"},
                {"Field": "day5_distribution", "Value": "Text", "Description": "Rainfall distribution label for Day-5"},
                {"Field": "day5_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-5"},
                {"Field": "day6_color", "Value": "Hex Code", "Description": "Color code for Day-6"},
                {"Field": "day6_distribution", "Value": "Text", "Description": "Rainfall distribution label for Day-6"},
                {"Field": "day6_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-6"},
                {"Field": "day7_color", "Value": "Hex Code", "Description": "Color code for Day-7"},
                {"Field": "day7_distribution", "Value": "Text", "Description": "Rainfall distribution label for Day-7"},
                {"Field": "day7_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-7"}
            ]
        },

        "State_District_Rainfall_Forecast_5_Days": {
            "URL": "https://api.imd.gov.in/api/v1/state_district_rainfall_forecast",
            "Fields": [
                {"Field": "date_obs", "Value": "YYYY-MM-DD", "Description": "Date of Observation"},
                {"Field": "Obj_id", "Value": "id", "Description": "District Object ID"},
                {"Field": "District", "Value": "Text", "Description": "District Name"},
                {"Field": "State", "Value": "Text", "Description": "State Name"},
                {"Field": "day1_color", "Value": "Hex Code", "Description": "Color code for Day-1"},
                {"Field": "day1_distribution", "Value": "Text", "Description": "Rainfall distribution for Day-1"},
                {"Field": "day1_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-1"},
                {"Field": "day2_color", "Value": "Hex Code", "Description": "Color code for Day-2"},
                {"Field": "day2_distribution", "Value": "Text", "Description": "Rainfall distribution for Day-2"},
                {"Field": "day2_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-2"},
                {"Field": "day3_color", "Value": "Hex Code", "Description": "Color code for Day-3"},
                {"Field": "day3_distribution", "Value": "Text", "Description": "Rainfall distribution for Day-3"},
                {"Field": "day3_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-3"},
                {"Field": "day4_color", "Value": "Hex Code", "Description": "Color code for Day-4"},
                {"Field": "day4_distribution", "Value": "Text", "Description": "Rainfall distribution for Day-4"},
                {"Field": "day4_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-4"},
                {"Field": "day5_color", "Value": "Hex Code", "Description": "Color code for Day-5"},
                {"Field": "day5_distribution", "Value": "Text", "Description": "Rainfall distribution for Day-5"},
                {"Field": "day5_distribution_percentage", "Value": "Text", "Description": "Station coverage percentage for Day-5"}
            ]
        }
    },

    # --------------------------------------------------------------------------
    # HEADING 2: Current Weather & Nowcast APIs
    # --------------------------------------------------------------------------
    "Current_Weather_And_Nowcast_APIs": {
        "Current_Weather_API": {
            "URL": "https://api.imd.gov.in/api/v1/current_wx",
            "Param_URL": "https://api.imd.gov.in/api/v1/current_wx?id=StationId",
            "Fields": [
                {"Field": "Station Id", "Value": "Station Id", "Description": "Station ID is unique for each station"},
                {"Field": "Station", "Value": "Station name", "Description": "Station name"},
                {"Field": "Date of Observation", "Value": "YYYY-mm-dd", "Description": "Date of Observation"},
                {"Field": "Time of Observation", "Value": "UTC", "Description": "Time of observation in UTC"},
                {"Field": "M.S.L.P", "Value": "hPa", "Description": "Mean Sea Level Pressure in hPa"},
                {"Field": "Wind Direction", "Value": "Code", "Description": "IMD wind direction code or compass degrees; use describe_wind_direction() for text (e.g. 318 -> Northwesterly, 90 -> Easterly)"},
                {"Field": "Wind Speed", "Value": "KMPH", "Description": "Wind Speed in KMPH"},
                {"Field": "Temperature", "Value": "deg C", "Description": "Current Temperature in deg C"},
                {"Field": "Weather Code", "Value": "01-99", "Description": "Present weather code (01-99); use describe_current_weather() for text (e.g. 10 -> Mist, 05 -> Haze)"},
                {"Field": "Nebulosity", "Value": "0-8", "Description": "Cloud coverage on scale of 0-8"},
                {"Field": "Humidity", "Value": "%", "Description": "Humidity in percentage (%)"},
                {"Field": "Last 24 hrs Rainfall", "Value": "mm", "Description": "Rainfall in last 24 hrs in mm"}
            ]
        },

        "District_Wise_Nowcast": {
            "URL": "https://api.imd.gov.in/api/v1/districtnowcast",
            "Param_URL": "https://api.imd.gov.in/api/v1/districtnowcast?id=1",
            "Visualize_Data": "https://mausam.imd.gov.in/responsive/districtWiseNowcastGIS.php",
            "Fields": [
                {"Field": "Station", "Value": "Station name", "Description": "Station name"},
                {"Field": "Date", "Value": "YYYY-mm-dd", "Description": "Date of warning issued"},
                {"Field": "Cat1", "Value": "1", "Description": "No Weather"},
                {"Field": "Cat2", "Value": "2", "Description": "Light rain: < 5 mm/hr"},
                {"Field": "Cat3", "Value": "3", "Description": "Light snow: < 5 cm/hr"},
                {"Field": "Cat4", "Value": "4", "Description": "Light Thunderstorms with max surface wind < 40 kmph"},
                {"Field": "Cat5", "Value": "5", "Description": "Slight dust storm: wind up to 41 kmph, vis 500-1000 m"},
                {"Field": "Cat6", "Value": "6", "Description": "Low cloud to ground Lightning probability (< 30%)"},
                {"Field": "Cat7", "Value": "7", "Description": "Moderate rain: 5-15 mm/hr"},
                {"Field": "Cat8", "Value": "8", "Description": "Moderate snow: 5-15 cm/hr"},
                {"Field": "Cat9", "Value": "9", "Description": "Moderate Thunderstorms with wind 41 - 61 kmph"},
                {"Field": "Cat10", "Value": "10", "Description": "Moderate dust storm: wind 41-61 kmph, vis 200-500 m"},
                {"Field": "Cat11", "Value": "11", "Description": "Moderate cloud to ground Lightning probability (30 - 60%)"},
                {"Field": "Cat12", "Value": "12", "Description": "Heavy rain: > 15 mm/hr"},
                {"Field": "Cat13", "Value": "13", "Description": "Heavy snow: > 15 cm/hr"},
                {"Field": "Cat14", "Value": "14", "Description": "Severe Thunderstorms with wind 62 - 87 kmph"},
                {"Field": "Cat15", "Value": "15", "Description": "Very Severe Thunderstorms with wind > 87 kmph"},
                {"Field": "Cat16", "Value": "Text", "Description": "Other Warnings (text warnings)"},
                {"Field": "Cat17", "Value": "31", "Description": "Thunderstorms with Hail"},
                {"Field": "Cat18", "Value": "32", "Description": "Severe dust storm: wind > 61 kmph, vis < 200 m"},
                {"Field": "Cat19", "Value": "33", "Description": "High cloud to ground Lightning probability (> 60%)"},
                {"Field": "message", "Value": "text", "Description": "Consolidated warning message"},
                {"Field": "toi", "Value": "HHmm", "Description": "Time of issue of warning"},
                {"Field": "Vupto", "Value": "HHmm", "Description": "Warning valid upto"},
                {"Field": "color", "Value": "1, 2, 3 or 4", "Description": "Color code for warning severity (1=Green, 2=Yellow, 3=Orange, 4=Red)"}
            ]
        },

        "Station_Wise_Nowcast": {
            "URL": "https://api.imd.gov.in/api/v1/stationnowcast",
            "Param_URL": "https://api.imd.gov.in/api/v1/stationnowcast?id=Adilabad",
            "Visualize_Data": "https://mausam.imd.gov.in/responsive/stationWiseNowcastGIS.php",
            "Fields": [
                {"Field": "Station", "Value": "Station name", "Description": "Station name"},
                {"Field": "Date", "Value": "YYYY-mm-dd", "Description": "Date of warning issued"},
                {"Field": "Cat1", "Value": "1", "Description": "No Weather"},
                {"Field": "Cat2", "Value": "2", "Description": "Light rain: < 5 mm/hr"},
                {"Field": "Cat3", "Value": "3", "Description": "Light snow: < 5 cm/hr"},
                {"Field": "Cat4", "Value": "4", "Description": "Light Thunderstorms with max surface wind < 40 kmph"},
                {"Field": "Cat5", "Value": "5", "Description": "Slight dust storm: wind up to 41 kmph, vis 500-1000 m"},
                {"Field": "Cat6", "Value": "6", "Description": "Low cloud to ground Lightning probability (< 30%)"},
                {"Field": "Cat7", "Value": "7", "Description": "Moderate rain: 5-15 mm/hr"},
                {"Field": "Cat8", "Value": "8", "Description": "Moderate snow: 5-15 cm/hr"},
                {"Field": "Cat9", "Value": "9", "Description": "Moderate Thunderstorms with wind 41 - 61 kmph"},
                {"Field": "Cat10", "Value": "10", "Description": "Moderate dust storm: wind 41-61 kmph, vis 200-500 m"},
                {"Field": "Cat11", "Value": "11", "Description": "Moderate cloud to ground Lightning probability (30 - 60%)"},
                {"Field": "Cat12", "Value": "12", "Description": "Heavy rain: > 15 mm/hr"},
                {"Field": "Cat13", "Value": "13", "Description": "Heavy snow: > 15 cm/hr"},
                {"Field": "Cat14", "Value": "14", "Description": "Severe Thunderstorms with wind 62 - 87 kmph"},
                {"Field": "Cat15", "Value": "15", "Description": "Very Severe Thunderstorms with wind > 87 kmph"},
                {"Field": "Cat16", "Value": "Text", "Description": "Other Warnings (text warnings)"},
                {"Field": "Cat17", "Value": "31", "Description": "Thunderstorms with Hail"},
                {"Field": "Cat18", "Value": "32", "Description": "Severe dust storm: wind > 61 kmph, vis < 200 m"},
                {"Field": "Cat19", "Value": "33", "Description": "High cloud to ground Lightning probability (> 60%)"},
                {"Field": "message", "Value": "text", "Description": "Consolidated warning message"},
                {"Field": "toi", "Value": "HHmm", "Description": "Time of issue of warning"},
                {"Field": "Vupto", "Value": "HHmm", "Description": "Warning valid upto"},
                {"Field": "color", "Value": "1, 2, 3 or 4", "Description": "Color code as 1=Green, 2=Yellow, 3=Orange, 4=Red"}
            ]
        },

        "AWS_ARG_Data": {
            "URL": "https://api.imd.gov.in/api/v1/aws_data",
            "Param_URL": "https://api.imd.gov.in/api/v1/aws_data?id=NDL",
            "State_URL": "https://api.imd.gov.in/api/v1/aws_data?sid=7",
            "Mapping_URL": "https://api.imd.gov.in/api/v1/aws_data_mapping",
            "Fields": [
                {"Field": "ID", "Value": "String", "Description": "Unique Sensor Identifier"},
                {"Field": "CALL_SIGN", "Value": "String", "Description": "Station call sign code"},
                {"Field": "DISTRICT", "Value": "String", "Description": "Name of District"},
                {"Field": "STATE", "Value": "String", "Description": "Name of State"},
                {"Field": "STATION", "Value": "String", "Description": "Name of Station"},
                {"Field": "DATE", "Value": "YYYY-MM-DD", "Description": "Date of observation"},
                {"Field": "TIME", "Value": "HH:MM:SS", "Description": "Time of observation"},
                {"Field": "CURR_TEMP", "Value": "deg C", "Description": "Current Temperature in deg C"},
                {"Field": "DEW_POINT_TEMP", "Value": "deg C", "Description": "Dew Point Temperature"},
                {"Field": "RH", "Value": "%", "Description": "Relative Humidity in %"},
                {"Field": "WIND_DIRECTION", "Value": "Code/Degrees", "Description": "IMD/AWS wind direction code or degrees; use describe_wind_direction() for compass text"},
                {"Field": "WIND_SPEED", "Value": "KMPH", "Description": "Wind Speed in KMPH"},
                {"Field": "MSLP", "Value": "hPa", "Description": "Mean Sea Level Pressure"},
                {"Field": "MIN_TEMP", "Value": "deg C", "Description": "Minimum Temperature"},
                {"Field": "MAX_TEMP", "Value": "deg C", "Description": "Maximum Temperature"},
                {"Field": "Latitude", "Value": "float", "Description": "Station latitude"},
                {"Field": "Longitude", "Value": "float", "Description": "Station longitude"},
                {"Field": "WEATHER_CODE", "Value": "Code", "Description": "Weather Condition Code (01-99)"},
                {"Field": "NEBULOSITY", "Value": "0-8", "Description": "Cloud coverage scale 0-8"},
                {"Field": "Feel Like", "Value": "deg C", "Description": "Apparent 'Feels Like' temperature"}
            ]
        }
    },

    # --------------------------------------------------------------------------
    # HEADING 3: Warning APIs
    # --------------------------------------------------------------------------
    "Warning_APIs": {
        "District_Wise_Warnings": {
            "URL": "https://api.imd.gov.in/api/v1/districtwarning",
            "Param_URL": "https://api.imd.gov.in/api/v1/districtwarning?id=573",
            "Visualize_Data": "https://mausam.imd.gov.in/responsive/districtWiseWarningGIS.php",
            "Fields": [
                {"Field": "Obj_id", "Value": "id", "Description": "Object ID for a district"},
                {"Field": "Date", "Value": "YYYY-mm-dd", "Description": "Date of Issue"},
                {"Field": "UTC", "Value": "UTC Time", "Description": "Time of Issue in UTC"},
                {"Field": "District", "Value": "Text", "Description": "District Name"},
                {"Field": "Day_1", "Value": "Codes", "Description": "Warning Code for Day 1 (comma separated for multiple)"},
                {"Field": "Day_2", "Value": "Codes", "Description": "Warning Code for Day 2"},
                {"Field": "Day_3", "Value": "Codes", "Description": "Warning Code for Day 3"},
                {"Field": "Day_4", "Value": "Codes", "Description": "Warning Code for Day 4"},
                {"Field": "Day_5", "Value": "Codes", "Description": "Warning Code for Day 5"},
                {"Field": "Day1_Color", "Value": "1-4", "Description": "Color code (1=Red #FF0000, 2=Orange #ffa500, 3=Yellow #ffff00, 4=Green #7cfc00)"},
                {"Field": "Day2_Color", "Value": "1-4", "Description": "Color code for Day 2"},
                {"Field": "Day3_Color", "Value": "1-4", "Description": "Color code for Day 3"},
                {"Field": "Day4_Color", "Value": "1-4", "Description": "Color code for Day 4"},
                {"Field": "Day5_Color", "Value": "1-4", "Description": "Color code for Day 5"}
            ]
        },

        "Subdivisional_Wise_Warnings": {
            "URL": "https://api.imd.gov.in/api/v1/subdivisionwarning",
            "Visualize_Data": "https://mausam.imd.gov.in/responsive/subDivisionWiseWarningGIS.php",
            "Fields": [
                {"Field": "date_obs", "Value": "YYYY-mm-dd", "Description": "Date of observation"},
                {"Field": "SUBDIV", "Value": "Text", "Description": "Subdivision name"},
                {"Field": "day1_color", "Value": "Hex Code", "Description": "Color code for Day 1"},
                {"Field": "day1_warning", "Value": "Text", "Description": "Warning description text for Day 1"},
                {"Field": "day2_color", "Value": "Hex Code", "Description": "Color code for Day 2"},
                {"Field": "day2_warning", "Value": "Text", "Description": "Warning description text for Day 2"},
                {"Field": "day3_color", "Value": "Hex Code", "Description": "Color code for Day 3"},
                {"Field": "day3_warning", "Value": "Text", "Description": "Warning description text for Day 3"},
                {"Field": "day4_color", "Value": "Hex Code", "Description": "Color code for Day 4"},
                {"Field": "day4_warning", "Value": "Text", "Description": "Warning description text for Day 4"},
                {"Field": "day5_color", "Value": "Hex Code", "Description": "Color code for Day 5"},
                {"Field": "day5_warning", "Value": "Text", "Description": "Warning description text for Day 5"}
            ]
        }
    },

    # --------------------------------------------------------------------------
    # HEADING 4: Rainfall APIs
    # --------------------------------------------------------------------------
    "Rainfall_APIs": {
        "District_Wise_Rainfall": {
            "URL": "https://api.imd.gov.in/api/v1/districtrainfall",
            "Param_URL": "https://api.imd.gov.in/api/v1/districtrainfall?id=164",
            "Visualize_Data": "https://mausam.imd.gov.in/responsive/rainfallinformation.php",
            "Fields": [
                {"Field": "OBJ_ID", "Value": "id", "Description": "Object ID for district"},
                {"Field": "District", "Value": "Text", "Description": "District name"},
                {"Field": "Date", "Value": "YYYY-mm-dd", "Description": "Reporting Date"},
                {"Field": "Daily Actual", "Value": "mm", "Description": "Actual daily rainfall in mm"},
                {"Field": "Daily Normal", "Value": "mm", "Description": "Expected normal daily rainfall in mm"},
                {"Field": "Daily Departure Per", "Value": "%", "Description": "Daily percentage departure from normal"},
                {"Field": "Daily Category", "Value": "Code", "Description": "Category code (LE, E, N, D, LD, NR, ND)"},
                {"Field": "Week Date", "Value": "Range", "Description": "Weekly date range"},
                {"Field": "Weekly Actual", "Value": "mm", "Description": "Actual weekly rainfall in mm"},
                {"Field": "Weekly Normal", "Value": "mm", "Description": "Normal weekly rainfall in mm"},
                {"Field": "Weekly Departure Per", "Value": "%", "Description": "Weekly percentage departure"},
                {"Field": "Weekly Category", "Value": "Code", "Description": "Weekly category code"},
                {"Field": "Cumulative Date", "Value": "Date", "Description": "Cumulative start date"},
                {"Field": "Cumulative Actual", "Value": "mm", "Description": "Cumulative actual rainfall in mm"},
                {"Field": "Cumulative Normal", "Value": "mm", "Description": "Cumulative normal rainfall in mm"},
                {"Field": "Cumulative Departure Per", "Value": "%", "Description": "Cumulative percentage departure"},
                {"Field": "Cumulative Category", "Value": "Code", "Description": "Cumulative category code"},
                {"Field": "Monthly Date", "Value": "Range", "Description": "Monthly date range"},
                {"Field": "Monthly Actual", "Value": "mm", "Description": "Monthly actual rainfall in mm"},
                {"Field": "Monthly Normal", "Value": "mm", "Description": "Monthly normal rainfall in mm"},
                {"Field": "Monthly Departure Per", "Value": "%", "Description": "Monthly percentage departure"},
                {"Field": "Monthly Category", "Value": "Code", "Description": "Monthly category code"}
            ]
        },

        "State_Wise_Rainfall": {
            "URL": "https://api.imd.gov.in/api/v1/staterainfall",
            "Param_URL": "https://api.imd.gov.in/api/v1/staterainfall?id=jammu",
            "Visualize_Data": "https://mausam.imd.gov.in/responsive/rainfallinformation_state.php",
            "Fields": [
                {"Field": "State", "Value": "Text", "Description": "State name"},
                {"Field": "Date", "Value": "DD-MM-YYYY", "Description": "Reporting Date"},
                {"Field": "Daily Actual", "Value": "mm", "Description": "Actual daily rainfall in mm"},
                {"Field": "Daily Normal", "Value": "mm", "Description": "Normal daily rainfall in mm"},
                {"Field": "Daily Departure Per", "Value": "%", "Description": "Daily percentage departure"},
                {"Field": "Daily Category", "Value": "Code", "Description": "Daily rainfall category code"},
                {"Field": "Week Date", "Value": "Range", "Description": "Weekly date range"},
                {"Field": "Weekly Actual", "Value": "mm", "Description": "Actual weekly rainfall in mm"},
                {"Field": "Weekly Normal", "Value": "mm", "Description": "Normal weekly rainfall in mm"},
                {"Field": "Weekly Departure Per", "Value": "%", "Description": "Weekly percentage departure"},
                {"Field": "Weekly Category", "Value": "Code", "Description": "Weekly category code"},
                {"Field": "Cumulative Date", "Value": "Range", "Description": "Cumulative date range"},
                {"Field": "Cumulative Actual", "Value": "mm", "Description": "Cumulative actual rainfall in mm"},
                {"Field": "Cumulative Normal", "Value": "mm", "Description": "Cumulative normal rainfall in mm"},
                {"Field": "Cumulative Departue Per", "Value": "%", "Description": "Cumulative percentage departure"},
                {"Field": "Cumulative Category", "Value": "Code", "Description": "Cumulative category code"},
                {"Field": "Monthly Date", "Value": "Range", "Description": "Monthly date range"},
                {"Field": "Monthly Acutual", "Value": "mm", "Description": "Monthly actual rainfall in mm"},
                {"Field": "Monthly Normal", "Value": "mm", "Description": "Monthly normal rainfall in mm"},
                {"Field": "Monthly Departure Per", "Value": "%", "Description": "Monthly percentage departure"},
                {"Field": "Monthly Category", "Value": "Code", "Description": "Monthly category code"}
            ]
        },

        "River_Basin_QPF": {
            "URL": "https://api.imd.gov.in/api/v1/basinqpf",
            "Param_URL": "https://api.imd.gov.in/api/v1/basinqpf?id=100",
            "Visualize_Data": "https://mausam.imd.gov.in/responsive/quantPrecipForecast.php",
            "Fields": [
                {"Field": "Obj_Id", "Value": "id", "Description": "ID unique for each basin"},
                {"Field": "Date", "Value": "YYYY-mm-dd", "Description": "Date of issue in YYYY-mm-dd"},
                {"Field": "FMO", "Value": "Text", "Description": "Name of Flood Met Office"},
                {"Field": "Basin", "Value": "Text", "Description": "Name of river basin"},
                {"Field": "SubBasin", "Value": "Text", "Description": "Name of Sub-basin"},
                {"Field": "Area (Sq. Km.)", "Value": "Float", "Description": "Area of Basin in Sq. Km."},
                {"Field": "Day1", "Value": "mm", "Description": "Quantified precipitation forecast for Day-1"},
                {"Field": "Day2", "Value": "mm", "Description": "Quantified precipitation forecast for Day-2"},
                {"Field": "Day3", "Value": "mm", "Description": "Quantified precipitation forecast for Day-3"},
                {"Field": "Day4", "Value": "mm", "Description": "Quantified precipitation forecast for Day-4"},
                {"Field": "Day5", "Value": "mm", "Description": "Quantified precipitation forecast for Day-5"},
                {"Field": "AAP", "Value": "mm", "Description": "Average Areal Precipitation"}
            ]
        }
    },

    # --------------------------------------------------------------------------
    # HEADING 5: Marine APIs
    # --------------------------------------------------------------------------
    "Marine_APIs": {
        "Port_Warning": {
            "URL": "https://api.imd.gov.in/api/v1/portwarning",
            "Param_URL": "https://api.imd.gov.in/api/v1/portwarning?id=PortId",
            "Visualize_Data": "https://rsmcnewdelhi.imd.gov.in/port-warning.php",
            "Fields": [
                {"Field": "Port Id", "Value": "id", "Description": "Port ID unique for each port"},
                {"Field": "Port Name", "Value": "Text", "Description": "Port name"},
                {"Field": "Issued By", "Value": "Text", "Description": "Issued by CWC or ACWC"},
                {"Field": "Date of Issue", "Value": "YYYY-mm-dd", "Description": "Date of issue"},
                {"Field": "Warning", "Value": "Text", "Description": "Port Warning description text"}
            ]
        },

        "Sea_Area_Bulletin": {
            "URL": "https://api.imd.gov.in/api/v1/seabulletin",
            "Param_URL": "https://api.imd.gov.in/api/v1/seabulletin?id=108",
            "Visualize_Data": "https://mausam.imd.gov.in/responsive/marine_forecast.php",
            "Fields": [
                {"Field": "Id", "Value": "id", "Description": "Bulletin ID"},
                {"Field": "Date of Observation", "Value": "YYYY-mm-dd", "Description": "Date of observation"},
                {"Field": "Layer", "Value": "Text", "Description": "Sea area / Layer name (e.g. South West Bay)"},
                {"Field": "Issued by", "Value": "Text", "Description": "Issuing office (e.g. ACWC KOLKATA)"},
                {"Field": "Valid From", "Value": "Timestamp", "Description": "Validity start time"},
                {"Field": "Validity", "Value": "Hours", "Description": "Validity duration in hours"},
                {"Field": "TTT Warning", "Value": "Text", "Description": "Tropical storm warning"},
                {"Field": "Wind", "Value": "Text", "Description": "Wind direction and speed in Knots"},
                {"Field": "Synoptic Situation", "Value": "Text", "Description": "Synoptic weather overview"},
                {"Field": "Weather", "Value": "Text", "Description": "Weather condition text"},
                {"Field": "Visibility", "Value": "Text", "Description": "Sea visibility condition"},
                {"Field": "Sea Condition", "Value": "Text", "Description": "Sea surface roughness state"},
                {"Field": "Part 4", "Value": "Text", "Description": "Additional Part 4 bulletin text"},
                {"Field": "Part 5", "Value": "Text", "Description": "Additional Part 5 bulletin text"},
                {"Field": "Part 6", "Value": "Text", "Description": "Additional Part 6 bulletin text"},
                {"Field": "Update Time", "Value": "Timestamp", "Description": "Last update timestamp"}
            ]
        },

        "Coastal_Bulletin": {
            "URL": "https://api.imd.gov.in/api/v1/coastalbulletin",
            "Visualize_Data": "https://mausam.imd.gov.in/responsive/coastal_forecast.php",
            "Fields": [
                {"Field": "Id", "Value": "id", "Description": "Coastal bulletin ID"},
                {"Field": "Date of Observation", "Value": "YYYY-mm-dd", "Description": "Date of observation"},
                {"Field": "Layer", "Value": "Text", "Description": "Coastline layer name (e.g. South Tamilnadu coast)"},
                {"Field": "Issued by", "Value": "Text", "Description": "Issuing office (e.g. ACWC CHENNAI)"},
                {"Field": "Valid From", "Value": "Timestamp", "Description": "Validity start time"},
                {"Field": "Validity", "Value": "Hours", "Description": "Validity duration in hours"},
                {"Field": "TTT Warning", "Value": "Text", "Description": "Tropical storm warning"},
                {"Field": "Wind", "Value": "Text", "Description": "Wind speed and direction in Knots"},
                {"Field": "Synoptic Situation", "Value": "Text", "Description": "Synoptic overview"},
                {"Field": "Weather", "Value": "Text", "Description": "Weather condition text"},
                {"Field": "Visibility", "Value": "Text", "Description": "Coastal visibility state"},
                {"Field": "Sea Condition", "Value": "Text", "Description": "Sea surface condition"},
                {"Field": "Port Signal", "Value": "Text", "Description": "Port warning signal status"},
                {"Field": "Update Time", "Value": "Timestamp", "Description": "Last update timestamp"}
            ]
        }
    },

    # --------------------------------------------------------------------------
    # HEADING 6: Cyclone APIs
    # --------------------------------------------------------------------------
    "Cyclone_APIs": {
        "Cyclone_Track": {
            "URL": "https://api.imd.gov.in/api/v1/cyclone_track",
            "Fields": [
                {"Field": "status", "Value": "boolean", "Description": "API response status"},
                {"Field": "message", "Value": "Text", "Description": "API message text"},
                {"Field": "totalCount", "Value": "Dict", "Description": "Object counts for observed & forecast points"},
                {"Field": "CYCLONE_NAME", "Value": "Text", "Description": "Official Cyclone Name (e.g. BULBUL)"},
                {"Field": "Hour", "Value": "Hours", "Description": "Observation hour"},
                {"Field": "Date/Time", "Value": "DD.MM.YY/HHMM", "Description": "Observation date and time stamp"},
                {"Field": "lat", "Value": "float", "Description": "Cyclone center latitude"},
                {"Field": "lon", "Value": "float", "Description": "Cyclone center longitude"},
                {"Field": "MSW range (kmph)", "Value": "Range", "Description": "Maximum Sustained Wind range in kmph"},
                {"Field": "Mean MSW (kmph)", "Value": "Float", "Description": "Mean Maximum Sustained Wind in kmph"},
                {"Field": "MSW (kt)", "Value": "Float", "Description": "Maximum Sustained Wind speed in Knots"},
                {"Field": "Category", "Value": "Text", "Description": "Intensity Category (e.g. DEEP DEPRESSION, CYCLONIC STORM)"}
            ]
        },

        "Cyclone_Wind_Warning": {
            "URL": "https://api.imd.gov.in/api/v1/cyclone_wind",
            "Fields": [
                {"Field": "status", "Value": "boolean", "Description": "API response status"},
                {"Field": "message", "Value": "Text", "Description": "API response message"},
                {"Field": "totalCount", "Value": "Dict", "Description": "Counts for 27kt, 34kt, 50kt, 64kt wind zones"},
                {"Field": "type", "Value": "MultiPolygon", "Description": "GeoJSON geometry type"},
                {"Field": "coordinates", "Value": "Array", "Description": "MultiPolygon latitude/longitude coordinate arrays for wind hazard contours"}
            ]
        },

        "Cyclone_Cone_of_Uncertainty": {
            "URL": "https://api.imd.gov.in/api/v1/cyclone_cou",
            "Fields": [
                {"Field": "status", "Value": "boolean", "Description": "API response status"},
                {"Field": "message", "Value": "Text", "Description": "API response message"},
                {"Field": "totalCount", "Value": "Integer", "Description": "Total cone polygon count"},
                {"Field": "type", "Value": "MultiPolygon", "Description": "GeoJSON geometry type"},
                {"Field": "coordinates", "Value": "Array", "Description": "MultiPolygon coordinates defining the forecast track cone of uncertainty"}
            ]
        }
    },

    # --------------------------------------------------------------------------
    # HEADING 7: Astronomical & Other APIs
    # --------------------------------------------------------------------------
    "Astronomical_And_Other_APIs": {
        "Sun_Moon_Rise_Set_Times": {
            "URL": "https://api.imd.gov.in/api/v1/sunmoon",
            "Param_URL": "https://api.imd.gov.in/api/v1/sunmoon?lat=26.9124&lon=75.7873",
            "Fields": [
                {"Field": "status", "Value": "boolean", "Description": "API response status"},
                {"Field": "message", "Value": "Text", "Description": "Response message string"},
                {"Field": "totalCount", "Value": "null/int", "Description": "Count of records"},
                {"Field": "sunrise", "Value": "HH:MM", "Description": "Sunrise time in IST"},
                {"Field": "sunset", "Value": "HH:MM", "Description": "Sunset time in IST"},
                {"Field": "moonrise", "Value": "HH:MM", "Description": "Moonrise time in IST"},
                {"Field": "moonset", "Value": "HH:MM", "Description": "Moonset time in IST"}
            ]
        }
    },

    # --------------------------------------------------------------------------
    # HEADING 8: Specialized NHAI, Agromet, Radar & Bulletin APIs
    # --------------------------------------------------------------------------
    "Specialized_NHAI_Agromet_Radar_APIs": {
        "All_India_Weather_Forecast_Bulletin": {
            "URL": "https://api.imd.gov.in/api/v1/all_india_bulletin",
            "Fields": [
                {"Field": "date_obs", "Value": "YYYY-MM-DD", "Description": "Date of Bulletin Issue"},
                {"Field": "bulletin_title", "Value": "Text", "Description": "All India Weather Bulletin Title"},
                {"Field": "summary_text", "Value": "Text", "Description": "Synoptic meteorological situation and nationwide forecast summary"},
                {"Field": "pdf_url", "Value": "URL", "Description": "Link to official PDF weather bulletin document"}
            ]
        },

        "Weather_At_Your_Location_Mausamgram": {
            "URL": "https://api.imd.gov.in/api/v1/mausamgram",
            "Param_URL": "https://api.imd.gov.in/api/v1/mausamgram?lat=28.6139&lon=77.2090",
            "Fields": [
                {"Field": "lat", "Value": "float", "Description": "Query Latitude"},
                {"Field": "lon", "Value": "float", "Description": "Query Longitude"},
                {"Field": "location_name", "Value": "Text", "Description": "Resolved location or grid point name"},
                {"Field": "forecast_series", "Value": "Array", "Description": "Hyperlocal meteogram forecast series (temp, rain, wind, clouds)"}
            ]
        },

        "Highway_Nowcast_Warning_NHAI": {
            "URL": "https://api.imd.gov.in/api/v1/nhai_nowcast",
            "Fields": [
                {"Field": "highway_id", "Value": "Text/ID", "Description": "National Highway stretch identifier"},
                {"Field": "highway_name", "Value": "Text", "Description": "NH Highway Name (e.g. NH-44)"},
                {"Field": "warning_level", "Value": "1-4", "Description": "Severity warning code for highway traffic"},
                {"Field": "warning_message", "Value": "Text", "Description": "Immediate nowcast severe weather warning along highway route"},
                {"Field": "valid_upto", "Value": "Timestamp", "Description": "Warning validity timestamp"}
            ]
        },

        "Highway_Warning_5_Days_NHAI": {
            "URL": "https://api.imd.gov.in/api/v1/nhai_warning",
            "Fields": [
                {"Field": "highway_id", "Value": "Text/ID", "Description": "National Highway stretch identifier"},
                {"Field": "highway_name", "Value": "Text", "Description": "NH Highway Name"},
                {"Field": "day1_warning", "Value": "Text", "Description": "5-day outlook warning description for Day-1"},
                {"Field": "day2_warning", "Value": "Text", "Description": "5-day outlook warning description for Day-2"},
                {"Field": "day3_warning", "Value": "Text", "Description": "5-day outlook warning description for Day-3"},
                {"Field": "day4_warning", "Value": "Text", "Description": "5-day outlook warning description for Day-4"},
                {"Field": "day5_warning", "Value": "Text", "Description": "5-day outlook warning description for Day-5"}
            ]
        },

        "Radar_Image_API": {
            "URL": "https://api.imd.gov.in/api/v1/radar_image",
            "Param_URL": "https://api.imd.gov.in/api/v1/radar_image?station=DELHI",
            "Fields": [
                {"Field": "station", "Value": "Text", "Description": "Radar station name (e.g. DELHI, MUMBAI, CHENNAI)"},
                {"Field": "product_type", "Value": "Text", "Description": "Radar product type (MAX, PPZ, PAC, SRI)"},
                {"Field": "timestamp", "Value": "Timestamp", "Description": "Scan observation timestamp"},
                {"Field": "image_url", "Value": "URL", "Description": "Direct URL link to Doppler Weather Radar PNG/GIF image"}
            ]
        },

        "Lightning_Data_API": {
            "URL": "https://api.imd.gov.in/api/v1/lightning_data",
            "Fields": [
                {"Field": "timestamp", "Value": "Timestamp", "Description": "Lightning strike observation timestamp"},
                {"Field": "latitude", "Value": "float", "Description": "Lightning strike latitude"},
                {"Field": "longitude", "Value": "float", "Description": "Lightning strike longitude"},
                {"Field": "strike_type", "Value": "Text", "Description": "Cloud-to-Ground (CG) or Intra-Cloud (IC)"},
                {"Field": "peak_current_ka", "Value": "Float", "Description": "Peak stroke current in KiloAmperes (kA)"}
            ]
        },

        "Agromet_Advisory_API": {
            "URL": "https://api.imd.gov.in/api/v1/agromet_advisory",
            "Param_URL": "https://api.imd.gov.in/api/v1/agromet_advisory?district_id=164",
            "Fields": [
                {"Field": "district_id", "Value": "id", "Description": "District Object ID"},
                {"Field": "district", "Value": "Text", "Description": "District name"},
                {"Field": "state", "Value": "Text", "Description": "State name"},
                {"Field": "issue_date", "Value": "YYYY-MM-DD", "Description": "Advisory bulletin issue date"},
                {"Field": "crop_name", "Value": "Text", "Description": "Target agricultural crop name"},
                {"Field": "stage_of_growth", "Value": "Text", "Description": "Crop growth stage (e.g. Sowing, Flowering, Harvest)"},
                {"Field": "weather_summary", "Value": "Text", "Description": "Recent weather summary and forecast outlook"},
                {"Field": "advisory_message", "Value": "Text", "Description": "Actionable agricultural crop management advisory message"}
            ]
        }
    }
}
