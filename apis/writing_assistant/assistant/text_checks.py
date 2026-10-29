"""Deterministic, per-sentence-aligned checks for the technical-content
preservation guardrail (Writing Assistant Build Plan, "Technical-content
preservation policy"). Every check here answers one narrow question about
token presence/absence - none of it proves semantic equivalence, and the
guardrail orchestrator (guardrails.py) never claims it does.
"""

import re

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")

_UNIT_RE = re.compile(
    # Regex alternation picks the first matching branch, not the longest -
    # plural forms must come before their singular prefix (e.g. "litres"
    # before "litre") or they'd only ever match the shorter substring.
    r"\b\d+(?:\.\d+)?\s*"
    r"(?:mls?|litres?|liters?|kgs?|grams?|mg|%|ppm|"
    r"days?|hrs?|hours?|mins?|minutes?|weeks?|"
    r"acres?|hectares?|ha|cm|mm|l|g|m)\b",
    re.IGNORECASE,
)

_TIMING_PHRASE_RE = re.compile(
    r"\b(?:before|after|during|within|every|once|twice)\s+\w+(?:\s+\w+)?",
    re.IGNORECASE,
)

NEGATION_WORDS = {
    "not", "never", "no", "none", "cannot", "can't", "don't", "doesn't",
    "didn't", "shouldn't", "won't", "wouldn't", "without", "avoid",
}

HEDGE_WORDS = {
    "may", "might", "could", "can", "possibly", "sometimes", "generally",
    "usually", "often", "typically", "likely",
}

ABSOLUTE_WORDS = {
    "will", "always", "completely", "eliminate", "eliminates", "guarantee",
    "guarantees", "guaranteed", "definitely", "certainly", "entirely",
    "totally", "fully",
}

CONDITIONAL_MARKERS = {
    "if", "when", "unless", "provided", "once", "only",
}

# Deliberately small, curated lists - not exhaustive agricultural NER. A
# conservative heuristic that only catches what it names; the LLM
# second-opinion check (llm_client.check_meaning_preserved) is the layer
# meant to cover what this misses.
CROP_NAMES = {
    "paddy", "rice", "wheat", "maize", "corn", "cotton", "brinjal",
    "eggplant", "tomato", "soybean", "soyabean", "mustard", "groundnut",
    "peanut", "sugarcane", "onion", "potato", "chilli", "chili", "pulses",
    "gram", "banana", "mango", "wheat", "barley", "millet", "sorghum",
    "jowar", "bajra", "ragi", "pea", "peas", "cabbage", "cauliflower",
    "okra", "bhindi", "cucumber", "watermelon", "papaya", "coconut",
    "coffee", "tea", "jute", "sunflower", "sesame", "turmeric", "ginger",
    "garlic", "cumin", "coriander",
}

TREATMENT_TERMS = {
    "neem oil", "pheromone trap", "pheromone traps", "biological control",
    "chemical control", "cultural control", "mechanical control",
    "crop rotation", "mulching", "intercropping", "seed treatment",
    "foliar spray", "soil test", "drip irrigation", "flood irrigation",
    "mode of action", "trichoderma", "pseudomonas", "bordeaux mixture",
    "zinc sulphate", "farmyard manure", "green manure", "compost",
}


def split_sentences(text: str) -> list[str]:
    parts = _SENTENCE_SPLIT_RE.split(text.strip())
    return [p.strip() for p in parts if p.strip()]


def align_sentences(original: str, rewrite: str) -> list[tuple[str, str]] | None:
    """Returns (original_sentence, rewrite_sentence) pairs if the sentence
    counts match, else None - an unequal count (a rewrite that merged or
    split sentences) is treated as ambiguous alignment, not resolved."""
    orig = split_sentences(original)
    rew = split_sentences(rewrite)
    if len(orig) != len(rew):
        return None
    return list(zip(orig, rew))


def split_sections(text: str) -> list[str]:
    """Splits on blank lines - matches the real shape of every real
    multi-section draft seen in practice (an optional heading plus its
    paragraph, then a blank line, then the next one). A single-paragraph
    draft is just one section."""
    parts = re.split(r"\n\s*\n+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def align_sections_and_sentences(
    original: str, rewrite: str
) -> tuple[list[tuple[str, str]], list[int]] | None:
    """Section-aware alignment: pairs sections by position, then aligns
    sentences within each section pair. A section whose own sentence
    count doesn't match falls back to one whole-section pair (its index,
    1-based, is reported in the second return value) instead of failing
    the entire multi-section draft over one reworded paragraph - only a
    genuine difference in section *count* is treated as too ambiguous to
    check at all (Writing Assistant Build Plan, Revision 14, ISS-02 - a
    real test report showed the old whole-document sentence-count
    requirement rejecting 16/21 real multi-section drafts for exactly
    this reason). Returns None when section counts differ."""
    orig_sections = split_sections(original)
    rew_sections = split_sections(rewrite)
    if len(orig_sections) != len(rew_sections):
        return None

    pairs: list[tuple[str, str]] = []
    degraded_sections: list[int] = []
    for i, (orig_section, rew_section) in enumerate(zip(orig_sections, rew_sections), start=1):
        section_pairs = align_sentences(orig_section, rew_section)
        if section_pairs is not None:
            pairs.extend(section_pairs)
        else:
            pairs.append((orig_section, rew_section))
            degraded_sections.append(i)
    return pairs, degraded_sections


def _words(sentence: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", sentence.lower())


def extract_numbers_and_units(sentence: str) -> frozenset[str]:
    return frozenset(m.group(0).lower().replace(" ", "") for m in _UNIT_RE.finditer(sentence))


def extract_negations(sentence: str) -> frozenset[str]:
    return frozenset(w for w in _words(sentence) if w in NEGATION_WORDS)


def extract_certainty_markers(sentence: str) -> frozenset[str]:
    words = _words(sentence)
    return frozenset(w for w in words if w in HEDGE_WORDS or w in ABSOLUTE_WORDS)


def extract_certainty_polarities(sentence: str) -> frozenset[str]:
    """Which certainty *polarity* (hedge/absolute) is present - not which
    specific word. A same-polarity synonym swap (e.g. 'may' -> 'could') is
    a wording choice, not a claim-strength change; only a shift between
    polarities (or dropping one) should fail this check."""
    words = _words(sentence)
    polarities = set()
    if any(w in HEDGE_WORDS for w in words):
        polarities.add("hedge")
    if any(w in ABSOLUTE_WORDS for w in words):
        polarities.add("absolute")
    return frozenset(polarities)


def extract_crop_names(sentence: str) -> frozenset[str]:
    return frozenset(w for w in _words(sentence) if w in CROP_NAMES)


def extract_treatment_terms(sentence: str) -> frozenset[str]:
    lowered = sentence.lower()
    return frozenset(t for t in TREATMENT_TERMS if t in lowered)


def extract_timing_phrases(sentence: str) -> frozenset[str]:
    units = frozenset(m.group(0).lower() for m in _TIMING_PHRASE_RE.finditer(sentence))
    return units


def extract_conditional_markers(sentence: str) -> frozenset[str]:
    return frozenset(w for w in _words(sentence) if w in CONDITIONAL_MARKERS)
