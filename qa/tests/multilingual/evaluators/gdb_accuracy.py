"""GDB (Golden Database) accuracy evaluator.

When AjraSakha answers a farming question, the system first retrieves
the relevant Golden Database entry by vector + lexical search and then
translates / rewrites it.  The 30 canonical scenarios in this suite
each declare the *expected* GDB entry id (``scenario["expected_gdb_id"]``)
and the list of *required keywords* (``scenario["required_keywords"]``)
that a correct retrieval must surface (location, crop, problem,
scheme name …).

This evaluator therefore checks two independent things:

1. **Identifier match** — does the response expose a GDB id (either
   from the chat metadata or inline in the answer text) that matches
   the scenario's expected id?

2. **Keyword coverage** — what fraction of the required keywords
   appear in the response text?  We require **≥ 80 % coverage** before
   declaring the retrieval correct, to absorb minor wording / ordering
   variation across language translations.
"""
from __future__ import annotations

from typing import Dict, List

from qa.tests.multilingual.translations.language_meta import (
    LANGUAGE_DISPLAY,
)


def _normalize(text: str) -> str:
    return (text or "").strip().lower()


def evaluate_gdb_accuracy(
    *,
    response_text: str,
    response_gdb_ids: List[str] | None,
    required_keywords: List[str],
    expected_gdb_id: str,
) -> Dict[str, object]:
    """Run the GDB accuracy evaluation.

    Returns a dict with: ``correct`` (bool), ``keyword_coverage`` (float),
    ``matched_keywords`` (list), ``missing_keywords`` (list),
    ``gdb_id_match`` (bool), ``expected_gdb_id``, ``observed_gdb_ids``.
    """
    text_lower = _normalize(response_text)

    matched: List[str] = []
    missing: List[str] = []
    for kw in required_keywords:
        if _normalize(kw) in text_lower:
            matched.append(kw)
        else:
            missing.append(kw)

    coverage = (
        len(matched) / len(required_keywords) if required_keywords else 0.0
    )

    id_match = False
    if response_gdb_ids:
        id_match = expected_gdb_id in response_gdb_ids
    # Fallback: sometimes the response surfaces the GDB id inline
    if not id_match and expected_gdb_id:
        id_match = _normalize(expected_gdb_id) in text_lower

    correct = bool(id_match) and coverage >= 0.80

    return {
        "correct": correct,
        "keyword_coverage": round(coverage, 4),
        "matched_keywords": matched,
        "missing_keywords": missing,
        "gdb_id_match": id_match,
        "expected_gdb_id": expected_gdb_id,
        "observed_gdb_ids": response_gdb_ids or [],
    }


__all__ = ["evaluate_gdb_accuracy"]


# Convenience: small helper used by the run_suite reporter.
def summarise_gdb_results(per_language_results: Dict[str, List[Dict]]) -> str:
    """Return a short markdown summary line for the report."""
    lines: List[str] = []
    for lang, results in per_language_results.items():
        total = len(results)
        correct = sum(1 for r in results if r["correct"])
        pct = (correct / total * 100.0) if total else 0.0
        lines.append(
            f"- **{LANGUAGE_DISPLAY.get(lang, lang)}**: "
            f"{correct}/{total} ({pct:.0f}%) GDB-correct"
        )
    return "\n".join(lines)