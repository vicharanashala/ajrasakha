"""
Expand a validated crop name into all equivalent spellings stored for a state.

Uses reviewer_values.state_crops_reviewer_dataset plus plural/singular normalization
so vectorSearch filters can use details.crop $in [...] across Potato/POTATO/potato etc.
"""

from __future__ import annotations

import reviewer_values

# Irregular or ambiguous plural forms -> canonical comparison key (lowercase).
_IRREGULAR_CANONICAL = {
    "potatoes": "potato",
    "potato": "potato",
    "tomatoes": "tomato",
    "tomato": "tomato",
    "potatos": "potato",
}


def _canonical_key_single(token: str) -> str:
    """Map one crop token to a normalized key for plural/case-insensitive grouping."""
    w = (token or "").strip().lower()
    if not w:
        return w
    if w in _IRREGULAR_CANONICAL:
        return _IRREGULAR_CANONICAL[w]
    # chillies -> chilli style (drop trailing es after ...ie)
    if w.endswith("ies") and len(w) > 4:
        trial = w[:-2]
        if len(trial) >= 3:
            return trial
        return w[:-3] + "y"
    if w.endswith("es") and len(w) > 3:
        base = w[:-2]
        if base:
            return base
    if w.endswith("s") and len(w) > 2:
        return w[:-1]
    return w


def _compound_includes_crop(compound_entry: str, matched_crop: str) -> bool:
    """True if a comma-separated crop list contains the matched crop (by canonical key)."""
    parts = [p.strip() for p in compound_entry.split(",") if p.strip()]
    if len(parts) <= 1:
        return False
    mk = _canonical_key_single(matched_crop)
    m_plain = matched_crop.strip().lower()
    for p in parts:
        if p.strip().lower() == m_plain:
            return True
        if _canonical_key_single(p) == mk:
            return True
    return False


def expand_crop_variants_for_state(state: str, matched_crop: str) -> list[str]:
    """
    Return distinct crop strings from reviewer_values for this state that belong to the
    same crop family as matched_crop (case variants, plural/singular, compound lists).

    Compound entries like "Wheat, Paddy, Sugarcane" are included when any segment matches.
    """
    crop = (matched_crop or "").strip()
    if not crop:
        return []

    valid_crops = reviewer_values.state_crops_reviewer_dataset.get(state, []) or []

    # Whole-string compound from user (no plural splitting across commas).
    if "," in crop:
        norm = crop.lower()
        exact_variants = {
            entry
            for entry in valid_crops
            if isinstance(entry, str) and entry.strip().lower() == norm
        }
        if exact_variants:
            return sorted(exact_variants, key=lambda x: (x.lower(), x))
        return [crop]

    mk = _canonical_key_single(crop)
    variants: set[str] = set()

    for entry in valid_crops:
        if not isinstance(entry, str):
            continue
        e = entry.strip()
        if not e:
            continue
        if "," in e:
            if _compound_includes_crop(e, crop):
                variants.add(entry)
            continue
        if _canonical_key_single(e) == mk:
            variants.add(entry)

    if not variants:
        return [crop]

    return sorted(variants, key=lambda x: (x.lower(), x))
