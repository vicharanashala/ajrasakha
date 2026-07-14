"""Detect farmer query language and script for output matching."""

from __future__ import annotations

import logging
import re
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# India's 22 scheduled languages + English (23 total)
OFFICIAL_LANGUAGES = [
    "Assamese",
    "Bengali",
    "Bodo",
    "Dogri",
    "English",
    "Gujarati",
    "Hindi",
    "Kannada",
    "Kashmiri",
    "Konkani",
    "Maithili",
    "Malayalam",
    "Marathi",
    "Nepali",
    "Odia",
    "Punjabi",
    "Sanskrit",
    "Sindhi",
    "Tamil",
    "Telugu",
    "Urdu",
    "Manipuri (Meitei)",
    "Santali",
]

# 12 native Indian script Unicode ranges
_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_BENGALI_ASSAMESE = re.compile(r"[\u0980-\u09FF]")
_GURMUKHI = re.compile(r"[\u0A00-\u0A7F]")
_GUJARATI = re.compile(r"[\u0A80-\u0AFF]")
_ODIA = re.compile(r"[\u0B00-\u0B7F]")
_TAMIL = re.compile(r"[\u0B80-\u0BFF]")
_TELUGU = re.compile(r"[\u0C00-\u0C7F]")
_KANNADA = re.compile(r"[\u0C80-\u0CFF]")
_MALAYALAM = re.compile(r"[\u0D00-\u0DFF]")
_PERSO_ARABIC = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")
_OL_CHIKI = re.compile(r"[\u1C50-\u1C7F]")
_MEITEI_MAYEK = re.compile(r"[\uABC0-\uABFF\uAAE0-\uAAFF]")


def detect_script(text: str) -> str:
    """Return the name of the detected script, defaulting to 'Latin'.
    
    Uses count-based detection to handle overlapping Unicode ranges correctly.
    Returns the script with the most character matches.
    """
    t = text or ""
    
    # Count characters for each script
    script_counts: dict[str, int] = {
        "Devanagari": len(_DEVANAGARI.findall(t)),
        "Bengali-Assamese": len(_BENGALI_ASSAMESE.findall(t)),
        "Gurmukhi": len(_GURMUKHI.findall(t)),
        "Gujarati": len(_GUJARATI.findall(t)),
        "Odia": len(_ODIA.findall(t)),
        "Tamil": len(_TAMIL.findall(t)),
        "Telugu": len(_TELUGU.findall(t)),
        "Kannada": len(_KANNADA.findall(t)),
        "Malayalam": len(_MALAYALAM.findall(t)),
        "Perso-Arabic": len(_PERSO_ARABIC.findall(t)),
        "Ol Chiki": len(_OL_CHIKI.findall(t)),
        "Meitei Mayek": len(_MEITEI_MAYEK.findall(t)),
    }
    
    # Return the script with the highest count (if any)
    if script_counts:
        detected_script = max(script_counts, key=script_counts.get)
        if script_counts[detected_script] > 0:
            return detected_script
    
    return "Latin"


# detect_script label → OFFICIAL_LANGUAGES name when script maps 1:1 to a language
_SCRIPT_TO_OFFICIAL_LANGUAGE: dict[str, str] = {
    "Telugu": "Telugu",
    "Tamil": "Tamil",
    "Kannada": "Kannada",
    "Malayalam": "Malayalam",
    "Odia": "Odia",
    "Gujarati": "Gujarati",
    "Gurmukhi": "Punjabi",
    "Ol Chiki": "Santali",
    "Meitei Mayek": "Manipuri (Meitei)",
}

# Unique scripts list for script_language field
UNIQUE_SCRIPTS = [
    "Bengali-Assamese",
    "Devanagari",
    "Gujarati",
    "Gurmukhi",
    "Kannada",
    "Malayalam",
    "Meitei Mayek",
    "Odia",
    "Ol Chiki",
    "Perso-Arabic",
    "Tamil",
    "Telugu",
]

# Mapping from detect_script output to UNIQUE_SCRIPTS names
_SCRIPT_TO_UNIQUE: dict[str, str] = {
    "Bengali-Assamese": "Bengali-Assamese",
    "Devanagari": "Devanagari",
    "Gujarati": "Gujarati",
    "Gurmukhi": "Gurmukhi",
    "Kannada": "Kannada",
    "Malayalam": "Malayalam",
    "Meitei Mayek": "Meitei Mayek",
    "Odia": "Odia",
    "Ol Chiki": "Ol Chiki",
    "Perso-Arabic": "Perso-Arabic",
    "Tamil": "Tamil",
    "Telugu": "Telugu",
}


