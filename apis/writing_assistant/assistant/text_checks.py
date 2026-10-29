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
    # \d already matches Devanagari digits too (confirmed: Python's \d is
    # Unicode-aware by default) - "din"/"dino" (Hinglish for day/days) is
    # added for transliterated Hindi, confirmed missing live against a
    # real "10 din baad" draft (Writing Assistant Build Plan, Revision 16,
    # ISS-16). Devanagari-script unit *words* (not digits) are still not
    # covered - a real, acknowledged gap, not attempted here given no
    # confirmed real example beyond the digit case.
    r"\b\d+(?:\.\d+)?\s*"
    r"(?:mls?|litres?|liters?|kgs?|grams?|mg|%|ppm|"
    r"days?|din|dinon|hrs?|hours?|mins?|minutes?|weeks?|"
    r"acres?|hectares?|ha|cm|mm|l|g|m)\b",
    re.IGNORECASE,
)

_TIMING_PHRASE_RE = re.compile(
    r"\b(before|after|during|within|every|once|twice)\b",
    re.IGNORECASE,
)

NEGATION_WORDS = {
    "not", "never", "no", "none", "cannot", "can't", "don't", "doesn't",
    "didn't", "shouldn't", "won't", "wouldn't", "without", "avoid",
    # Hindi (Devanagari script) - deliberately small and high-confidence
    # only (common, unambiguous words), not a general Hindi NLP effort.
    # "नहीं" (nahiṃ, "not/no"), "मत" (mat, "don't"),
    # "बिना" (bina, "without") (Revision 17, ISS-16).
    "नहीं", "मत", "बिना",
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
    # Hindi (Devanagari script) - the two most common crop names for this
    # dataset's own domain only, high-confidence. "धान" (dhān,
    # "paddy/rice"), "गेहूं" (gehūṃ, "wheat") (Revision 17, ISS-16).
    "धान", "गेहूं",
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
) -> tuple[list[tuple[str, str]], list[int | str]]:
    """Section-aware alignment: pairs sections by position, then aligns
    sentences within each section pair. A section whose own sentence
    count doesn't match falls back to one whole-section pair (its index,
    1-based, is reported in the second return value) instead of failing
    the entire multi-section draft over one reworded paragraph - only a
    genuine difference in section *count* is treated as too ambiguous to
    check at all (Writing Assistant Build Plan, Revision 14, ISS-02 - a
    real test report showed the old whole-document sentence-count
    requirement rejecting 16/21 real multi-section drafts for exactly
    this reason).

    A section-*count* mismatch itself now falls back one level further,
    to a single whole-document pair (reported as the literal string
    "document" in the second return value), instead of an outright
    reject - confirmed live (Revision 16, ISS-13) that this was still
    blocking most rewrites, including short ones well under the length
    that first motivated section-aware alignment. The LLM second-opinion
    check still runs independently as the deeper safety net whenever
    granularity is this coarse - this function itself never returns
    None anymore."""
    orig_sections = split_sections(original)
    rew_sections = split_sections(rewrite)
    if len(orig_sections) != len(rew_sections):
        return [(original.strip(), rewrite.strip())], ["document"]

    pairs: list[tuple[str, str]] = []
    degraded_sections: list[int | str] = []
    for i, (orig_section, rew_section) in enumerate(zip(orig_sections, rew_sections), start=1):
        section_pairs = align_sentences(orig_section, rew_section)
        if section_pairs is not None:
            pairs.extend(section_pairs)
        else:
            pairs.append((orig_section, rew_section))
            degraded_sections.append(i)
    return pairs, degraded_sections


def _words(sentence: str) -> list[str]:
    # ऀ-ॿ is the Devanagari Unicode block (Hindi script) - without
    # it, every word-based check (negation, crop names, conditionals,
    # significant_words) silently matched nothing at all on Hindi text,
    # confirmed live against a real Hindi draft (Writing Assistant Build
    # Plan, Revision 17, ISS-16).
    return re.findall(r"[A-Za-z'ऀ-ॿ]+", sentence.lower())


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
    """Returns which timing keywords (before/after/during/within/every/
    once/twice) appear - the keyword only, not the words that follow it.
    A rewrite rewording what comes after "before"/"within" etc. (e.g.
    "before harvesting the crop" -> "before harvest") isn't a timing
    change; only swapping the keyword itself (before <-> after) or
    dropping/adding one is. Numeric duration changes inside a timing
    phrase ("within 24 hours" -> "within 48 hours") are independently
    caught by extract_numbers_and_units - confirmed as a real false-
    positive source otherwise (Writing Assistant Build Plan, Revision 15)."""
    return frozenset(m.group(1).lower() for m in _TIMING_PHRASE_RE.finditer(sentence))


def extract_conditional_markers(sentence: str) -> frozenset[str]:
    return frozenset(w for w in _words(sentence) if w in CONDITIONAL_MARKERS)


# Deliberately small, generic - not domain-specific. Used only to tell
# "this text shares no real vocabulary with that topic" from "it does",
# a coarse signal, not a stand-in for the LLM's own semantic judgment.
_STOPWORDS = {
    "the", "and", "for", "are", "was", "were", "has", "have", "had",
    "will", "shall", "can", "may", "might", "must", "should", "would",
    "could", "not", "but", "you", "our", "their", "about", "after",
    "before", "when", "while", "where", "what", "which", "this", "that",
    "with", "from", "into", "your", "these", "those", "than", "then",
    "also", "such", "only", "once", "each", "both", "more", "most",
    "some", "same", "very", "just", "being", "been", "does", "did",
}


def significant_words(text: str) -> frozenset[str]:
    """Lowercase content words (length >= 4, minus a small stopword
    list) - a coarse 'is this topic even mentioned' signal, used as a
    deterministic safety net alongside (never instead of) the LLM's own
    semantic step-coverage judgment (Writing Assistant Build Plan,
    Revision 15, ISS-05)."""
    return frozenset(w for w in _words(text) if len(w) >= 4 and w not in _STOPWORDS)
