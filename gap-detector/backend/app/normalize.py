"""Normalisation of the messy seed vocabularies into one internal vocabulary.

Handles the data quirks found in the hackathon cluster:
  * language names ("Hindi") vs ISO codes ("hi")
  * "Telegram" / "Unknown" / "" recorded as a state -> None
  * three domain taxonomies (feedback "Pest Control", gap_detector "Pest",
    reviewer "Plant Protection") -> one canonical set
  * no crop field on disclaimer logs -> keyword extraction from the query text
  * farmer identifiers -> short salted hash (never stored raw)
"""

from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime
from typing import Any

# --------------------------------------------------------------------------- #
# Languages
# --------------------------------------------------------------------------- #

LANGUAGE_CODES: dict[str, str] = {
    "English": "en",
    "Hindi": "hi",
    "Kannada": "kn",
    "Marathi": "mr",
    "Tamil": "ta",
    "Telugu": "te",
    "Gujarati": "gu",
    "Punjabi": "pa",
    "Bengali": "bn",
    "Malayalam": "ml",
    "Odia": "or",
    "Assamese": "as",
    "Urdu": "ur",
    "Nepali": "ne",
    "Konkani": "kok",
    "Maithili": "mai",
    "Sanskrit": "sa",
    "Sindhi": "sd",
    "Kashmiri": "ks",
    "Dogri": "doi",
    "Manipuri": "mni",
    "Bodo": "brx",
    "Santali": "sat",
}
_CODE_TO_LANGUAGE = {code: name for name, code in LANGUAGE_CODES.items()}
_LANGUAGE_ALIASES = {"oriya": "Odia", "panjabi": "Punjabi", "bangla": "Bengali"}


def normalize_language(value: Any) -> tuple[str | None, str | None]:
    """Return ``(full_name, iso_code)`` for a language name or code; ``(None, None)`` if empty."""
    if not value or not isinstance(value, str):
        return None, None
    v = value.strip()
    if not v:
        return None, None
    low = v.lower()
    if low in _CODE_TO_LANGUAGE:
        return _CODE_TO_LANGUAGE[low], low
    if low in _LANGUAGE_ALIASES:
        name = _LANGUAGE_ALIASES[low]
        return name, LANGUAGE_CODES[name]
    for name, code in LANGUAGE_CODES.items():
        if name.lower() == low:
            return name, code
    return v.title(), None  # unknown but non-empty: keep the label, no code


# --------------------------------------------------------------------------- #
# States (canonical list = reviewer system's metaData.ts STATES)
# --------------------------------------------------------------------------- #

STATES: list[str] = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi (National Capital Territory)", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Punjab", "Puducherry", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
]  # fmt: skip
_STATE_LOOKUP = {s.lower(): s for s in STATES}
_STATE_ALIASES = {
    "delhi": "Delhi (National Capital Territory)",
    "new delhi": "Delhi (National Capital Territory)",
    "orissa": "Odisha",
    "pondicherry": "Puducherry",
    "uttaranchal": "Uttarakhand",
    "tamilnadu": "Tamil Nadu",
    "chattisgarh": "Chhattisgarh",
    "j&k": "Jammu and Kashmir",
    "up": "Uttar Pradesh",
    "mp": "Madhya Pradesh",
}
# Values that are channels / placeholders rather than states.
_NOT_A_STATE = {"telegram", "whatsapp", "web", "chat", "unknown", "none", "null", "n/a", "na",
                "-", "test"}  # fmt: skip


def normalize_state(value: Any) -> str | None:
    if not value or not isinstance(value, str):
        return None
    low = re.sub(r"\s+", " ", value.strip()).lower()
    if not low or low in _NOT_A_STATE:
        return None
    if low in _STATE_LOOKUP:
        return _STATE_LOOKUP[low]
    if low in _STATE_ALIASES:
        return _STATE_ALIASES[low]
    return None  # unrecognised -> unknown rather than polluting the heatmap


# --------------------------------------------------------------------------- #
# Domains - three taxonomies -> canonical (feedback taxonomy, most readable)
# --------------------------------------------------------------------------- #

CANONICAL_DOMAINS: list[str] = [
    "Pest Control",
    "Crop Disease",
    "Irrigation",
    "Soil Health",
    "Fertilizers",
    "Seeds",
    "Weather",
    "Harvesting",
    "Organic Farming",
    "Protected Cultivation",
    "Crop Selection",
    "General Agriculture",
    "General",
    # Not an agricultural subject. Kept distinct so the gap report can exclude it
    # instead of counting "how do I earn money fast" as missing GDB coverage.
    "Off-topic",
]

