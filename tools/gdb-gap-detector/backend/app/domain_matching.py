"""
Normalizes domain names for matching purposes.

Found this issue while testing against the real staging data: raw_queries
and gdb_entries use different wording for the same topics, e.g.
"Disease" vs "Crop Disease", "Pest" vs "Pest Control", "Fertilizer" vs
"Fertilizers". Without this, the coverage heatmap always shows 0% or
100% since exact string matching never finds an overlap.

This is a quick heuristic, not something verified against an actual
domain taxonomy doc - worth checking with whoever owns that list.
"""

from __future__ import annotations
import re

# words that show up as a modifier in one collection but not the other
_STRIP_WORDS = {"crop", "control", "management", "general"}


def normalize_domain(raw: str) -> str:
    """
    Lowercases, drops the words above, and strips a trailing 's' for basic
    singular/plural handling. Only for matching, not for display.

    "Disease" / "Crop Disease" -> "disease"
    "Pest" / "Pest Control" -> "pest"
    "Fertilizer" / "Fertilizers" -> "fertilizer"
    """
    if not raw:
        return ""
    words = re.findall(r"[a-zA-Z]+", raw.lower())
    words = [w for w in words if w not in _STRIP_WORDS]
    normalized = " ".join(words).strip()
    if normalized.endswith("s") and len(normalized) > 3:
        normalized = normalized[:-1]
    return normalized