def detect_script_language(text: str) -> str:
    """Detect script language using Unicode ranges.
    
    Returns one of the UNIQUE_SCRIPTS values, or "English" for Latin/Roman text.
    This is deterministic and does not require LLM inference.
    """
    detected = detect_script(text or "")
    
    if detected == "Latin":
        return "English"
    
    return _SCRIPT_TO_UNIQUE.get(detected, "English")

_DEVANAGARI_VOCAL_LANGUAGES = frozenset(
    {
        "Hindi",
        "Marathi",
        "Nepali",
        "Sanskrit",
        "Konkani",
        "Maithili",
        "Bodo",
        "Dogri",
        "Kashmiri",
    }
)

_PERSO_ARABIC_VOCAL_LANGUAGES = frozenset({"Urdu", "Sindhi", "Kashmiri"})

_BENGALI_ASSAMESE_VOCAL_LANGUAGES = frozenset({"Bengali", "Assamese"})


def _coerce_official_language(name: str) -> str | None:
    """Case-insensitive match against OFFICIAL_LANGUAGES; None if unknown."""
    from ajrasakha.agents.translation_catalog import OFFICIAL_LANGUAGES

    raw = (name or "").strip()
    if not raw:
        return None
    lower = raw.lower()
    for lang in OFFICIAL_LANGUAGES:
        if lang.lower() == lower:
            return lang
    return None


def resolve_planner_language_pair(
    farmer_text: str,
    vocal_language: str,
    script_language: str,
) -> tuple[str, str]:
    """Normalize planner vocal/script using Unicode script on the raw farmer message.

    Roman/Latin typing → script_language=English, vocal unchanged (if valid).
    Native script blocks → script_language aligns with detected script (vocal matched).
    """
    detected = detect_script(farmer_text or "")
    vocal = _coerce_official_language(vocal_language) or "English"
    script = _coerce_official_language(script_language) or "English"

    if detected == "Latin":
        return vocal, "English"

    if detected == "Devanagari":
        script_out = vocal if vocal in _DEVANAGARI_VOCAL_LANGUAGES else "Hindi"
        return vocal, script_out

    if detected == "Perso-Arabic":
        if vocal in _PERSO_ARABIC_VOCAL_LANGUAGES:
            return vocal, vocal
        return "Urdu", "Urdu"

    if detected == "Bengali-Assamese":
        if vocal in _BENGALI_ASSAMESE_VOCAL_LANGUAGES:
            return vocal, vocal
        return "Bengali", "Bengali"

    official = _SCRIPT_TO_OFFICIAL_LANGUAGE.get(detected)
    if official:
        return official, official

    logger.warning(
        "resolve_planner_language_pair: unknown detect_script=%s — keeping planner pair (%s, %s)",
        detected,
        vocal,
        script,
    )
    return vocal, script


