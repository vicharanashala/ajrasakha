"""Language metadata for the AjraSakha multilingual testing suite.

This is the single source of truth for:

* the 6 supported query languages  (Hindi, English, Kannada, Tamil,
  Punjabi, Telugu) — those that are required for Project 4 and
  already covered by ACE's locale map;
* the Unicode script ranges used to *cheaply but reliably* identify
  which script a response was rendered in (Devanagari for Hindi,
  Gurmukhi for Punjabi, Kannada, Tamil, Telugu, plus Latin for
  English);
* the canonical 2-hour "advice age" disclaimer that AjraSakha appends
  to every reply, plus an English keyword set that lets a lightweight
  regex detect the disclaimer in the English reference version.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

# -- Canonical language ordering used by the Language Quality Matrix.
SUPPORTED_LANGUAGES: Tuple[str, ...] = (
    "hindi",
    "english",
    "kannada",
    "tamil",
    "punjabi",
    "telugu",
)

# Friendly ISO-ish code used in file / column names.
LANGUAGE_LABELS: Dict[str, str] = {
    "hindi":   "hi",
    "english": "en",
    "kannada": "kn",
    "tamil":   "ta",
    "punjabi": "pa",
    "telugu":  "te",
}

# Display name for human-readable reports.
LANGUAGE_DISPLAY: Dict[str, str] = {
    "hindi":   "Hindi",
    "english": "English",
    "kannada": "Kannada",
    "tamil":   "Tamil",
    "punjabi": "Punjabi",
    "telugu":  "Telugu",
}

# Native script name.
LANGUAGE_NATIVE: Dict[str, str] = {
    "hindi":   "हिन्दी",
    "english": "English",
    "kannada": "ಕನ್ನಡ",
    "tamil":   "தமிழ்",
    "punjabi": "ਪੰਜਾਬੀ",
    "telugu":  "తెలుగు",
}

# -- Unicode ranges (inclusive) used for script sniffing of response text.
SCRIPT_RANGES: Dict[str, List[Tuple[int, int]]] = {
    "hindi":   [(0x0900, 0x097F)],   # Devanagari
    "punjabi": [(0x0A00, 0x0A7F)],   # Gurmukhi
    "kannada": [(0x0C80, 0x0CFF)],   # Kannada
    "tamil":   [(0x0B80, 0x0BFF)],   # Tamil
    "telugu":  [(0x0C00, 0x0C7F)],   # Telugu
    "english": [(0x0041, 0x005A), (0x0061, 0x007A)],  # Basic Latin letters
}

# Canonical 2-hour advice-age disclaimer text.
# These values are the strings asserted against the AjraSakha response
# surface.  Localizations are placeholders for the v0.1 suite; replace
# with values from the i18n catalog once the AI team publishes them.
DISCLAIMER_TEXT: Dict[str, str] = {
    "english": "This advice may be up to 2 hours old. Please verify before acting on it.",
    "hindi":   "यह सलाह 2 घंटे पुरानी हो सकती है। कृपया कार्य करने से पहले सत्यापित कर लें।",
    "kannada": "ಈ ಸಲಹೆ 2 ಗಂಟೆಗಳಷ್ಟು ಹಳೆಯದಾಗಿರಬಹುದು. ದಯವಿಟ್ಟು ಕ್ರಿಯಾ ಯೋಜನೆಯ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.",
    "tamil":   "இந்த ஆலோசனை 2 மணி நேரம் பழமையானதாக இருக்கலாம். செயல்படுவதற்கு முன் சரிபார்க்கவும்.",
    "punjabi": "ਇਹ ਸਲਾਹ 2 ਘੰਟੇ ਪੁਰਾਣੀ ਹੋ ਸਕਦੀ ਹੈ। ਕਾਰਵਾਈ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਜਾਂਚ ਲਓ।",
    "telugu":  "ఈ సలహా 2 గంటల పాతది కావచ్చు. దయచేసి చర్య తీసుకోవడానికి ముందు ధృవీకరించండి.",
}

# English keywords that *must* appear in the localized disclaimer for
# a low-tech string match (independent of script detection).
DISCLAIMER_KEYWORDS_EN: List[str] = ["advice", "2 hours", "verify"]


def script_label_for(language: str) -> str:
    """Return the script label for a language — e.g. ``"Devanagari"``."""
    return {
        "hindi":   "Devanagari",
        "english": "Latin",
        "kannada": "Kannada",
        "tamil":   "Tamil",
        "punjabi": "Gurmukhi",
        "telugu":  "Telugu",
    }.get(language, "Unknown")


__all__ = [
    "SUPPORTED_LANGUAGES",
    "LANGUAGE_LABELS",
    "LANGUAGE_DISPLAY",
    "LANGUAGE_NATIVE",
    "SCRIPT_RANGES",
    "DISCLAIMER_TEXT",
    "DISCLAIMER_KEYWORDS_EN",
    "script_label_for",
]
