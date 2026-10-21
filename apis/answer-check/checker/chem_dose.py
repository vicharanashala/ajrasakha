"""Dose limits for chemicals that are allowed up to a certain dose.

A chemical entry in the banned or restricted list can carry

    "permitted_dose": {"max": 2, "unit": "ml/L"}

meaning the chemical is fine up to that dose and flagged above it. The unit is an
amount per litre, acre or hectare (g, kg, ml or L per L, acre or ha). Amounts
are converted before comparing, so 1 kg/acre equals 1000 g/acre and 2 ml per
litre equals 2 ml/L. Doses per different things (litre against
acre) cannot be compared and are reported as unknown.
"""

from __future__ import annotations

import re
from typing import Any

WITHIN = "within"
EXCEEDS = "exceeds"
UNKNOWN = "unknown"

# amount, unit, then an optional "per / in" and the thing it is per, with an
# optional number before it ("1 g in 1 litre", "2 ml per 1 L")
_DOSE = re.compile(
    r"(?P<amount>\d+(?:\.\d+)?)\s*(?P<unit>kg|gm|grams?|g|ml|litres?|liters?|l)\b"
    r"\s*(?:(?:per|/|in)\s*)?"
    r"(?:(?P<per_amount>\d+(?:\.\d+)?)\s*)?"
    r"(?P<per>litres?|liters?|l|acres?|ha|hectares?)?\b",
    re.IGNORECASE,
)

_MASS = {"kg": 1000.0, "g": 1.0, "gm": 1.0, "gram": 1.0, "grams": 1.0}
_VOLUME = {"l": 1000.0, "litre": 1000.0, "litres": 1000.0, "liter": 1000.0, "liters": 1000.0, "ml": 1.0}
_PER = {
    "l": "L", "litre": "L", "litres": "L", "liter": "L", "liters": "L",
    "acre": "acre", "acres": "acre",
    "ha": "ha", "hectare": "ha", "hectares": "ha",
}


def _normalise(amount: float, unit: str, per: str | None, per_amount: float) -> tuple[float, str, str] | None:
    """(amount in g or ml, "g" or "ml", "L" / "acre" / "ha") or None when there is no 'per'."""
    unit, per_key = unit.casefold(), (per or "").casefold()
    if per_key not in _PER:
        return None
    if unit in _MASS:
        value, base = amount * _MASS[unit], "g"
    elif unit in _VOLUME:
        value, base = amount * _VOLUME[unit], "ml"
    else:
        return None
    return value / (per_amount or 1.0), base, _PER[per_key]


def _first_dose(text: str) -> tuple[str, tuple[float, str, str]] | None:
    """The first dose in the text: how it was written, and (amount per one litre/acre/ha, "g" or "ml", per)."""
    for match in _DOSE.finditer(text):
        found = _normalise(
            float(match.group("amount")), match.group("unit"), match.group("per"),
            float(match.group("per_amount") or 1.0),
        )
        if found:
            return match.group(0).strip(), found
    return None


def _rule_dose(rule: dict[str, Any]) -> tuple[float, str, str] | None:
    numerator, _, denominator = str(rule.get("unit") or "").partition("/")
    return _normalise(float(rule["max"]), numerator.strip(), denominator.strip(), 1.0)


def rule_text(rule: dict[str, Any]) -> str:
    return f"{rule['max']:g} {rule['unit']}"


def _dose_near(answer_text: str, span: tuple[int, int]) -> tuple[str, tuple[float, str, str]] | None:
    """The dose written right after the chemical name, else the one just before it."""
    after = answer_text[span[1]:span[1] + 120]
    # stop at the end of the sentence, so a dose for the next chemical is not used
    after = re.split(r"(?<=[.!?])\s|\n", after, maxsplit=1)[0]
    before = answer_text[max(0, span[0] - 60):span[0]]
    before = re.split(r"(?<=[.!?])\s|\n", before)[-1]
    for text in (after, before):
        found = _first_dose(text)
        if found:
            return found
    return None


def dose_verdict(
    rule: dict[str, Any], answer_text: str, span: tuple[int, int]
) -> tuple[str, str | None]:
    """WITHIN, EXCEEDS or UNKNOWN for the dose written next to the chemical, and that dose as text."""
    allowed = _rule_dose(rule)
    near = _dose_near(answer_text, span)
    if near is None or allowed is None:
        return UNKNOWN, near[0] if near else None
    written, (value, base, per) = near
    if base != allowed[1] or per != allowed[2]:
        return UNKNOWN, written
    return (WITHIN if value <= allowed[0] + 1e-9 else EXCEEDS), written
