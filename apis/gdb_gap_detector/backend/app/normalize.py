"""Normalisation of crop / state / domain values and rule-based question intent."""
from __future__ import annotations

import re

CROP_ALIASES = {
    "paddy": "Rice", "rice": "Rice", "dhan": "Rice",
    "wheat": "Wheat", "gehu": "Wheat", "gehun": "Wheat",
    "maize": "Maize", "corn": "Maize", "makka": "Maize",
    "cotton": "Cotton", "kapas": "Cotton",
    "sugarcane": "Sugarcane", "ganna": "Sugarcane",
    "tomato": "Tomato", "tamatar": "Tomato",
    "potato": "Potato", "aloo": "Potato",
    "onion": "Onion", "pyaz": "Onion",
    "chilli": "Chilli", "chili": "Chilli", "mirch": "Chilli",
    "soybean": "Soybean", "soyabean": "Soybean",
    "groundnut": "Groundnut", "peanut": "Groundnut",
    "mustard": "Mustard", "sarson": "Mustard",
    "banana": "Banana", "mango": "Mango", "grapes": "Grapes", "grape": "Grapes",
}

STATE_ALIASES = {
    "up": "Uttar Pradesh", "uttar pradesh": "Uttar Pradesh",
    "mp": "Madhya Pradesh", "madhya pradesh": "Madhya Pradesh",
    "tn": "Tamil Nadu", "tamil nadu": "Tamil Nadu", "tamilnadu": "Tamil Nadu",
    "ap": "Andhra Pradesh", "andhra pradesh": "Andhra Pradesh",
    "orissa": "Odisha", "odisha": "Odisha",
    "maharastra": "Maharashtra", "maharashtra": "Maharashtra",
}

UNKNOWN = "Unknown"

# Intent = what the farmer wants to know. Ordered: first match wins.
INTENT_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Pest & disease control", ("pest", "insect", "disease", "blight", "rust", "wilt", "worm", "borer", "aphid",
                                 "whitefly", "fungus", "fungal", "spray", "infest", "virus", "rot", "mite", "keet", "rog")),
    ("Fertilizer & nutrition", ("fertili", "urea", "dap", "npk", "manure", "nutrient", "deficien", "potash", "compost", "khad")),
    ("Irrigation & water", ("irrigat", "water", "drip", "sprinkler", "drought", "flood", "waterlog", "sinchai")),
    ("Variety & seed", ("variety", "varieties", "seed", "hybrid", "cultivar", "certified", "beej")),
    ("Sowing & cultivation practice", ("sow", "plant", "transplant", "spacing", "nursery", "harvest", "prun", "weed", "yield", "tillage", "bua")),
    ("Market & price", ("price", "mandi", "market", "msp", "sell", "rate", "bhav")),
    ("Schemes & subsidy", ("scheme", "subsidy", "loan", "insurance", "pm-kisan", "kisan credit", "yojana", "pmfby")),
    ("Weather & climate", ("weather", "rain", "temperature", "frost", "heat", "hail", "forecast", "mausam")),
    ("Post-harvest & storage", ("storage", "store", "post harvest", "post-harvest", "shelf life", "processing", "grading")),
]
OTHER_INTENT = "General advisory"


def _clean(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def norm_crop(raw) -> str:
    if isinstance(raw, dict):  # ICropRef-style object
        raw = raw.get("name") or raw.get("crop") or ""
    s = _clean(raw)
    if not s:
        return UNKNOWN
    return CROP_ALIASES.get(s.lower(), s.title())


def norm_state(raw) -> str:
    s = _clean(raw)
    if not s:
        return UNKNOWN
    return STATE_ALIASES.get(s.lower(), s.title())


def norm_domain(raw) -> str:
    """`details.domain` is a list in the reviewer app; the primary (first) domain is used."""
    if isinstance(raw, (list, tuple)):
        raw = raw[0] if raw else ""
    s = _clean(raw)
    return s.title() if s else UNKNOWN


def classify_intent(text: str) -> str:
    t = (text or "").lower()
    for label, keys in INTENT_RULES:
        if any(k in t for k in keys):
            return label
    return OTHER_INTENT


EXTRA_CROPS = ["brinjal", "cabbage", "cauliflower", "okra", "garlic", "ginger", "turmeric", "pomegranate", "apple",
               "tea", "coffee", "rubber", "bajra", "jowar", "sorghum", "ragi", "chickpea", "gram", "pigeon pea", "tur",
               "lentil", "pea", "cucumber", "papaya", "guava", "orange", "lemon", "coconut", "arecanut", "jute", "sunflower",
               "sesame", "barley", "capsicum", "carrot", "radish", "watermelon", "strawberry", "tulsi"]
_CROP_RE = re.compile(r"\b(" + "|".join(sorted([re.escape(k) for k in list(CROP_ALIASES) + EXTRA_CROPS], key=len, reverse=True)) + r")s?\b")


def infer_crop(text: str) -> str:
    """Best-effort crop from free text, for sources that carry no crop field."""
    m = _CROP_RE.search((text or "").lower())
    return norm_crop(m.group(1)) if m else UNKNOWN
