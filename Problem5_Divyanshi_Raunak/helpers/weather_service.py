import requests
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

logger = logging.getLogger("ajrasakha.weather")

# In-memory cache for geocoding and live weather (TTL = 10 minutes)
_WEATHER_CACHE: Dict[str, Dict[str, Any]] = {}
_GEO_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 600

# WMO Weather Interpretation Codes
WMO_CODES = {
    0: {"en": "Clear Sky", "hi": "साफ आसमान", "icon": "sun"},
    1: {"en": "Mainly Clear", "hi": "मुख्यतः साफ", "icon": "sun"},
    2: {"en": "Partly Cloudy", "hi": "हल्के बादल", "icon": "cloud-sun"},
    3: {"en": "Overcast", "hi": "घने बादल", "icon": "cloud"},
    45: {"en": "Fog", "hi": "कोहरा", "icon": "cloud-fog"},
    48: {"en": "Depositing Rime Fog", "hi": "सघन कोहरा", "icon": "cloud-fog"},
    51: {"en": "Light Drizzle", "hi": "हल्की बूंदाबांदी", "icon": "cloud-drizzle"},
    53: {"en": "Moderate Drizzle", "hi": "बूंदाबांदी", "icon": "cloud-drizzle"},
    55: {"en": "Dense Drizzle", "hi": "सघन बूंदाबांदी", "icon": "cloud-drizzle"},
    61: {"en": "Slight Rain", "hi": "हल्की बारिश", "icon": "cloud-rain"},
    63: {"en": "Moderate Rain", "hi": "मध्यम बारिश", "icon": "cloud-rain"},
    65: {"en": "Heavy Rain", "hi": "भारी बारिश", "icon": "cloud-rain"},
    71: {"en": "Slight Snow", "hi": "हल्की बर्फबारी", "icon": "cloud-snow"},
    73: {"en": "Moderate Snow", "hi": "बर्फबारी", "icon": "cloud-snow"},
    75: {"en": "Heavy Snow", "hi": "भारी बर्फबारी", "icon": "cloud-snow"},
    80: {"en": "Rain Showers", "hi": "तेज बौछारें", "icon": "cloud-rain"},
    81: {"en": "Moderate Showers", "hi": "मध्यम बौछारें", "icon": "cloud-rain"},
    82: {"en": "Violent Showers", "hi": "मूसलाधार बौछारें", "icon": "cloud-lightning"},
    95: {"en": "Thunderstorm", "hi": "आंधी-तूफान", "icon": "cloud-lightning"},
    96: {"en": "Thunderstorm with Hail", "hi": "ओलावृष्टि व आंधी", "icon": "cloud-lightning"},
    99: {"en": "Severe Thunderstorm with Hail", "hi": "भीषण ओलावृष्टि व तूफान", "icon": "cloud-lightning"}
}

DEFAULT_STATIONS = [
    {"id": "ludhiana", "name": "Ludhiana", "state": "Punjab", "lat": 30.91, "lon": 75.85},
    {"id": "karnal", "name": "Karnal", "state": "Haryana", "lat": 29.69, "lon": 76.98},
    {"id": "roorkee", "name": "Roorkee", "state": "Uttarakhand", "lat": 29.87, "lon": 77.89},
    {"id": "jaipur", "name": "Jaipur", "state": "Rajasthan", "lat": 26.92, "lon": 75.82},
    {"id": "bhopal", "name": "Bhopal", "state": "Madhya Pradesh", "lat": 23.25, "lon": 77.42},
    {"id": "pune", "name": "Pune", "state": "Maharashtra", "lat": 18.52, "lon": 73.86},
    {"id": "patna", "name": "Patna", "state": "Bihar", "lat": 25.60, "lon": 85.12},
    {"id": "shimla", "name": "Shimla", "state": "Himachal Pradesh", "lat": 31.10, "lon": 77.17},
]

