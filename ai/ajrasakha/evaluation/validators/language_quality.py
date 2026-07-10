"""Deterministic language-quality checks for multilingual evaluations."""

from __future__ import annotations

import re
from collections import Counter
from typing import Iterable


SCRIPT_RANGES = {
    "Latin": r"[A-Za-z]",
    "Devanagari": r"[\u0900-\u097F]",
    "Kannada": r"[\u0C80-\u0CFF]",
    "Tamil": r"[\u0B80-\u0BFF]",
    "Gurmukhi": r"[\u0A00-\u0A7F]",
    "Telugu": r"[\u0C00-\u0C7F]",
}

INDIC_SCRIPTS = {
    "Devanagari",
    "Kannada",
    "Tamil",
    "Gurmukhi",
    "Telugu",
}


def _norm(value: object) -> str:
    return str(value or "").strip()


def _count_script_chars(text: str) -> Counter[str]:
    counts: Counter[str] = Counter()
    for script, pattern in SCRIPT_RANGES.items():
        counts[script] = len(re.findall(pattern, text))
    return counts


def _script_pass(text: str, expected_script: str) -> tuple[bool, str]:
    counts = _count_script_chars(text)
    expected_count = counts.get(expected_script, 0)
    total_script_chars = sum(counts.values())

    if not text:
        return False, "answer_missing"

    if expected_count == 0:
        return False, f"expected script not detected: {expected_script}"

    if total_script_chars == 0:
        return False, "no script characters detected"

    dominant_script, dominant_count = counts.most_common(1)[0]
    expected_ratio = expected_count / max(total_script_chars, 1)

    # English answers often include crop names and acronyms in Latin script.
    # Indic-language answers can also preserve Latin acronyms like PM-KISAN.
    # Keep the threshold modest so transliterated domain terms do not fail the
    # whole answer.
    if expected_ratio < 0.35:
        return (
            False,
            f"{expected_script} is not dominant enough "
            f"({expected_count}/{total_script_chars}); dominant={dominant_script}:{dominant_count}",
        )

    return True, ""


def _language_switching_pass(text: str, expected_script: str) -> tuple[bool, str]:
    counts = _count_script_chars(text)
    total = sum(counts.values())
    if total == 0:
        return False, "no script characters detected"

    unexpected_scripts = []
    for script, count in counts.items():
        if script == expected_script or count == 0:
            continue
        if script == "Latin" and expected_script in INDIC_SCRIPTS:
            # Allow acronyms, crop names, scheme names, and pesticide names.
            if count / total <= 0.30:
                continue
        if count / total > 0.20:
            unexpected_scripts.append(f"{script}:{count}")

    if unexpected_scripts:
        return False, "unexpected script mix: " + ", ".join(unexpected_scripts)
    return True, ""


def _terms_pass(text: str, expected_terms: Iterable[str]) -> tuple[bool, str]:
    missing = []
    lower_text = text.lower()
    for term in expected_terms or []:
        term_text = str(term).strip()
        if not term_text:
            continue
        # These checks are intentionally permissive: final term validation
        # should use agri-team-approved translations/transliterations.
        if term_text.lower() not in lower_text:
            missing.append(term_text)

    if missing:
        return False, "expected term marker missing: " + ", ".join(missing[:5])
    return True, ""


def evaluate_language_quality(result: dict, case: dict) -> dict:
    response = _norm(result.get("response_text"))
    expected_script = _norm(case.get("expected_script"))
    expected_language = _norm(case.get("expected_language") or case.get("language"))

    language_pass, language_reason = _script_pass(response, expected_script)
    switching_pass, switching_reason = _language_switching_pass(response, expected_script)

    disclaimer_marker = _norm(case.get("expected_disclaimer_marker"))
    disclaimer_required = bool(case.get("expect_2hr_disclaimer"))
    disclaimer_pass = True
    disclaimer_reason = ""
    if disclaimer_required:
        disclaimer_pass = bool(disclaimer_marker and disclaimer_marker in response)
        if not disclaimer_pass:
            disclaimer_reason = "expected disclaimer marker missing"

    expected_gdb_entry = _norm(case.get("expected_gdb_entry_id"))
    observed_gdb_entry = _norm(
        result.get("observed_gdb_entry_id")
        or result.get("retrieved_gdb_entry_id")
        or case.get("mock_retrieved_gdb_entry_id")
    )
    if expected_gdb_entry:
        gdb_pass = observed_gdb_entry == expected_gdb_entry
        gdb_reason = "" if gdb_pass else f"expected {expected_gdb_entry}, observed {observed_gdb_entry or 'missing'}"
    else:
        gdb_pass = True
        gdb_reason = ""

    terms_by_language = case.get("expected_terms_by_language") or {}
    terms_for_language = terms_by_language.get(case.get("language_code", ""), [])
    terms_pass, terms_reason = _terms_pass(response, terms_for_language)

    reasons = [
        reason
        for reason in [
            language_reason,
            switching_reason,
            disclaimer_reason,
            gdb_reason,
            terms_reason,
        ]
        if reason
    ]

    overall = all(
        [
            language_pass,
            switching_pass,
            disclaimer_pass,
            gdb_pass,
            terms_pass,
        ]
    )

    return {
        "language_code": case.get("language_code", ""),
        "language": expected_language,
        "expected_script": expected_script,
        "domain": case.get("domain", case.get("expected_domain", "")),
        "scenario_id": case.get("scenario_id", ""),
        "answer_language_pass": language_pass,
        "disclaimer_language_pass": disclaimer_pass,
        "language_switching_pass": switching_pass,
        "gdb_entry_pass": gdb_pass,
        "term_translation_pass": terms_pass,
        "language_quality_pass": overall,
        "language_quality_reason": "; ".join(reasons),
    }
