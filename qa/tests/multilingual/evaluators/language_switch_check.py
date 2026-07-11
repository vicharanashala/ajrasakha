"""Mid-answer language switching evaluator.

A farmer who asks in Kannada must receive an answer that *stays* in
Kannada end-to-end.  Mid-sentence switching (Kannada → Hindi →
English → Tamil) breaks trust, hurts comprehension and indicates a
prompt-routing bug.

This evaluator wraps :func:`detect_language_switch` and applies the
strict rule: a switch is flagged when a *secondary* script accounts
for ≥ 15 % of the response AND that script is *neither* the query
script nor Latin.  English co-presence (technical units, brand
names) is **allowed**.
"""
from __future__ import annotations

from typing import Dict

from .language_detector import detect_language_switch


# Allowed "support" scripts alongside the query script.
ALLOWED_CO_SCRIPTS = {"english"}


def evaluate_language_switch(
    *,
    response_text: str,
    query_language: str,
) -> Dict[str, object]:
    """Return the language-switching evaluation result.

    Keys: ``switched`` (bool), ``primary`` (str), ``secondary`` (str|None),
    ``primary_score`` (float), ``secondary_score`` (float),
    ``off_script_chars`` (int), ``per_script_ratio`` (dict).
    """
    info = detect_language_switch(response_text, query_language)

    switched = bool(info["switched"])
    # If "secondary" is English / Latin, don't flag as a switch
    if switched and info["secondary"] in ALLOWED_CO_SCRIPTS:
        # English is allowed — only flag when English exceeds 30%
        if float(info["secondary_score"]) >= 0.30 and query_language != "english":
            switched = True
        else:
            switched = False

    return {
        "switched": switched,
        "primary": info["primary"],
        "secondary": info["secondary"],
        "primary_score": info["primary_score"],
        "secondary_score": info["secondary_score"],
        "off_script_chars": info["off_script_chars"],
        "per_script_ratio": info["per_script_ratio"],
    }


__all__ = ["evaluate_language_switch"]