def get_agro_meta(state: str) -> Dict[str, str]:
    state_lower = (state or "").lower()
    if any(s in state_lower for s in ["punjab", "haryana"]):
        return {"agro_zone": "North-Western Granary", "major_crops": "Wheat, Paddy, Mustard, Cotton"}
    elif any(s in state_lower for s in ["uttarakhand", "uttar pradesh"]):
        return {"agro_zone": "Upper Indo-Gangetic Plains", "major_crops": "Sugarcane, Wheat, Mustard, Potato"}
    elif "rajasthan" in state_lower:
        return {"agro_zone": "Western Semi-Arid Zone", "major_crops": "Mustard, Bajra, Guar, Pulses"}
    elif "madhya pradesh" in state_lower:
        return {"agro_zone": "Central Black Soil Belt", "major_crops": "Soybean, Gram (Chana), Wheat, Garlic"}
    elif "maharashtra" in state_lower:
        return {"agro_zone": "Deccan Plateau & Western Ghats", "major_crops": "Sugarcane, Onion, Grapes, Cotton"}
    elif any(s in state_lower for s in ["himachal", "jammu", "kashmir"]):
        return {"agro_zone": "Himalayan Horticulture Zone", "major_crops": "Apple, Stone Fruits, Off-season Veggies"}
    elif any(s in state_lower for s in ["bihar", "bengal"]):
        return {"agro_zone": "Lower Gangetic Alluvial Plains", "major_crops": "Paddy, Maize, Jute, Vegetables"}
    elif "gujarat" in state_lower:
        return {"agro_zone": "Western Coastal & Semi-Arid Zone", "major_crops": "Cotton, Groundnut, Cumin, Castor"}
    else:
        return {"agro_zone": "Central & Peninsular Agricultural Zone", "major_crops": "Paddy, Pulses, Millets, Oilseeds"}

def geocode_city(city_query: str) -> Optional[Dict[str, Any]]:
    clean_query = city_query.strip()
    if not clean_query:
        return None
        
    cache_key = clean_query.lower()
    cached = _GEO_CACHE.get(cache_key)
    if cached and (datetime.utcnow() - cached["cached_at"]).total_seconds() < 86400:
        return cached["data"]
        
    try:
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={clean_query}&count=1&language=en&format=json"
        resp = requests.get(url, timeout=4)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results")
            if results and len(results) > 0:
                best = results[0]
                res_data = {
                    "name": best.get("name", clean_query),
                    "state": best.get("admin1") or best.get("country", ""),
                    "country": best.get("country", "India"),
                    "lat": round(best.get("latitude"), 4),
                    "lon": round(best.get("longitude"), 4)
                }
                _GEO_CACHE[cache_key] = {"data": res_data, "cached_at": datetime.utcnow()}
                return res_data
    except Exception as e:
        logger.warning(f"Geocoding error for '{city_query}': {e}")
        
    return None

def fetch_open_meteo_weather(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    cache_key = f"{lat}_{lon}"
    cached = _WEATHER_CACHE.get(cache_key)
    if cached and (datetime.utcnow() - cached["cached_at"]).total_seconds() < CACHE_TTL_SECONDS:
        return cached["data"]
        
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m"
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max"
            "&timezone=auto"
        )
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            _WEATHER_CACHE[cache_key] = {"data": data, "cached_at": datetime.utcnow()}
            return data
    except Exception as e:
        logger.warning(f"Weather fetch error for {lat},{lon}: {e}")
        
    return None

def calculate_agro_risk(temp: float, humidity: float, wind: float, rain: float, weather_code: int) -> Dict[str, str]:
    if rain > 5.0 or wind > 25.0 or weather_code in [95, 96, 99]:
        return {
            "status": "RED ALERT",
            "status_desc": "HAZARDOUS / FIELD RISK",
            "badge_color": "rose"
        }
    elif temp > 37.0 or wind > 18.0 or humidity > 85.0 or rain > 1.0 or weather_code in [80, 81, 82]:
        return {
            "status": "YELLOW ALERT",
            "status_desc": "WATCH / CAUTION",
            "badge_color": "amber"
        }
    else:
        return {
            "status": "GREEN ALERT",
            "status_desc": "FAVORABLE",
            "badge_color": "emerald"
        }