def _llm_detect_language(text: str, script_context: str = "Latin") -> str:
    """Analyze the text and return the underlying spoken language name (e.g. Hindi, English, Punjabi).
    
    Args:
        text: The farmer's query text
        script_context: The detected script from Unicode ranges (e.g. "Telugu", "Odia", "Latin")
                       This is used to inform the LLM about the script context to avoid
                       incorrectly inferring language from state/place names.
    """
    t = (text or "").strip()
    if not t:
        return "English"
    
    # For native scripts that map 1:1 to a language, use that as hint
    # This prevents the LLM from incorrectly inferring from state names
    if script_context in _SCRIPT_TO_OFFICIAL_LANGUAGE:
        script_lang = _SCRIPT_TO_OFFICIAL_LANGUAGE[script_context]
        # For scripts that have a clear 1:1 mapping, prefer the script's language
        # unless there's strong evidence of a different spoken language
        script_hint = f"\n\nSCRIPT CONTEXT (IMPORTANT): The text is written in {script_context} script. "
        script_hint += f"This typically indicates the spoken language is {script_lang}. "
        script_hint += "Do NOT let state/district names (like Odisha, Tamil Nadu) mislead you into "
        script_hint += "detecting a different language — the SCRIPT determines the vocal language."
    elif script_context == "Devanagari":
        script_hint = "\n\nSCRIPT CONTEXT: The text is in Devanagari script, which is shared by "
        script_hint += "Hindi, Marathi, Nepali, Sanskrit, and other languages. "
        script_hint += "Use Hindi markers (postpositions: me/ke liye/se/ko/par, "
        script_hint += "verbs: hai/hain/karna, pronouns: mera/aap/hum) to distinguish from Hindi."
    elif script_context == "Bengali-Assamese":
        script_hint = "\n\nSCRIPT CONTEXT: The text is in Bengali-Assamese script, "
        script_hint += "used by Bengali and Assamese languages."
    elif script_context == "Latin":
        script_hint = ""
    else:
        script_hint = ""
    
    try:
        from langchain_anthropic import ChatAnthropic
        from ajrasakha.agents.config import SANITIZER_MODEL
        llm = ChatAnthropic(model=SANITIZER_MODEL)
        
        prompt = (
            "Analyze the following text from an Indian farmer and identify the underlying spoken language.\n\n"
            "Examples:\n"
            "- 'What weather-related risks should I watch for over the next 7 days?' → English\n"
            "- 'Mera sawal gehu ke baare me hai' → Hindi\n\n"
            "Hinglish/Hindi markers to look for (indicates Hindi, not English):\n"
            "- Hindi postpositions: me, ke liye, se, ko, par\n"
            "- Hindi verb forms: hai, hain, sakta hai, karna\n"
            "- Hindi conjunctions: aur, ya, lekin, ki\n"
            "- Hindi pronouns: mera, aap, hum, unka\n"
            "- Hindi question words: kya, kahan, kab, kaise\n"
            "- Hindi articles: ek\n\n"
            "CRITICAL RULE:\n"
            "- If the text uses standard English words, English prepositions (in, for, to, with, over, next), "
            "English verb forms (is, are, can, should, will, watch), and English grammar → classify as ENGLISH\n"
            "- If the text contains ANY of the Hindi markers above → classify as the underlying Indian language\n"
            "- NEVER classify as Hindi just because the text mentions Indian place names (Villupuram, Tamil Nadu, Odisha), "
            "crop names (paddy, wheat), or state names — UNLESS the crop name itself is in Hindi (gehu, chawal, kanak)\n"
            "- NEVER classify as the language of the state mentioned (e.g. don't say Odia just because Odisha is mentioned)\n\n"
            "CROP NAME RULE (apply ONLY if text is exactly a crop name, nothing else):\n"
            "- English crop names: paddy, wheat, rice, maize, cotton, sugarcane, soybean, groundnut, potato, onion, tomato → English\n"
            "- Hindi crop names: gehu, chawal, makka, ganne, aloo, pyaz, tamatar, kanak → Hindi\n"
            "- For crop names in other Indian languages, use your judgment based on the word\n\n"
            "LOCATION-ONLY RULE (apply ONLY if text is exactly a place name, nothing else):\n"
            "- If text is only a state/district name in Latin script (Uttar Pradesh, Tamil Nadu, Villupuram, etc.) → English\n"
            "- If text is only a state/district name in Devanagari script (उत्तर प्रदेश, महाराष्ट्र, etc.) → Hindi\n"
            "- If text is only a state/district name in other native scripts → the corresponding language\n\n"
            f"{script_hint}\n\n"
            f"Return language from this EXACT list only:\n{', '.join(OFFICIAL_LANGUAGES)}.\n\n"
            "Return ONLY the language name. Do not include any other text, reasoning, or punctuation.\n\n"
            f"Text: {t}\n"
            "Language:"
        )
        
        response = llm.invoke(prompt)
        lang = str(response.content).strip()
        
        # Validate against OFFICIAL_LANGUAGES
        for l in OFFICIAL_LANGUAGES:
            if re.search(rf"\b{re.escape(l)}\b", lang, re.IGNORECASE):
                return l
        
        return "English"
    except Exception as e:
        logger.warning("LLM language detection failed with exception: %s", e, exc_info=True)
        return "English"


