"""Core 30 farming scenarios covering the 5 agricultural domains.

The list is the **single source of truth** for the cross-lingual test
suite — every translation, evaluation, and report is derived from this
file.  Scenarios mirror real farmer queries observed in production,
spanning the 5 knowledge domains supported by AjraSakha:

    * weather        — 6 scenarios
    * pest           — 6 scenarios
    * scheme         — 6 scenarios
    * soil           — 6 scenarios
    * market         — 6 scenarios

Each scenario carries:
    * ``id``           — stable identifier (e.g. ``WEATHER-001``)
    * ``domain``       — one of the 5 supported domains
    * ``english_query``— canonical English phrasing used for translation
    * ``location``     — farmer-typical location context (state / city)
    * ``expected_gdb_key`` — the GDB / golden-answer entry the agent
                             should retrieve (used for correctness)
    * ``expected_entities`` — entities that must appear transliterated
                               correctly in the response
                             (crop names, scheme names, pesticide names)
    * ``expected_contains`` / ``expected_not_contains`` — content
                                assertions for the response body
    * ``expected_disclaimer_present`` — whether the 2-hour freshness
                                          disclaimer is required

Translation teams should validate these scenarios first before
generating the localized variants.
"""
from __future__ import annotations

from typing import Dict, List


# Canonical list of 30 scenarios — order is stable and used for reporting.
FARMING_SCENARIOS: List[Dict] = [
    # ───────────────────────── 1. WEATHER (6) ─────────────────────────
    {
        "id": "WEATHER-001",
        "domain": "weather",
        "english_query": "Will it rain in the next 3 days in Ropar, Punjab? Should I delay sowing of wheat?",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_gdb_key": "weather_forecast_3day_rainfall",
        "expected_entities": ["wheat"],
        "expected_contains": ["rain", "Ropar"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "WEATHER-002",
        "domain": "weather",
        "english_query": "What is the maximum temperature expected in Hisar, Haryana this week? My mustard crop is drying.",
        "location": {"city": "Hisar", "state": "Haryana"},
        "expected_gdb_key": "weather_temperature_max_weekly",
        "expected_entities": ["mustard"],
        "expected_contains": ["temperature", "Hisar"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "WEATHER-003",
        "domain": "weather",
        "english_query": "Is there a cyclone warning for coastal Tamil Nadu? I grow rice in Thanjavur.",
        "location": {"city": "Thanjavur", "state": "Tamil Nadu"},
        "expected_gdb_key": "weather_cyclone_warning_tn",
        "expected_entities": ["rice"],
        "expected_contains": ["cyclone", "Tamil Nadu"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "WEATHER-004",
        "domain": "weather",
        "english_query": "Humidity is very high in Bengaluru. Will there be fog tomorrow morning? Tomato plants are flowering.",
        "location": {"city": "Bengaluru", "state": "Karnataka"},
        "expected_gdb_key": "weather_humidity_fog_forecast",
        "expected_entities": ["tomato"],
        "expected_contains": ["humidity", "Bengaluru"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "WEATHER-005",
        "domain": "weather",
        "english_query": "Heavy rain forecast in Warangal, Telangana for cotton. Should I drain the field today?",
        "location": {"city": "Warangal", "state": "Telangana"},
        "expected_gdb_key": "weather_heavy_rain_drainage_advice",
        "expected_entities": ["cotton"],
        "expected_contains": ["rain", "Warangal"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "WEATHER-006",
        "domain": "weather",
        "english_query": "Will there be frost in Ludhiana tomorrow night? My potato crop is at risk.",
        "location": {"city": "Ludhiana", "state": "Punjab"},
        "expected_gdb_key": "weather_frost_warning_potato",
        "expected_entities": ["potato"],
        "expected_contains": ["frost", "Ludhiana"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    # ────────────────────────── 2. PEST (6) ───────────────────────────
    {
        "id": "PEST-001",
        "domain": "pest",
        "english_query": "Pink bollworm is attacking my cotton in Sirsa. What pesticide should I spray and at what dose?",
        "location": {"city": "Sirsa", "state": "Haryana"},
        "expected_gdb_key": "pest_pink_bollworm_cotton_control",
        "expected_entities": ["cotton", "pink bollworm", "emamectin benzoate"],
        "expected_contains": ["pesticide", "dose"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "PEST-002",
        "domain": "pest",
        "english_query": "Aphids on my mustard crop in Bharatpur. Suggest an organic and a chemical control.",
        "location": {"city": "Bharatpur", "state": "Rajasthan"},
        "expected_gdb_key": "pest_aphid_mustard_control",
        "expected_entities": ["mustard", "aphid", "imidacloprid"],
        "expected_contains": ["organic", "chemical"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "PEST-003",
        "domain": "pest",
        "english_query": "Yellow rust has appeared on my wheat in Jalandhar. What fungicide works best right now?",
        "location": {"city": "Jalandhar", "state": "Punjab"},
        "expected_gdb_key": "pest_yellow_rust_wheat_fungicide",
        "expected_entities": ["wheat", "yellow rust", "propiconazole"],
        "expected_contains": ["fungicide"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "PEST-004",
        "domain": "pest",
        "english_query": "Stem borer damage in my rice paddy in Thanjavur. Need urgent control advice.",
        "location": {"city": "Thanjavur", "state": "Tamil Nadu"},
        "expected_gdb_key": "pest_stem_borer_rice_control",
        "expected_entities": ["rice", "stem borer", "cartap hydrochloride"],
        "expected_contains": ["paddy", "control"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "PEST-005",
        "domain": "pest",
        "english_query": "Whitefly is sucking sap from my tomato plants in Kolar. Which insecticide is safest?",
        "location": {"city": "Kolar", "state": "Karnataka"},
        "expected_gdb_key": "pest_whitefly_tomato_control",
        "expected_entities": ["tomato", "whitefly", "spiromesifen"],
        "expected_contains": ["insecticide"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "PEST-006",
        "domain": "pest",
        "english_query": "Fall armyworm has been spotted on maize in Karimnagar. How do I stop it spreading?",
        "location": {"city": "Karimnagar", "state": "Telangana"},
        "expected_gdb_key": "pest_fall_armyworm_maize_control",
        "expected_entities": ["maize", "fall armyworm", "spinetoram"],
        "expected_contains": ["maize", "spread"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    # ────────────────────────── 3. SCHEME (6) ─────────────────────────
    {
        "id": "SCHEME-001",
        "domain": "scheme",
        "english_query": "Tell me about the PM-Kisan Samman Nidhi scheme. Who is eligible and how do I apply?",
        "location": {"city": "Mathura", "state": "Uttar Pradesh"},
        "expected_gdb_key": "scheme_pm_kisan_eligibility_application",
        "expected_entities": ["PM-Kisan Samman Nidhi"],
        "expected_contains": ["6000", "eligible", "apply"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SCHEME-002",
        "domain": "scheme",
        "english_query": "What is the Pradhan Mantri Fasal Bima Yojana (PMFBY) and how does it help with crop insurance?",
        "location": {"city": "Nashik", "state": "Maharashtra"},
        "expected_gdb_key": "scheme_pm_fasal_bima_yojana",
        "expected_entities": ["Pradhan Mantri Fasal Bima Yojana", "PMFBY"],
        "expected_contains": ["insurance", "premium"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SCHEME-003",
        "domain": "scheme",
        "english_query": "Is there any subsidy for drip irrigation in Karnataka? I want to install one on my areca farm.",
        "location": {"city": "Shivamogga", "state": "Karnataka"},
        "expected_gdb_key": "scheme_drip_irrigation_subsidy_karnataka",
        "expected_entities": ["drip irrigation", "areca"],
        "expected_contains": ["subsidy"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SCHEME-004",
        "domain": "scheme",
        "english_query": "I am a small farmer in Punjab. Can I get a Kisan Credit Card? What is the interest rate?",
        "location": {"city": "Amritsar", "state": "Punjab"},
        "expected_gdb_key": "scheme_kisan_credit_card_kcc",
        "expected_entities": ["Kisan Credit Card", "KCC"],
        "expected_contains": ["interest", "loan"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SCHEME-005",
        "domain": "scheme",
        "english_query": "Tell me about eNAM — the online market for selling tomatoes from my farm in Kolar.",
        "location": {"city": "Kolar", "state": "Karnataka"},
        "expected_gdb_key": "scheme_enam_online_market",
        "expected_entities": ["eNAM"],
        "expected_contains": ["tomato", "online"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SCHEME-006",
        "domain": "scheme",
        "english_query": "What is the Soil Health Card scheme and how often should I get my soil tested?",
        "location": {"city": "Coimbatore", "state": "Tamil Nadu"},
        "expected_gdb_key": "scheme_soil_health_card",
        "expected_entities": ["Soil Health Card"],
        "expected_contains": ["soil", "test"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    # ────────────────────────── 4. SOIL (6) ───────────────────────────
    {
        "id": "SOIL-001",
        "domain": "soil",
        "english_query": "What type of fertilizer should I use for paddy in Thanjavur? My soil is clayey.",
        "location": {"city": "Thanjavur", "state": "Tamil Nadu"},
        "expected_gdb_key": "soil_fertilizer_paddy_clayey",
        "expected_entities": ["paddy", "urea", "DAP"],
        "expected_contains": ["fertilizer", "clay"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SOIL-002",
        "domain": "soil",
        "english_query": "My soil is alkaline in Sirsa. Which crops can I grow and how to amend the soil?",
        "location": {"city": "Sirsa", "state": "Haryana"},
        "expected_gdb_key": "soil_alkaline_amendment_crops",
        "expected_entities": ["gypsum"],
        "expected_contains": ["alkaline", "gypsum"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SOIL-003",
        "domain": "soil",
        "english_query": "How do I improve nitrogen in the soil for sugarcane in Kolhapur?",
        "location": {"city": "Kolhapur", "state": "Maharashtra"},
        "expected_gdb_key": "soil_nitrogen_sugarcane",
        "expected_entities": ["sugarcane", "nitrogen"],
        "expected_contains": ["nitrogen", "urea"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SOIL-004",
        "domain": "soil",
        "english_query": "Sandy soil in Anantapur. What drip-friendly crops can I grow with low water?",
        "location": {"city": "Anantapur", "state": "Andhra Pradesh"},
        "expected_gdb_key": "soil_sandy_low_water_crops",
        "expected_entities": ["drip"],
        "expected_contains": ["sandy", "water"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SOIL-005",
        "domain": "soil",
        "english_query": "My black cotton soil in Vidarbha cracks in summer. Is it good for soybean?",
        "location": {"city": "Nagpur", "state": "Maharashtra"},
        "expected_gdb_key": "soil_black_cotton_vidarbha",
        "expected_entities": ["soybean"],
        "expected_contains": ["black soil", "soybean"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "SOIL-006",
        "domain": "soil",
        "english_query": "How should I prepare red soil for groundnut in Karnataka's Chitradurga?",
        "location": {"city": "Chitradurga", "state": "Karnataka"},
        "expected_gdb_key": "soil_red_groundnut_chitradurga",
        "expected_entities": ["groundnut"],
        "expected_contains": ["red soil", "groundnut"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    # ────────────────────────── 5. MARKET (6) ─────────────────────────
    {
        "id": "MARKET-001",
        "domain": "market",
        "english_query": "What is the current price of wheat in Sirsa mandi? Should I sell or store?",
        "location": {"city": "Sirsa", "state": "Haryana"},
        "expected_gdb_key": "market_price_wheat_sirsa",
        "expected_entities": ["wheat"],
        "expected_contains": ["mandi", "price"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "MARKET-002",
        "domain": "market",
        "english_query": "Today's tomato price in Kolar mandi and demand trend.",
        "location": {"city": "Kolar", "state": "Karnataka"},
        "expected_gdb_key": "market_price_tomato_kolar",
        "expected_entities": ["tomato"],
        "expected_contains": ["mandi", "tomato"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "MARKET-003",
        "domain": "market",
        "english_query": "What is the cotton price in Warangal market? When is the best time to sell?",
        "location": {"city": "Warangal", "state": "Telangana"},
        "expected_gdb_key": "market_price_cotton_warangal",
        "expected_entities": ["cotton"],
        "expected_contains": ["price"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "MARKET-004",
        "domain": "market",
        "english_query": "Current paddy price in Karnal mandi, Haryana. Is MSP available?",
        "location": {"city": "Karnal", "state": "Haryana"},
        "expected_gdb_key": "market_price_paddy_karnal_msp",
        "expected_entities": ["paddy", "MSP"],
        "expected_contains": ["mandi", "price"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "MARKET-005",
        "domain": "market",
        "english_query": "What is the turmeric price in Erode mandi? Should I wait for a better rate?",
        "location": {"city": "Erode", "state": "Tamil Nadu"},
        "expected_gdb_key": "market_price_turmeric_erode",
        "expected_entities": ["turmeric"],
        "expected_contains": ["mandi", "price"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
    {
        "id": "MARKET-006",
        "domain": "market",
        "english_query": "Mustard price today in Jaipur mandi. Are prices expected to rise next month?",
        "location": {"city": "Jaipur", "state": "Rajasthan"},
        "expected_gdb_key": "market_price_mustard_jaipur",
        "expected_entities": ["mustard"],
        "expected_contains": ["mandi", "price"],
        "expected_not_contains": [],
        "expected_disclaimer_present": True,
    },
]


# Stable, ordered list of supported agricultural domains.
DOMAINS: List[str] = ["weather", "pest", "scheme", "soil", "market"]


def get_scenarios_by_domain(domain: str) -> List[Dict]:
    """Return all scenarios belonging to a specific domain."""
    return [s for s in FARMING_SCENARIOS if s["domain"] == domain]


def get_scenario_count() -> int:
    """Return the total number of canonical scenarios (should be 30)."""
    return len(FARMING_SCENARIOS)


__all__ = ["FARMING_SCENARIOS", "DOMAINS", "get_scenarios_by_domain", "get_scenario_count"]