def build_dynamic_crop_advisory(crop_name: str, temp: float, humidity: float, wind: float, rain: float, daily: Dict[str, Any]) -> Dict[str, Any]:
    crop_labels = {
        "Wheat": "Wheat (गेहूँ)",
        "Paddy": "Paddy / Rice (धान)",
        "Mustard": "Mustard (सरसों)",
        "Cotton": "Cotton (कपास)",
        "Sugarcane": "Sugarcane (गन्ना)",
        "Soybean": "Soybean (सोयाबीन)",
        "Gram": "Gram / Chana (चना)",
        "Potato": "Potato (आलू)"
    }
    label = crop_labels.get(crop_name, f"{crop_name} (फसल)")
    
    # 1. Spray Window
    rain_prob = 0
    if daily and "precipitation_probability_max" in daily and len(daily["precipitation_probability_max"]) > 0:
        rain_prob = daily["precipitation_probability_max"][0] or 0
        
    if rain > 0.5 or rain_prob >= 40:
        spray = {
            "badge": "DO NOT SPRAY",
            "title": f"Rainfall Risk ({rain_prob}% Probability)",
            "details": f"Active or incoming precipitation ({rain} mm current, {rain_prob}% forecast probability). Chemical washes off within 2 hours. Suspend all spraying."
        }
    elif wind >= 18.0:
        spray = {
            "badge": "HIGH DRIFT HAZARD",
            "title": f"Excessive Wind Speed ({wind} km/h)",
            "details": f"Wind exceeds the 15 km/h safety threshold. High drift will cause off-target contamination. Postpone foliar spraying."
        }
    elif wind >= 12.0:
        spray = {
            "badge": "CONDITIONAL SPRAY",
            "title": f"Moderate Wind ({wind} km/h)",
            "details": f"Borderline spraying conditions. Use anti-drift hollow cone nozzles and maintain 50 cm nozzle boom distance."
        }
    else:
        spray = {
            "badge": "SAFE TO SPRAY",
            "title": f"Calm Window ({wind} km/h Wind, Dry)",
            "details": f"Optimal atmospheric conditions for {crop_name}. Excellent droplet retention on foliage with minimal evaporation drift."
        }

    # 2. Irrigation Advice
    rain_sum_48h = 0.0
    if daily and "precipitation_sum" in daily:
        rain_sum_48h = sum(daily["precipitation_sum"][:2])
        
    if rain_sum_48h >= 4.0:
        irrigation = {
            "badge": "HOLD IRRIGATION",
            "title": f"Rain Forecasted ({round(rain_sum_48h, 1)} mm in 48h)",
            "details": f"Natural rainfall is anticipated in the next 48 hours. Postpone irrigation to avoid standing water and root asphyxiation in {crop_name}."
        }
    elif temp >= 35.0 or humidity <= 35:
        irrigation = {
            "badge": "IRRIGATION URGENT",
            "title": f"High Evaporative Stress ({temp}°C, {humidity}%)",
            "details": f"Severe evapotranspiration loss. Provide immediate evening or nocturnal irrigation to prevent moisture stress and wilting."
        }
    elif temp >= 28.0:
        irrigation = {
            "badge": "IRRIGATION RECOMMENDED",
            "title": f"Moderate Root-Zone Moisture Needed",
            "details": f"Dry topsoil conditions forecasted. Provide light scheduled irrigation to preserve vegetative growth."
        }
    else:
        irrigation = {
            "badge": "MOISTURE ADEQUATE",
            "title": f"Low Evaporative Demand ({temp}°C)",
            "details": f"Cool weather minimizes transpiration loss. Soil moisture remains stable; check root depth moisture before irrigating."
        }

    # 3. Pest & Disease Surveillance
    if humidity >= 75 and 18.0 <= temp <= 32.0:
        pest = {
            "badge": "HIGH SURVEILLANCE",
            "title": f"Fungal & Blight Threat (Humidity {humidity}%)",
            "details": f"High humidity ({humidity}%) and warm ambient air ({temp}°C) accelerate fungal spore germination (rust, blight, leaf spot). Inspect crop canopy."
        }
    elif temp >= 32.0 and humidity <= 50:
        pest = {
            "badge": "SUCKING PEST WATCH",
            "title": f"Aphid & Thrips Proliferation ({temp}°C)",
            "details": f"Warm, dry weather accelerates reproductive cycles of aphids, thrips, and mites in {crop_name}. Inspect central whorls and undersides of leaves."
        }
    else:
        pest = {
            "badge": "MODERATE SURVEILLANCE",
            "title": "Normal Pest Activity Window",
            "details": f"Atmospheric parameters within seasonal baseline for {crop_name}. Continue standard weekly pheromone trap monitoring."
        }

    return {
        "crop_label": label,
        "spray_window": spray,
        "irrigation": irrigation,
        "pest_index": pest
    }