async def _allm_detect_language(text: str, script_context: str = "Latin") -> str:
    """Analyze the text and return the underlying spoken language name asynchronously.
    
    Args:
        text: The farmer's query text
        script_context: The detected script from Unicode ranges (e.g. "Telugu", "Odia", "Latin")
                       This is used to inform the LLM about the script context to avoid
                       incorrectly inferring language from state/place names.
    """
    t = (text or "").strip()
    if not t:
        return "English"
    
    # For native scripts that map 1:1 to a language, use that as hint
    if script_context in _SCRIPT_TO_OFFICIAL_LANGUAGE:
        script_lang = _SCRIPT_TO_OFFICIAL_LANGUAGE[script_context]
        script_hint = f"\n\nSCRIPT CONTEXT (IMPORTANT): The text is written in {script_context} script. "
        script_hint += f"This typically indicates the spoken language is {script_lang}. "
        script_hint += "Do NOT let state/district names (like Odisha, Tamil Nadu) mislead you into "
        script_hint += "detecting a different language — the SCRIPT determines the vocal language."
    elif script_context == "Devanagari":
        script_hint = "\n\nSCRIPT CONTEXT: The text is in Devanagari script, which is shared by "
        script_hint += "Hindi, Marathi, Nepali, Sanskrit, and other languages. "
        script_hint += "Use Hindi markers (postpositions: me/ke liye/se/ko/par, "
        script_hint += "verbs: hai/hain/karna, pronouns: mera/aap/hum) to distinguish from Hindi."
    elif script_context == "Bengali-Assamese":
        script_hint = "\n\nSCRIPT CONTEXT: The text is in Bengali-Assamese script, "
        script_hint += "used by Bengali and Assamese languages."
    elif script_context == "Latin":
        script_hint = ""
    else:
        script_hint = ""
    
    try:
        from langchain_anthropic import ChatAnthropic
        from ajrasakha.agents.config import SANITIZER_MODEL
        llm = ChatAnthropic(model=SANITIZER_MODEL)
        
        prompt = (
            "Analyze the following text from an Indian farmer and identify the underlying spoken language.\n\n"
            "Examples:\n"
            "- 'What weather-related risks should I watch for over the next 7 days?' → English\n"
            "- 'Mera sawal gehu ke baare me hai' → Hindi\n\n"
            "Hinglish/Hindi markers to look for (indicates Hindi, not English):\n"
            "- Hindi postpositions: me, ke liye, se, ko, par\n"
            "- Hindi verb forms: hai, hain, sakta hai, karna\n"
            "- Hindi conjunctions: aur, ya, lekin, ki\n"
            "- Hindi pronouns: mera, aap, hum, unka\n"
            "- Hindi question words: kya, kahan, kab, kaise\n"
            "- Hindi articles: ek\n\n"
            "CRITICAL RULE:\n"
            "- If the text uses standard English words, English prepositions (in, for, to, with, over, next), "
            "English verb forms (is, are, can, should, will, watch), and English grammar → classify as ENGLISH\n"
            "- If the text contains ANY of the Hindi markers above → classify as the underlying Indian language\n"
            "- NEVER classify as Hindi just because the text mentions Indian place names (Villupuram, Tamil Nadu, Odisha), "
            "crop names (paddy, wheat), or state names — UNLESS the crop name itself is in Hindi (gehu, chawal, kanak)\n"
            "- NEVER classify as the language of the state mentioned (e.g. don't say Odia just because Odisha is mentioned)\n\n"
            "CROP NAME RULE (apply ONLY if text is exactly a crop name, nothing else):\n"
            "- English crop names: paddy, wheat, rice, maize, cotton, sugarcane, soybean, groundnut, potato, onion, tomato → English\n"
            "- Hindi crop names: gehu, chawal, makka, ganne, aloo, pyaz, tamatar, kanak → Hindi\n"
            "- For crop names in other Indian languages, use your judgment based on the word\n\n"
            "LOCATION-ONLY RULE (apply ONLY if text is exactly a place name, nothing else):\n"
            "- If text is only a state/district name in Latin script (Uttar Pradesh, Tamil Nadu, Villupuram, etc.) → English\n"
            "- If text is only a state/district name in Devanagari script (उत्तर प्रदेश, महाराष्ट्र, etc.) → Hindi\n"
            "- If text is only a state/district name in other native scripts → the corresponding language\n\n"
            f"{script_hint}\n\n"
            f"Return language from this EXACT list only:\n{', '.join(OFFICIAL_LANGUAGES)}.\n\n"
            "Return ONLY the language name. Do not include any other text, reasoning, or punctuation.\n\n"
            f"Text: {t}\n"
            "Language:"
        )
        
        response = await llm.ainvoke(prompt)
        lang = str(response.content).strip()
        
        # Validate against OFFICIAL_LANGUAGES
        for l in OFFICIAL_LANGUAGES:
            if re.search(rf"\b{re.escape(l)}\b", lang, re.IGNORECASE):
                return l
        
        return "English"
    except Exception as e:
        logger.warning("Async LLM language detection failed with exception: %s", e, exc_info=True)
        return "English"