DOMAIN_MAP: dict[str, str] = {
    # feedback / disclaimer taxonomy (already canonical)
    **{d.lower(): d for d in CANONICAL_DOMAINS},
    "off-topic": "Off-topic",
    "chat": "Off-topic",
    "greeting": "Off-topic",
    "non_agri": "Off-topic",
    "non-agriculture": "Off-topic",
    # gdb_gap_detector taxonomy
    "pest": "Pest Control",
    "disease": "Crop Disease",
    "fertilizer": "Fertilizers",
    "cultivation": "General Agriculture",
    # hackathon.farmer_feedbacks
    "crop management": "General Agriculture",
    "nutrient management": "Fertilizers",
    # reviewer system (desk.vicharanashala.ai) function labels
    "plant protection": "Pest Control",
    "insect management": "Pest Control",
    "integrated pest management": "Pest Control",
    "weed management": "Pest Control",
    "pathogenic disease management": "Crop Disease",
    "nutrient deficiency/excessiveness management": "Fertilizers",
    "water management": "Irrigation",
    "irrigation management": "Irrigation",
    "soil testing": "Soil Health",
    "soil health card": "Soil Health",
    "problem of soil": "Soil Health",
    "seed sowing and treatment": "Seeds",
    "varietal selection": "Seeds",
    "varieties": "Seeds",
    "sowing time and weather": "Weather",
    "harvesting management": "Harvesting",
    "post harvest management - abiotic": "Harvesting",
    "post harvest management - biotic": "Harvesting",
    "storage": "Harvesting",
    "plasticulture": "Protected Cultivation",
    "nursery management": "Protected Cultivation",
    "crop production": "General Agriculture",
    "horticulture": "General Agriculture",
    "field preparation": "General Agriculture",
    "farm tools & mechanisation": "General Agriculture",
    "agronomy": "General Agriculture",
    "cultural practices": "General Agriculture",
}


def normalize_domain(value: Any) -> str | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if not value or not isinstance(value, str):
        return None
    low = re.sub(r"\s+", " ", value.strip()).lower()
    if not low:
        return None
    if low in DOMAIN_MAP:
        return DOMAIN_MAP[low]
    # loose keyword fallback for labels not in the table
    if "harvest" in low or "storage" in low:
        return "Harvesting"
    if "pest" in low or "insect" in low or "weed" in low:
        return "Pest Control"
    if "disease" in low or "pathogen" in low:
        return "Crop Disease"
    if "irrigat" in low or "water" in low:
        return "Irrigation"
    if "soil" in low:
        return "Soil Health"
    if "nutrient" in low or "fertili" in low or "manure" in low:
        return "Fertilizers"
    if "seed" in low or "variet" in low:
        return "Seeds"
    if "weather" in low or "climate" in low:
        return "Weather"
    if "organic" in low:
        return "Organic Farming"
    return "General Agriculture"


# --------------------------------------------------------------------------- #
# Crop extraction from free text
# --------------------------------------------------------------------------- #

