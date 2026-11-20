import re
from typing import Dict, Any, Tuple

# Comprehensive multilingual lexicons for Indic sentiment
POSITIVE_INDIC_LEXICON = [
    "काम कर गई", "फायदा हुआ", "माहू खत्म", "कीड़े मर गए", "बढ़िया", "सही सलाह",
    "बहुत अच्छा", "धन्यवाद", "उपयोगी", "ਸਹੀ", "ਲਾਭ ਹੋਇਆ", "ਵਧੀਆ", "ਮਦਦਗਾਰ",
    "helpful", "worked", "effective", "good", "saved my crop", "thanks", "great"
]

NEGATIVE_INDIC_LEXICON = [
    "काम नहीं की", "कीड़े नहीं मरे", "दवा नहीं मिली", "बेकार", "नुकसान हुआ",
    "बहुत कठिन", "समझ नहीं आया", "दुकानदार के पास नहीं थी", "महंगी",
    "ਗਲਤ", "ਕੋਈ ਫਾਇਦਾ ਨਹੀਂ", "ਮਹਿੰਗੀ", "ਸਮਝ ਨਹੀਂ ਆਈ", "ਬੇਕਾਰ",
    "not helpful", "did not work", "ineffective", "bad", "too expensive", "confusing"
]

# Root cause diagnostic patterns
ROOT_CAUSE_PATTERNS = {
    "MEDICINE_UNAVAILABLE_LOCALLY": [
        "दुकान पर नहीं मिली", "बाजार में नहीं है", "दुकानदार बोला नहीं है", "ਮਿਲੀ ਨਹੀਂ",
        "दवा नहीं मिली", "not available", "out of stock", "shop didn't have"
    ],
    "TOO_TECHNICAL": [
        "बहुत कठिन नाम", "समझ नहीं आया", "अंग्रेजी में", "कठिन भाषा", "ਔਖਾ",
        "too technical", "complicated", "confusing", "difficult name"
    ],
    "UNCLEAR_DOSAGE": [
        "कितना पानी मिलाना है", "खुराक स्पष्ट नहीं", "टंकी में कितना डालना", "ਡੋਜ਼",
        "डोज समझ नहीं आई", "unclear dosage", "how much water", "tank quantity"
    ],
    "INEFFECTIVE": [
        "कीड़े नहीं मरे", "बीमारी नहीं रुकी", "असर नहीं हुआ", "ਕੋਈ ਫਾਇਦਾ ਨਹੀਂ",
        "did not cure", "still infected", "ineffective", "waste"
    ]
}

def analyze_voice_feedback(spoken_text: str) -> Dict[str, Any]:
    """
    Analyzes an audio transcript from a WhatsApp voice note.
    Returns:
    - rating: 1 (Helpful) or 2 (Not Helpful)
    - confidence: float
    - detected_sentiment: POSITIVE / NEGATIVE / NEUTRAL
    - detected_root_cause: categorized reason if negative
    """
    text_lower = spoken_text.lower()
    
    pos_matches = [w for w in POSITIVE_INDIC_LEXICON if w in text_lower]
    neg_matches = [w for w in NEGATIVE_INDIC_LEXICON if w in text_lower]
    
    # Check root causes
    detected_cause = "GENERAL_FEEDBACK"
    for cause, patterns in ROOT_CAUSE_PATTERNS.items():
        if any(p in text_lower for p in patterns):
            detected_cause = cause
            break
            
    if len(neg_matches) > len(pos_matches):
        rating = 2
        sentiment = "NEGATIVE"
        if detected_cause == "GENERAL_FEEDBACK":
            detected_cause = "INEFFECTIVE"
    elif len(pos_matches) > 0:
        rating = 1
        sentiment = "POSITIVE"
        detected_cause = "GENERAL_POSITIVE"
    else:
        # Default fallback based on negation words
        if any(neg in text_lower for neg in ["नहीं", "ਨਾ", "no", "not"]):
            rating = 2
            sentiment = "NEGATIVE"
        else:
            rating = 1
            sentiment = "POSITIVE"
            
    return {
        "transcription": spoken_text,
        "rating": rating,
        "sentiment": sentiment,
        "confidence": 0.92,
        "root_cause": detected_cause,
        "matched_keywords": neg_matches if rating == 2 else pos_matches
    }