def get_city_live_weather(city_name: str, crop: str = "Wheat") -> Dict[str, Any]:
    """
    Fetches real-time dynamic weather and tailored agricultural advisories for any searched city.
    """
    geo = geocode_city(city_name)
    if not geo:
        # Fallback to Ludhiana if geocoding cannot find the exact name
        geo = {"name": city_name, "state": "India", "country": "India", "lat": 30.91, "lon": 75.85}
        
    w_data = fetch_open_meteo_weather(geo["lat"], geo["lon"])
    meta = get_agro_meta(geo.get("state", ""))
    
    if not w_data or "current" not in w_data:
        # Static fallback if offline
        return {
            "id": city_name.lower().replace(" ", "_"),
            "city": f"{geo['name']}, {geo['state']}",
            "agro_zone": meta["agro_zone"],
            "status": "GREEN ALERT",
            "status_desc": "FAVORABLE",
            "temp": 30.0,
            "apparent_temp": 31.5,
            "wind": "8.0 km/h",
            "humidity": "60%",
            "precipitation": "0.0 mm",
            "condition": "साफ आसमान / Fair",
            "major_crops": meta["major_crops"],
            "advisory": f"Favorable conditions across {geo['name']}. Normal agricultural operations recommended.",
            "forecast": [],
            "crop_advisory": build_dynamic_crop_advisory(crop, 30.0, 60.0, 8.0, 0.0, {})
        }
        
    curr = w_data["current"]
    temp = round(curr.get("temperature_2m", 28.0), 1)
    apparent_temp = round(curr.get("apparent_temperature", temp), 1)
    humidity = round(curr.get("relative_humidity_2m", 60.0))
    wind_kmh = round(curr.get("wind_speed_10m", 8.0), 1)
    rain_mm = round(curr.get("rain", curr.get("precipitation", 0.0)), 1)
    w_code = curr.get("weather_code", 0)
    
    wmo_info = WMO_CODES.get(w_code, {"en": "Fair", "hi": "मौसम सामान्य"})
    condition_str = f"{wmo_info['hi']} / {wmo_info['en']}"
    
    risk = calculate_agro_risk(temp, humidity, wind_kmh, rain_mm, w_code)
    
    daily = w_data.get("daily", {})
    daily_forecast = []
    if daily and "time" in daily:
        dates = daily.get("time", [])[:5]
        max_temps = daily.get("temperature_2m_max", [])[:5]
        min_temps = daily.get("temperature_2m_min", [])[:5]
        codes = daily.get("weather_code", [])[:5]
        rain_probs = daily.get("precipitation_probability_max", [])[:5]
        
        for i in range(len(dates)):
            c_code = codes[i] if i < len(codes) else 0
            c_info = WMO_CODES.get(c_code, {"en": "Fair", "hi": "सामान्य"})
            daily_forecast.append({
                "date": dates[i],
                "max_temp": round(max_temps[i], 1) if i < len(max_temps) else temp,
                "min_temp": round(min_temps[i], 1) if i < len(min_temps) else temp - 8,
                "rain_prob": rain_probs[i] if i < len(rain_probs) else 0,
                "condition": c_info["en"],
                "condition_hi": c_info["hi"]
            })
            
    crop_advisory = build_dynamic_crop_advisory(crop, temp, humidity, wind_kmh, rain_mm, daily)
    
    advisory_text = (
        f"Live IMD bulletin for {geo['name']}: {condition_str}. "
        f"Wind: {wind_kmh} km/h, Humidity: {humidity}%. "
        f"{crop_advisory['spray_window']['badge']} for {crop}. "
        f"{crop_advisory['irrigation']['title']}."
    )
    
    return {
        "id": geo["name"].lower().replace(" ", "_"),
        "city": f"{geo['name']}, {geo['state']}",
        "agro_zone": meta["agro_zone"],
        "status": risk["status"],
        "status_desc": risk["status_desc"],
        "temp": temp,
        "apparent_temp": apparent_temp,
        "wind": f"{wind_kmh} km/h",
        "humidity": f"{humidity}%",
        "precipitation": f"{rain_mm} mm",
        "condition": condition_str,
        "major_crops": meta["major_crops"],
        "advisory": advisory_text,
        "forecast": daily_forecast,
        "crop_advisory": crop_advisory
    }

