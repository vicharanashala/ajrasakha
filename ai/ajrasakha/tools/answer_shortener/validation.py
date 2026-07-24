"""Deterministic output checks that complement the LLM prompt."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


_URL_RE = re.compile(r"https?://[^\s<>{}\[\]\"']+", re.IGNORECASE)
_NUMBER = r"[+-]?\d+(?:,\d{2,3})*(?:\.\d+)?"
_RANGE = rf"{_NUMBER}(?:\s*(?:-|–|—|to)\s*{_NUMBER})?"
_UNIT = (
    r"%|°\s*[CF]|kg|g|mg|mcg|µg|l|ml|lit(?:er|re)s?|"
    r"quintals?|tonnes?|tons?|acres?|hectares?|ha|ppm|ppb|"
    r"days?|hours?|minutes?|weeks?|months?|years?|times?|"
    r"applications?|sprays?|doses?|plants?|seeds?|"
    r"cm|mm|m|km"
)
_PER_UNIT = r"(?:\s*/\s*(?:l|ml|kg|g|acre|hectare|ha|plant|day|week|month|quintal))?"
_MEASUREMENT_RE = re.compile(
    rf"(?<!\w){_RANGE}\s*(?:{_UNIT}){_PER_UNIT}(?!\w)",
    re.IGNORECASE,
)
_PH_RE = re.compile(rf"\bpH\s*{_RANGE}\b", re.IGNORECASE)
_CURRENCY_RE = re.compile(
    rf"(?:₹|Rs\.?|INR)\s*{_NUMBER}(?:\s*/\s*(?:kg|quintal|tonne|acre))?",
    re.IGNORECASE,
)
_RATIO_RE = re.compile(
    rf"(?<!\w){_NUMBER}(?:\s*:\s*{_NUMBER}){{1,3}}(?!\w)",
    re.IGNORECASE,
)
_SAFETY_MARKER_RE = re.compile(
    r"\b(?:do not|don't|avoid|warning|caution|banned|restricted|"
    r"wear|gloves|mask|ppe|waiting period|pre-harvest|phi|label instructions?)\b",
    re.IGNORECASE,
)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?।])\s+|\n+")
_SCRIPT_NAME_MARKERS = (
    ("Devanagari", "DEVANAGARI"),
    ("Bengali", "BENGALI"),
    ("Gurmukhi", "GURMUKHI"),
    ("Gujarati", "GUJARATI"),
    ("Odia", "ORIYA"),
    ("Tamil", "TAMIL"),
    ("Telugu", "TELUGU"),
    ("Kannada", "KANNADA"),
    ("Malayalam", "MALAYALAM"),
    ("Ol Chiki", "OL CHIKI"),
    ("Arabic", "ARABIC"),
    ("Latin", "LATIN"),
)


def normalize_candidate(text: str) -> str:
    cleaned = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if cleaned.startswith("```") and cleaned.endswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 3:
            cleaned = "\n".join(lines[1:-1]).strip()
    return cleaned


def _normalize_token(value: str) -> str:
    value = unicodedata.normalize("NFKC", value.strip()).casefold()
    value = re.sub(r"[–—]", "-", value)
    value = re.sub(r"\bto\b", "-", value)
    value = re.sub(r"\s+", "", value)
    return value


def _urls(text: str) -> set[str]:
    return {
        match.group(0).rstrip(".,;:!?)]}")
        for match in _URL_RE.finditer(text)
    }


def _measurements(text: str) -> set[str]:
    matches: set[str] = set()
    for pattern in (_MEASUREMENT_RE, _PH_RE, _CURRENCY_RE, _RATIO_RE):
        matches.update(_normalize_token(match.group(0)) for match in pattern.finditer(text))
    return matches


def _dominant_script(text: str) -> str | None:
    counts = {label: 0 for label, _ in _SCRIPT_NAME_MARKERS}
    text_without_urls = _URL_RE.sub("", text)
    for character in text_without_urls:
        if unicodedata.category(character)[0] not in {"L", "M"}:
            continue
        name = unicodedata.name(character, "")
        for label, marker in _SCRIPT_NAME_MARKERS:
            if marker in name:
                counts[label] += 1
                break
    label, count = max(counts.items(), key=lambda item: item[1])
    return label if count else None


def _safety_spans(text: str) -> tuple[str, ...]:
    spans: list[str] = []
    for sentence in _SENTENCE_SPLIT_RE.split(text):
        cleaned = sentence.strip()
        if cleaned and _SAFETY_MARKER_RE.search(cleaned):
            spans.append(cleaned)
    return tuple(dict.fromkeys(spans))


@dataclass(frozen=True)
class ProtectionPromptMetadata:
    """Prompt-facing protection data separated by enforcement semantics."""

    mandatory_safety_spans: tuple[str, ...]
    available_source_measurements: tuple[str, ...]
    available_source_urls: tuple[str, ...]


@dataclass(frozen=True)
class ProtectedContent:
    urls: frozenset[str]
    measurements: frozenset[str]
    safety_spans: tuple[str, ...]
    dominant_script: str | None

    @classmethod
    def from_text(cls, text: str) -> "ProtectedContent":
        return cls(
            urls=frozenset(_urls(text)),
            measurements=frozenset(_measurements(text)),
            safety_spans=_safety_spans(text),
            dominant_script=_dominant_script(text),
        )

    @property
    def prompt_metadata(self) -> ProtectionPromptMetadata:
        return ProtectionPromptMetadata(
            mandatory_safety_spans=self.safety_spans,
            available_source_measurements=tuple(sorted(self.measurements)),
            available_source_urls=tuple(sorted(self.urls)),
        )

    @property
    def mandatory_prompt_spans(self) -> tuple[str, ...]:
        return self.prompt_metadata.mandatory_safety_spans

    @property
    def available_source_measurements(self) -> tuple[str, ...]:
        return self.prompt_metadata.available_source_measurements

    @property
    def available_source_urls(self) -> tuple[str, ...]:
        return self.prompt_metadata.available_source_urls

    @property
    def prompt_spans(self) -> tuple[str, ...]:
        """Compatibility alias for spans that every candidate must preserve."""

        return self.mandatory_prompt_spans

    @property
    def minimum_rendered_length(self) -> int:
        spans = self.mandatory_prompt_spans
        return sum(len(span) for span in spans) + max(0, len(spans) - 1)


def validate_candidate(
    candidate: str,
    *,
    lower_bound: int,
    upper_bound: int,
    protected: ProtectedContent,
) -> list[str]:
    failures: list[str] = []
    actual = len(candidate)
    if not candidate:
        failures.append("EMPTY_OUTPUT")
    if actual < lower_bound:
        failures.append(
            f"LENGTH_TOO_SHORT: {actual} characters; minimum is {lower_bound}"
        )
    if actual > upper_bound:
        failures.append(
            f"LENGTH_TOO_LONG: {actual} characters; maximum is {upper_bound}"
        )

    candidate_urls = _urls(candidate)
    for value in sorted(candidate_urls - protected.urls):
        failures.append(f"NEW_URL_NOT_IN_SOURCE: {value}")

    candidate_measurements = _measurements(candidate)
    for value in sorted(candidate_measurements - protected.measurements):
        failures.append(f"NEW_MEASUREMENT_NOT_IN_SOURCE: {value}")

    for span in protected.safety_spans:
        if span not in candidate:
            failures.append(f"MISSING_SAFETY_SPAN: {span}")

    candidate_script = _dominant_script(candidate)
    if protected.dominant_script and candidate_script != protected.dominant_script:
        failures.append(
            "WRONG_WRITING_SCRIPT: "
            f"expected {protected.dominant_script}; received {candidate_script or 'none'}"
        )
    return failures