async def adetect_farmer_language(text: str) -> str:
    """Asynchronously return a display label representing the script and language used."""
    t = (text or "").strip()
    if not t:
        return "English"
        
    script = detect_script(t)
    lang = await _allm_detect_language(t, script)
    
    if script == "Latin":
        if lang == "English":
            return "English"
        if lang == "Hindi":
            return "Hinglish"
        return f"Romanized {lang}"
    else:
        return lang


def detect_farmer_language(text: str) -> str:
    """
    Return a display label representing the script and language used.
    If script is Latin:
        - underlying language English -> "English"
        - underlying language Hindi -> "Hinglish"
        - other Indian language -> e.g. "Romanized Punjabi", "Romanized Tamil"
    If script is native (e.g. Devanagari):
        - returns the exact spoken language (e.g. "Hindi", "Marathi")
    """
    t = (text or "").strip()
    if not t:
        return "English"
        
    script = detect_script(t)
    lang = _llm_detect_language(t, script)
    
    if script == "Latin":
        if lang == "English":
            return "English"
        if lang == "Hindi":
            return "Hinglish"
        return f"Romanized {lang}"
    else:
        return lang


def text_matches_user_language(answer: str, user_message: str) -> bool:
    """True when answer script aligns with the farmer's message."""
    user_script = detect_script(user_message)
    answer_script = detect_script(answer)
    
    if user_script == "Latin":
        # Latin input requires Latin output (no native script characters of the 12 scripts)
        return answer_script == "Latin"
    else:
        # Native script input requires output in that exact native script
        return answer_script == user_script


def language_directive_for_synthesis(
    vocal_language: str,
    script_language: Optional[str] = None,
    *,
    lang_label: Optional[str] = None,
) -> str:
    """Force synthesizer to emit English body; translation uses vocal + script from plan."""
    if lang_label is not None and script_language is None:
        from ajrasakha.agents.translation_catalog import synthesis_lang_label
        return _language_directive_legacy_label(lang_label)

    from ajrasakha.agents.translation_catalog import synthesis_lang_label

    script = (script_language or vocal_language or "English").strip()
    vocal = (vocal_language or "English").strip()
    label = synthesis_lang_label(script, vocal)
    return (
        "OUTPUT CONTRACT (NON-NEGOTIABLE):\n"
        "Write ONLY the farming answer body in clear English.\n"
        "Translate all tool facts into English in the body.\n"
        "Do NOT add sources, testing disclaimers, 2-hour expert-queue text, or footers.\n"
        f"A later step will deliver the answer to the farmer in vocal language {vocal} "
        f"using script {script} (display label: {label})."
    )


def _language_directive_legacy_label(lang_label: str) -> str:
    """System text that forces the synthesizer to match the farmer's language and script."""
    
    if lang_label == "English":
        return (
            "REQUIRED OUTPUT LANGUAGE: English (NON-NEGOTIABLE)\n"
            "The farmer wrote in English. Your ENTIRE reply must be in English only.\n"
            "Tool results (GDB, reviewer, weather, etc.) may be in Hindi or mixed languages — "
            "you MUST translate every fact into English before answering.\n"
            "Do NOT use Devanagari or Hindi sentences. Technical terms may stay as standard "
            "English agrochemical names (e.g. Chlorantraniliprole).\n"
            "The testing disclaimer at the end may stay as provided in English."
        )
        
    if lang_label == "Hinglish":
        return (
            "REQUIRED OUTPUT LANGUAGE: Hindi in Latin Script (Hinglish/Romanized Hindi) (NON-NEGOTIABLE)\n"
            "The farmer wrote in Hinglish. Your ENTIRE reply must be in Hindi language but written in the Latin alphabet (Hinglish/Romanized Hindi).\n"
            "Do NOT use Devanagari script. Do NOT use English sentences.\n"
            "Every sentence must be Hindi written in English letters.\n"
            "Example: Instead of 'आप यूरिया का उपयोग कर सकते हैं' (Devanagari) or 'You can use Urea' (English), "
            "write 'Aap Urea ka upyog kar sakte hain' (Hinglish).\n"
            "Technical terms may stay as standard English names (e.g., Urea, Chlorantraniliprole).\n"
            "Ensure the testing disclaimer at the end is also written in Hinglish."
        )
        
    if lang_label.startswith("Romanized "):
        clean_lang = lang_label.replace("Romanized ", "").strip()
        return (
            f"REQUIRED OUTPUT LANGUAGE: {clean_lang} in Latin Script (Romanized {clean_lang}) (NON-NEGOTIABLE)\n"
            f"The farmer wrote in Romanized {clean_lang}. Your ENTIRE reply must be in {clean_lang} language but written in the Latin alphabet (Romanized {clean_lang}).\n"
            f"Do NOT use native scripts. Do NOT use English sentences.\n"
            f"Every sentence must be {clean_lang} written in English letters.\n"
            f"Technical terms may stay as standard English names.\n"
            f"Ensure the testing disclaimer at the end is also written in Romanized {clean_lang}."
        )
        
    # Native script languages (e.g. Hindi, Punjabi, Tamil, etc.)
    return (
        f"REQUIRED OUTPUT LANGUAGE: {lang_label} (NON-NEGOTIABLE)\n"
        f"The farmer wrote in {lang_label}. Your ENTIRE reply must be in {lang_label} only, using its native script.\n"
        "If tool results are in a different language, translate all facts into "
        f"{lang_label} before answering. Never switch to English or other scripts."
    )


