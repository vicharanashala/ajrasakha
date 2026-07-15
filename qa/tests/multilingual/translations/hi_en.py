"""English translations of the 30 canonical farming scenarios.

These are the canonical reference texts against which all other
language versions are aligned.  They are intentionally written in
colloquial farmer English (sentence fragments, location-first phrasing)
rather than textbook prose.

Structure:  ``ENGLISH_TRANSLATIONS[scenario_id] -> str``
"""
from __future__ import annotations

from typing import Dict

ENGLISH_TRANSLATIONS: Dict[str, str] = {
    "WEATHER-001": "Will it rain in the next 3 days in Ropar, Punjab? Should I delay sowing of wheat?",
    "WEATHER-002": "What is the maximum temperature expected in Hisar, Haryana this week? My mustard crop is drying.",
    "WEATHER-003": "Is there a cyclone warning for coastal Tamil Nadu? I grow rice in Thanjavur.",
    "WEATHER-004": "Humidity is very high in Bengaluru. Will there be fog tomorrow morning? Tomato plants are flowering.",
    "WEATHER-005": "Heavy rain forecast in Warangal, Telangana for cotton. Should I drain the field today?",
    "WEATHER-006": "Will there be frost in Ludhiana tomorrow night? My potato crop is at risk.",
    "PEST-001": "Pink bollworm is attacking my cotton in Sirsa. What pesticide should I spray and at what dose?",
    "PEST-002": "Aphids on my mustard crop in Bharatpur. Suggest an organic and a chemical control.",
    "PEST-003": "Yellow rust has appeared on my wheat in Jalandhar. What fungicide works best right now?",
    "PEST-004": "Stem borer damage in my rice paddy in Thanjavur. Need urgent control advice.",
    "PEST-005": "Whitefly is sucking sap from my tomato plants in Kolar. Which insecticide is safest?",
    "PEST-006": "Fall armyworm has been spotted on maize in Karimnagar. How do I stop it spreading?",
    "SCHEME-001": "Tell me about the PM-Kisan Samman Nidhi scheme. Who is eligible and how do I apply?",
    "SCHEME-002": "What is the Pradhan Mantri Fasal Bima Yojana (PMFBY) and how does it help with crop insurance?",
    "SCHEME-003": "Is there any subsidy for drip irrigation in Karnataka? I want to install one on my areca farm.",
    "SCHEME-004": "I am a small farmer in Punjab. Can I get a Kisan Credit Card? What is the interest rate?",
    "SCHEME-005": "Tell me about eNAM — the online market for selling tomatoes from my farm in Kolar.",
    "SCHEME-006": "What is the Soil Health Card scheme and how often should I get my soil tested?",
    "SOIL-001": "What type of fertilizer should I use for paddy in Thanjavur? My soil is clayey.",
    "SOIL-002": "My soil is alkaline in Sirsa. Which crops can I grow and how to amend the soil?",
    "SOIL-003": "How do I improve nitrogen in the soil for sugarcane in Kolhapur?",
    "SOIL-004": "Sandy soil in Anantapur. What drip-friendly crops can I grow with low water?",
    "SOIL-005": "My black cotton soil in Vidarbha cracks in summer. Is it good for soybean?",
    "SOIL-006": "How should I prepare red soil for groundnut in Karnataka's Chitradurga?",
    "MARKET-001": "What is the current price of wheat in Sirsa mandi? Should I sell or store?",
    "MARKET-002": "Today's tomato price in Kolar mandi and demand trend.",
    "MARKET-003": "What is the cotton price in Warangal market? When is the best time to sell?",
    "MARKET-004": "Current paddy price in Karnal mandi, Haryana. Is MSP available?",
    "MARKET-005": "What is the turmeric price in Erode mandi? Should I wait for a better rate?",
    "MARKET-006": "Mustard price today in Jaipur mandi. Are prices expected to rise next month?",
}

__all__ = ["ENGLISH_TRANSLATIONS"]


# Map: every English scenario text — kept imported from the canonical
# list so the translation file is the single source of truth.
from qa.tests.multilingual.scenarios.farming_scenarios import FARMING_SCENARIOS

assert len(ENGLISH_TRANSLATIONS) == len(FARMING_SCENARIOS) == 30, (
    "English translation table must contain exactly 30 entries, "
    f"got {len(ENGLISH_TRANSLATIONS)} translations for {len(FARMING_SCENARIOS)} scenarios."
)
assert set(ENGLISH_TRANSLATIONS.keys()) == {s["id"] for s in FARMING_SCENARIOS}, (
    "ENGLISH_TRANSLATIONS keys must equal scenario IDs."
)
