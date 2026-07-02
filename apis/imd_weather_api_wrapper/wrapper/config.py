# imd_api_wrapper/wrapper/config.py
# ─────────────────────────────────────────────────────────────
# All constants are derived directly from the KCC 15.5M query
# analysis.  Do NOT edit numbers here by hand — they come from
# the cluster distribution document.
# ─────────────────────────────────────────────────────────────

# IMD endpoint slugs 
ENDPOINTS = {
    "city_forecast"    : "/city/api/cityweather.php",                    # CRITICAL
    "district_forecast": "/mausam/api/nowcast_district_api.php",         # HIGH
    "rainfall_forecast": "/mausam/api/districtwise_rainfall_api.php",    # MEDIUM
    "current_weather"  : "/city/api/cityweather.php",                    # MEDIUM
    "nowcast"          : "/mausam/api/nowcast_district_api.php",         # LOW
}

# Data freshness in minutes 
FRESHNESS_MINUTES = {
    "city_forecast"    : 360,   # 6 hours
    "district_forecast": 360,   # 6 hours
    "rainfall_forecast": 180,   # 3 hours
    "current_weather"  :  60,   # real-time / hourly
    "nowcast"          : 180,   # 3 hours
}

# Priority tiers 
PRIORITY = {
    "city_forecast"    : "CRITICAL",
    "district_forecast": "HIGH",
    "rainfall_forecast": "MEDIUM",
    "current_weather"  : "MEDIUM",
    "nowcast"          : "LOW",
}

# Farmer need labels (from KCC clustering) 
FARMER_NEED = {
    "city_forecast"    : "General Weather Forecast",
    "district_forecast": "District Weather Forecast",
    "rainfall_forecast": "Rain Forecast",
    "current_weather"  : "Current Weather Condition",
    "nowcast"          : "Short Term Forecast",
}

# Total queries per farmer need (from 15.5M KCC dataset) 
TOTAL_QUERIES_PER_NEED = {
    "General Weather Forecast"  : 13_706_092,
    "District Weather Forecast" :  1_335_570,
    "Rain Forecast"             :    248_633,
    "Current Weather Condition" :    180_855,
    "Short Term Forecast"       :     57_084,
}

TOTAL_WEATHER_QUERIES = 15_549_889   # full KCC weather dataset

# All 59 clusters → farmer need mapping 
# Built from the cluster distribution document.
CLUSTER_TO_NEED = {
    # General Weather Forecast (13,706,092 queries)
    3 : "General Weather Forecast",
    18: "General Weather Forecast",
    28: "General Weather Forecast",
    27: "General Weather Forecast",
    58: "General Weather Forecast",
    10: "General Weather Forecast",
    15: "General Weather Forecast",
    14: "General Weather Forecast",
    30: "General Weather Forecast",
    13: "General Weather Forecast",
    47: "General Weather Forecast",

    # District Weather Forecast (1,335,570 queries)
    54: "District Weather Forecast",
    36: "District Weather Forecast",
    41: "District Weather Forecast",
    8 : "District Weather Forecast",
    9 : "District Weather Forecast",
    12: "District Weather Forecast",
    40: "District Weather Forecast",
    52: "District Weather Forecast",
    17: "District Weather Forecast",
    7 : "District Weather Forecast",
    26: "District Weather Forecast",
    1 : "District Weather Forecast",
    53: "District Weather Forecast",
    32: "District Weather Forecast",
    22: "District Weather Forecast",
    45: "District Weather Forecast",
    48: "District Weather Forecast",
    56: "District Weather Forecast",
    0 : "District Weather Forecast",
    6 : "District Weather Forecast",
    33: "District Weather Forecast",
    37: "District Weather Forecast",
    50: "District Weather Forecast",
    31: "District Weather Forecast",
    39: "District Weather Forecast",
    21: "District Weather Forecast",
    25: "District Weather Forecast",
    46: "District Weather Forecast",
    55: "District Weather Forecast",
    49: "District Weather Forecast",
    44: "District Weather Forecast",
    57: "District Weather Forecast",
    34: "District Weather Forecast",
    38: "District Weather Forecast",
    43: "District Weather Forecast",
    16: "District Weather Forecast",

    # Rain Forecast (248,633 queries)
    20: "Rain Forecast",
    2 : "Rain Forecast",
    4 : "Rain Forecast",
    42: "Rain Forecast",
    19: "Rain Forecast",

    # Current Weather Condition (180,855 queries)
    35: "Current Weather Condition",
    29: "Current Weather Condition",
    11: "Current Weather Condition",

    # Short Term Forecast (57,084 queries)
    24: "Short Term Forecast",
    23: "Short Term Forecast",
}

# Farmer need → endpoint key 
NEED_TO_ENDPOINT = {
    "General Weather Forecast"  : "city_forecast",
    "District Weather Forecast" : "district_forecast",
    "Rain Forecast"             : "rainfall_forecast",
    "Current Weather Condition" : "current_weather",
    "Short Term Forecast"       : "nowcast",
}

# Cluster query counts (from KCC analysis) 
CLUSTER_QUERY_COUNTS = {
    3 :6_256_573, 18:3_060_474, 28:1_154_643, 27:1_113_802,
    58:1_091_123, 10:  559_282, 54:  349_023, 15:  240_909,
    20:  170_137, 35:  163_029, 36:  102_497, 41:   98_205,
    14:   98_136,  8:   73_673, 30:   68_145,  9:   64_584,
    12:   63_738, 24:   49_891, 40:   49_767, 52:   43_465,
    13:   37_615, 17:   36_092,  7:   35_614, 26:   31_027,
     2:   28_885,  1:   28_883,  4:   27_307, 53:   26_387,
    32:   25_943, 47:   25_390, 22:   25_095, 45:   24_712,
    48:   23_498, 56:   21_940,  0:   20_614,  6:   20_192,
    42:   18_640, 29:   17_649, 33:   16_390, 37:   14_970,
    50:   14_767, 31:   13_905, 39:   13_282, 21:   13_258,
    25:   13_236, 46:   11_814,  5:   11_489, 55:   10_766,
    49:   10_703, 51:   10_166, 44:    9_085, 57:    9_018,
    34:    8_898, 38:    7_755, 23:    7_193, 19:    3_664,
    43:    2_685, 11:      177, 16:       89,
}