# canonical crop -> aliases (lower-case, matched on word boundaries). Includes common
# Hindi transliterations because raw_queries has Hindi-language questions.
CROP_ALIASES: dict[str, list[str]] = {
    "Rice": ["rice", "paddy", "dhan", "chawal"],
    "Wheat": ["wheat", "gehu", "gehun"],
    "Maize": ["maize", "corn", "makka", "makki"],
    "Cotton": ["cotton", "kapas"],
    "Sugarcane": ["sugarcane", "sugar cane", "ganna"],
    "Potato": ["potato", "potatoes", "aloo", "alu"],
    "Tomato": ["tomato", "tomatoes", "tamatar"],
    "Onion": ["onion", "onions", "pyaz", "pyaaz"],
    "Chilli": ["chilli", "chili", "chillies", "mirch"],
    "Brinjal": ["brinjal", "eggplant", "baingan"],
    "Okra": ["okra", "bhindi", "lady finger", "ladies finger"],
    "Cucumber": ["cucumber", "kheera"],
    "Mustard": ["mustard", "sarson", "rapeseed"],
    "Groundnut": ["groundnut", "peanut", "moongphali"],
    "Soybean": ["soybean", "soyabean", "soya"],
    "Sunflower": ["sunflower"],
    "Chickpea": ["chickpea", "chana", "bengal gram"],
    "Pigeon Pea": ["pigeon pea", "arhar", "tur", "toor", "red gram"],
    "Green Gram": ["green gram", "moong", "mung"],
    "Black Gram": ["black gram", "urad"],
    "Lentil": ["lentil", "masoor"],
    "Mango": ["mango", "mangoes", "aam"],
    "Banana": ["banana", "bananas", "kela"],
    "Grapes": ["grape", "grapes", "angoor"],
    "Pomegranate": ["pomegranate", "anar"],
    "Papaya": ["papaya"],
    "Guava": ["guava", "amrud"],
    "Citrus": ["citrus", "orange", "lemon", "lime", "mosambi", "kinnow"],
    "Apple": ["apple", "apples"],
    "Coconut": ["coconut", "nariyal"],
    "Arecanut": ["arecanut", "areca", "supari"],
    "Cashew": ["cashew"],
    "Coffee": ["coffee"],
    "Tea": ["tea"],
    "Turmeric": ["turmeric", "haldi"],
    "Ginger": ["ginger", "adrak"],
    "Garlic": ["garlic", "lahsun"],
    "Cardamom": ["cardamom", "elaichi"],
    "Black Pepper": ["black pepper"],
    "Cabbage": ["cabbage"],
    "Cauliflower": ["cauliflower", "gobi"],
    "Capsicum": ["capsicum", "bell pepper"],
    "Pea": ["peas", "matar"],
    "Carrot": ["carrot"],
    "Spinach": ["spinach", "palak"],
    "Pumpkin": ["pumpkin"],
    "Bottle Gourd": ["bottle gourd", "lauki"],
    "Bitter Gourd": ["bitter gourd", "karela"],
    "Watermelon": ["watermelon", "water melon"],
    "Muskmelon": ["muskmelon", "musk melon"],
    "Sorghum": ["sorghum", "jowar"],
    "Pearl Millet": ["pearl millet", "bajra"],
    "Finger Millet": ["finger millet", "ragi"],
    "Barley": ["barley", "jau"],
    "Sesame": ["sesame", "til"],
    "Castor": ["castor"],
    "Jute": ["jute"],
    "Tobacco": ["tobacco"],
    "Rubber": ["rubber"],
    "Mushroom": ["mushroom", "mushrooms"],
    "Marigold": ["marigold"],
    "Rose": ["roses"],
    "Strawberry": ["strawberry", "strawberries"],
    "Drumstick": ["drumstick", "moringa"],
    "Fodder": ["fodder", "napier", "berseem", "lucerne"],
}
# Longest alias first so "bottle gourd" wins over "gourd"-like partials.
_CROP_PATTERNS: list[tuple[str, re.Pattern[str]]] = sorted(
    (
        (crop, re.compile(rf"\b{re.escape(alias)}\b", re.IGNORECASE))
        for crop, aliases in CROP_ALIASES.items()
        for alias in aliases
    ),
    key=lambda p: -len(p[1].pattern),
)


def extract_crop(text: str | None) -> str | None:
    """First crop mentioned in ``text`` (earliest position; longest alias wins ties), or None."""
    if not text:
        return None
    best: tuple[int, str] | None = None
    for crop, pat in _CROP_PATTERNS:
        m = pat.search(text)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), crop)
    return best[1] if best else None


def normalize_crop(value: Any) -> str | None:
    """Map an explicit crop field (e.g. raw_queries.crop) to the canonical crop name."""
    if not value or not isinstance(value, str):
        return None
    low = value.strip().lower()
    if not low or low in {"unknown", "general", "none", "na", "all"}:
        return None
    for crop, aliases in CROP_ALIASES.items():
        if low == crop.lower() or low in aliases:
            return crop
    return value.strip().title()


# --------------------------------------------------------------------------- #
# Misc helpers
# --------------------------------------------------------------------------- #


def normalize_text(text: str | None) -> str:
    """Lower-case, collapse whitespace, strip punctuation - used for dedupe keys."""
    if not text:
        return ""
    t = re.sub(r"[^\w\s]", " ", text.lower(), flags=re.UNICODE)
    return re.sub(r"\s+", " ", t).strip()


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, str):
        v = value.strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(v)
        except ValueError:
            return None
        return dt.replace(tzinfo=None) if dt.tzinfo else dt
    return None


def farmer_key(identifier: Any) -> str | None:
    """Short salted hash of a farmer id / phone. Stable within a deployment, never reversible."""
    if identifier is None:
        return None
    s = str(identifier).strip()
    if not s:
        return None
    salt = os.environ.get("FARMER_KEY_SALT", "ace-insights")
    return hashlib.sha256(f"{salt}:{s}".encode()).hexdigest()[:16]