# ── Disclaimer, Canned Reply, and Source Localization Maps ────────────────

_LOCALIZED_WARNINGS = {
    "English": """⚠️ *Important Notice (Testing)* ⚠️

This AjraSakha application is under development and intended only for testing and validation. 
Advisories are experimental and currently cover major crops in selected states. 
Weather data is sourced from IMD.
Market data from eNAM, Agmarknet, and State APMCs.
Soil health guidance from https://soilhealth.dac.gov.in/fertilizer-dosage.
Government schemes from https://www.myscheme.gov.in/. 
Other agricultural information and advisories are expert-verified by Annam.ai. 

Users should independently validate recommendations before acting."""
}

_LOCALIZED_EMPTY_REPLIES = {
    "English": "Your question has been shared with our agri expert at annam.ai. You will get the answer within 2 hours.\nThank You.",
}


def _pair_from_lang_label(lang_label: str) -> tuple[str, str]:
    """Map legacy lang_label to (script, vocal) for catalog lookup."""
    label = (lang_label or "English").strip()
    if label == "English":
        return "English", "English"
    if label == "Hinglish":
        return "English", "Hindi"
    if label.startswith("Romanized "):
        return "English", label.replace("Romanized ", "", 1).strip()
    return label, label


def get_localized_warning_text(
    lang_label: str = "English",
    *,
    script_language: Optional[str] = None,
    vocal_language: Optional[str] = None,
) -> str:
    """Return exact testing disclaimer from the translation catalog."""
    from ajrasakha.agents.translation_catalog import get_testing_disclaimer

    if script_language is not None and vocal_language is not None:
        return get_testing_disclaimer(script_language, vocal_language)
    script, vocal = _pair_from_lang_label(lang_label)
    return get_testing_disclaimer(script, vocal)


def get_localized_empty_reply_body(
    lang_label: str = "English",
    *,
    script_language: Optional[str] = None,
    vocal_language: Optional[str] = None,
) -> str:
    """Return exact 2-hour expert-queue text from the translation catalog."""
    from ajrasakha.agents.translation_catalog import get_two_hour_disclaimer

    if script_language is not None and vocal_language is not None:
        return get_two_hour_disclaimer(script_language, vocal_language)
    script, vocal = _pair_from_lang_label(lang_label)
    return get_two_hour_disclaimer(script, vocal)


# ── Localized Questions for State and Crop ─────────────────────────────────

_LOCALIZED_STATE_QUESTIONS = {
    "English": "Which state are you in?",
}

_LOCALIZED_CROP_QUESTIONS = {
    "English": "Which crop are you growing?",
}


def get_localized_state_question(
    lang_label: str = "English",
    *,
    script_language: Optional[str] = None,
    vocal_language: Optional[str] = None,
) -> str:
    from ajrasakha.agents.translation_catalog import get_state_follow_up

    if script_language is not None and vocal_language is not None:
        return get_state_follow_up(script_language, vocal_language)
    script, vocal = _pair_from_lang_label(lang_label)
    return get_state_follow_up(script, vocal)


def get_localized_crop_question(
    lang_label: str = "English",
    *,
    script_language: Optional[str] = None,
    vocal_language: Optional[str] = None,
) -> str:
    from ajrasakha.agents.translation_catalog import get_crop_follow_up

    if script_language is not None and vocal_language is not None:
        return get_crop_follow_up(script_language, vocal_language)
    script, vocal = _pair_from_lang_label(lang_label)
    return get_crop_follow_up(script, vocal)