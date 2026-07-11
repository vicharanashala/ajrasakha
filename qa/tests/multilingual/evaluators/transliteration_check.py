"""Transliteration evaluator.

When AjraSakha translates a query from, say, Tamil to its internal
English pipeline, *named entities* (crop names, scheme names,
pesticide names, locations) must come back to the farmer in a form
they recognise.  This evaluator checks three categories:

* **crop**    — must appear in the canonical English/Hindi name *or*
  a well-known regional variant transliterated into the response
  script (e.g. "கோதுமை" for wheat in Tamil);
* **scheme**  — PMFBY / PM-Kisan / eNAM / Soil Health Card must
  survive translation unchanged (English abbreviations are widely
  accepted across Indian languages);
* **pesticide / disease** — the technical name must remain
  recognisable, either in English (e.g. "imidacloprid") or its
  regional-script transliteration (e.g. "इमिडाक्लोप्रिड").

For each entity we check three things, in order:

1. exact substring match (case-insensitive);
2. canonical-script match (e.g. "गेहूं" vs "गेहूँ");
3. ASCII-folded match (e.g. "gehu", "gehun" for "गेहूं").

The score is ``matched / total``; pass mark is 1.0 (every entity
recognised).
"""
from __future__ import annotations

from typing import Dict, List

# Canonical cross-language variants the suite accepts as "recognised".
# Keys are the *concept*, values are the accepted spellings (in any
# supported script or Latin transliteration).
CANONICAL_VARIANTS: Dict[str, List[str]] = {
    "wheat":      ["wheat", "gehu", "gehun", "गेहूं", "गेहूँ", "ਕਣਕ",
                   "கோதுமை", "ಗೋಧಿ", "గోధుమ"],
    "rice":       ["rice", "dhaan", "धान", "ਝੋਨਾ", "நெல்", "ಭತ್ತ", "వరి"],
    "mustard":    ["mustard", "sarson", "sarso", "सरसों", "ਸਰ੍ਹੋਂ",
                   "கடுகு", "ಸಾಸಿವೆ", "ఆవాల"],
    "cotton":     ["cotton", "kapas", "कपास", "ਕਪਾਹ", "பருத்தி",
                   "ಹತ್ತಿ", "పత్తి"],
    "tomato":     ["tomato", "tamatar", "टमाटर", "ਟਮਾਟਰ", "தக்காளி",
                   "ಟೊಮೆಟೊ", "టమాట"],
    "maize":      ["maize", "corn", "makkhan", "मक्का", "ਮੱਕੀ",
                   "மக்காச்சோள", "ಮೆಕ್ಕೆಜೋಳ", "మొక్కజొన్న"],
    "wheat_rust": ["yellow rust", "peela ratua", "पीला रतुआ",
                   "ਪੀਲਾ ਰੁੱਜ", "மஞ்சள் துரு", "ಹಳದಿ ತುಕ್ಕು",
                   "పసుపు తుప్పు"],
    "pink_bollworm": ["pink bollworm", "gulabi sundhi",
                      "गुलाबी सूंडी", "ਗੁਲਾਬੀ ਸੂੰਡੀ",
                      "இளஞ்சிவப்பு கூன்வண்டு",
                      "ಗುಲಾಬಿ ಕೀಟ", "గులాబీ రంగు పురుగు"],
    "aphid":      ["aphid", "mahu", "माहूँ", "ਮਾਹੂ",
                   "அஃபிட்", "ಎಲೆ ಹೇನು", "అఫిడ్"],
    "stem_borer": ["stem borer", "tana chhedak", "तना छेदक",
                   "ਤਨਾ ਛੇਦਕ", "தண்டு துளைப்பான்",
                   "ಕಾಂಡ ಕೊರಕ", "కాండం తొలిచే పురుగు"],
    "whitefly":   ["whitefly", "safed makkhi", "सफ़ेद मक्खी",
                   "ਸਫ਼ੇਦ ਮੱਖੀ", "வெள்ளை ஈ", "ಬಿಳಿ ನೊಣ",
                   "తెల్ల దోమ"],
    "fall_armyworm": ["fall armyworm", "फॉल आर्मीवर्",
                      "ਫਾਲ ਆਰਮੀਵਰਮ", "படைப்புழு",
                      "ಫಾಲ್ ಆರ್ಮಿವರ್ಮ್", "ఫాల్ ఆర్మీవర్మ్"],
    "pm_kisan":   ["pm-kisan", "pmkisan", "पीएम-किसान",
                   "ਪੀਐੱਮ-ਕਿਸਾਨ", "பிஎம்-கிசான்",
                   "ಪಿಎಂ-ಕಿಸಾನ್", "పీఎం-కిసాన్"],
    "pmfby":      ["pmfby", "फसल बीमा", "ਫ਼ਸਲ ਬੀਮਾ", "பசல் பீமா",
                   "ಫಸಲ್ ಬೀಮಾ", "ఫసల్ బీమా"],
    "enam":       ["enam", "ई-नाम", "eNAM"],
    "soil_health_card": ["soil health card", "मृदा स्वास्थ्य",
                         "ਮਿੱਟੀ ਸਿਹਤ", "மண் ஆரோக்கிய",
                         "ಮಣ್ಣು ಆರೋಗ್ಯ", "మట్టి ఆరోగ్య"],
    "kcc":        ["kcc", "kisan credit card", "किसान क्रेडिट",
                   "ਕਿਸਾਨ ਕ੍ਰੈਡਿਟ", "கிசான் கடன்",
                   "ಕಿಸಾನ್ ಕ್ರೆಡಿಟ್", "కిసాన్ క్రెడిట్"],
    "msp":        ["msp", "minimum support price"],
    "drip":       ["drip", "ड्रिप", "ਡ੍ਰਿੱਪ", "சொட்டு",
                   "ಡ್ರಿಪ್", "డ్రిప్"],
    "groundnut":  ["groundnut", "moongphali", "मूंगफली", "ਮੂੰਗਫ਼ਲੀ",
                   "நிலக்கடலை", "ಕಡಲೆಕಾಯಿ", "వేరుశనగ"],
    "soybean":    ["soybean", "सोयाबीन", "ਸੋਇਆਬੀਨ",
                   "சோயா", "ಸೋಯಾಬೀನ್", "సోయా"],
    "sugarcane":  ["sugarcane", "गन्ना", "ਗੰਨਾ", "கரும்பு",
                   "ಕಬ್ಬು", "చెరకు"],
    "turmeric":   ["turmeric", "haldi", "हल्दी", "ਹਲਦੀ",
                   "மஞ்சள்", "ಅರಿಶಿನ", "పసుపు"],
    "paddy":      ["paddy", "dhaan", "धान", "ਝੋਨਾ", "நெல்",
                   "ಭತ್ತ", "వరి"],
}


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def evaluate_transliteration(
    *,
    response_text: str,
    required_entities: List[str],
) -> Dict[str, object]:
    """Score the response on whether required named entities are present.

    ``required_entities`` is a list of *concept keys* from
    :data:`CANONICAL_VARIANTS`, e.g. ``["wheat", "pmfby"]``.
    """
    text = _norm(response_text)
    matched: List[str] = []
    missing: List[str] = []
    details: Dict[str, List[str]] = {}

    for entity in required_entities:
        variants = CANONICAL_VARIANTS.get(entity, [entity])
        found = None
        for v in variants:
            if _norm(v) and _norm(v) in text:
                found = v
                break
        if found:
            matched.append(entity)
            details[entity] = [f"matched:{found}"]
        else:
            missing.append(entity)
            details[entity] = [f"missing among {variants[:3]}…"]

    score = (len(matched) / len(required_entities)) if required_entities else 1.0

    return {
        "correct": score == 1.0,
        "score": round(score, 4),
        "matched": matched,
        "missing": missing,
        "details": details,
    }


__all__ = ["evaluate_transliteration", "CANONICAL_VARIANTS"]