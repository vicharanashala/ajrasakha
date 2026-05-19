"""Detect farmer query language for output matching."""

from __future__ import annotations

import re

# Unicode script ranges for common Indian languages on WhatsApp.
_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_GURMUKHI = re.compile(r"[\u0A00-\u0A7F]")
_TAMIL = re.compile(r"[\u0B80-\u0BFF]")
_TELUGU = re.compile(r"[\u0C00-\u0C7F]")
_BENGALI = re.compile(r"[\u0980-\u09FF]")


def detect_farmer_language(text: str) -> str:
    """
    Return a display label for the language the farmer used.
    Latin-script queries default to English (matches product rule).
    """
    t = (text or "").strip()
    if not t:
        return "English"
    if _DEVANAGARI.search(t):
        return "Hindi"
    if _GURMUKHI.search(t):
        return "Punjabi"
    if _TAMIL.search(t):
        return "Tamil"
    if _TELUGU.search(t):
        return "Telugu"
    if _BENGALI.search(t):
        return "Bengali"
    return "English"


def text_matches_user_language(answer: str, user_message: str) -> bool:
    """True when answer script/language aligns with the farmer's message."""
    user_lang = detect_farmer_language(user_message)
    has_devanagari = bool(_DEVANAGARI.search(answer or ""))
    if user_lang == "English":
        return not has_devanagari
    if user_lang == "Hindi":
        return has_devanagari
    return True


def language_directive_for_synthesis(user_message: str) -> str:
    """System text that forces the synthesizer to match the farmer's language."""
    lang = detect_farmer_language(user_message)
    if lang == "English":
        return (
            "REQUIRED OUTPUT LANGUAGE: English (NON-NEGOTIABLE)\n"
            "The farmer wrote in English. Your ENTIRE reply must be in English only.\n"
            "Tool results (GDB, reviewer, weather, etc.) may be in Hindi or mixed languages — "
            "you MUST translate every fact into English before answering.\n"
            "Do NOT use Devanagari or Hindi sentences. Technical terms may stay as standard "
            "English agrochemical names (e.g. Chlorantraniliprole).\n"
            "The testing disclaimer at the end may stay as provided in English."
        )
    return (
        f"REQUIRED OUTPUT LANGUAGE: {lang} (NON-NEGOTIABLE)\n"
        f"The farmer wrote in {lang}. Your ENTIRE reply must be in {lang} only.\n"
        "If tool results are in a different language, translate all facts into "
        f"{lang} before answering. Never switch to English unless the farmer used English."
    )