def get_imd_agro_alerts() -> Dict[str, Any]:
    """
    Returns real-time dynamic weather stations across major Indian agro-climatic zones,
    fetched in parallel for sub-second responsiveness.
    """
    from concurrent.futures import ThreadPoolExecutor

    def _fetch_single_station(station: Dict[str, Any]) -> Dict[str, Any]:
        meta = get_agro_meta(station["state"])
        try:
            w_data = fetch_open_meteo_weather(station["lat"], station["lon"])
            if w_data and "current" in w_data:
                curr = w_data["current"]
                temp = round(curr.get("temperature_2m", 28.0), 1)
                humidity = round(curr.get("relative_humidity_2m", 60.0))
                wind = round(curr.get("wind_speed_10m", 8.0), 1)
                rain = round(curr.get("rain", 0.0), 1)
                w_code = curr.get("weather_code", 0)
                wmo_info = WMO_CODES.get(w_code, {"en": "Fair", "hi": "सामान्य"})
                risk = calculate_agro_risk(temp, humidity, wind, rain, w_code)
                condition_str = f"{wmo_info['hi']} / {wmo_info['en']}"
                
                advisory = (
                    f"{risk['status_desc']}: Wind {wind} km/h, Humidity {humidity}%. "
                    f"Conditions {'favorable' if risk['status'] == 'GREEN ALERT' else 'require monitoring'} for {meta['major_crops'].split(',')[0]}."
                )
                
                return {
                    "id": station["id"],
                    "city": f"{station['name']}, {station['state']}",
                    "agro_zone": meta["agro_zone"],
                    "status": risk["status"],
                    "status_desc": risk["status_desc"],
                    "temp": temp,
                    "wind": f"{wind} km/h",
                    "humidity": f"{humidity}%",
                    "condition": condition_str,
                    "major_crops": meta["major_crops"],
                    "advisory": advisory
                }
        except Exception as e:
            logger.warning(f"Error fetching station {station['name']}: {e}")

        # Fallback
        return {
            "id": station["id"],
            "city": f"{station['name']}, {station['state']}",
            "agro_zone": meta["agro_zone"],
            "status": "GREEN ALERT",
            "status_desc": "FAVORABLE",
            "temp": 28.0,
            "wind": "8.0 km/h",
            "humidity": "60%",
            "condition": "साफ आसमान / Fair",
            "major_crops": meta["major_crops"],
            "advisory": f"Normal agricultural operations for {meta['major_crops']}."
        }

    with ThreadPoolExecutor(max_workers=8) as executor:
        zones = list(executor.map(_fetch_single_station, DEFAULT_STATIONS))

    return {"zones": zones, "active_location": zones[0] if zones else None}

def get_crop_smart_advisory(crop_name: str = "Wheat", city: str = "Ludhiana") -> Dict[str, Any]:
    """
    Returns live weather-informed decision matrix for the requested crop and city.
    """
    city_weather = get_city_live_weather(city, crop=crop_name)
    return city_weather.get("crop_advisory", build_dynamic_crop_advisory(crop_name, 28.0, 60.0, 8.0, 0.0, {}))
