"""Roll-up recommendations for the AI team.

Given a populated :class:`LanguageQualityMatrix`, generate a
prioritised list of *actionable* recommendations before the national
rollout.  The recommendations are grouped by language and ordered by
severity (WEAK first) so the AI team can focus their sprint.

Each recommendation is a dict with:

* ``language``         — language code;
* ``language_display`` — human-friendly name;
* ``domain``           — domain (or ``"overall"``);
* ``severity``         — ``"WEAK"`` / ``"WATCH"``;
* ``metric``           — the failing metric (``"response_lang"``,
  ``"disclaimer"`` …);
* ``value``            — the observed pass-rate (0..1);
* ``recommendation``   — short actionable sentence for the AI team.
"""
from __future__ import annotations

from typing import Dict, List

from .language_quality_matrix import LanguageQualityMatrix
from qa.tests.multilingual.translations.language_meta import LANGUAGE_DISPLAY


def _advice_for(metric: str, language_display: str) -> str:
    """Return a one-line actionable recommendation for a failing metric."""
    table = {
        "gdb_accuracy": (
            f"Verify Golden DB coverage for {language_display} queries — "
            "missing entries are likely causing retrieval failures. "
            "Audit embedding recall and add at least 5 canonical entries "
            "per scenario in this language."
        ),
        "response_lang": (
            f"Pin the answer-generation prompt to keep responses in "
            f"{language_display}.  Add a per-language system prompt and "
            "block English-only outputs at the post-processor."
        ),
        "disclaimer": (
            f"Fix {language_display} localisation of the 2-hour advice-"
            "age disclaimer — the canonical i18n string is missing or "
            "not appended.  Check the disclaimer pipeline."
        ),
        "no_switch": (
            f"Stop mid-answer language switching in {language_display} "
            "responses — likely a routing bug in the answer-generation "
            "agent.  Hard-code the response language to the query."
        ),
        "transliteration": (
            f"Improve named-entity handling in {language_display} — "
            "crop, scheme and pesticide names are coming back in the "
            "wrong script.  Add a regional transliteration dictionary "
            "for these entities."
        ),
        "overall": (
            f"{language_display} needs a focused quality sprint before "
            "national rollout.  See specific failing metrics above."
        ),
    }
    return table.get(metric, f"Investigate {metric} in {language_display}.")


def generate_recommendations(
    matrix: LanguageQualityMatrix,
) -> List[Dict[str, object]]:
    """Return a sorted list of recommendations."""
    recs: List[Dict[str, object]] = []

    # Per-language overall
    for lang, totals in matrix.totals.items():
        overall = totals.get("overall", 0.0)
        verdict = totals.get("verdict", "n/a")
        if verdict == "STRONG":
            continue
        recs.append(
            {
                "language":         lang,
                "language_display": LANGUAGE_DISPLAY.get(lang, lang),
                "domain":           "overall",
                "severity":         verdict,
                "metric":           "overall",
                "value":            overall,
                "recommendation":   _advice_for("overall",
                                                LANGUAGE_DISPLAY.get(lang, lang)),
            }
        )

    # Per-cell WEAK / WATCH entries
    metric_keys = (
        "gdb_accuracy", "response_lang", "disclaimer",
        "no_switch", "transliteration",
    )
    for key, cell in matrix.cells.items():
        for metric in metric_keys:
            value = getattr(cell, metric)
            if value >= 0.90:
                continue
            severity = "WEAK" if value < 0.70 else "WATCH"
            recs.append(
                {
                    "language":         cell.language,
                    "language_display": LANGUAGE_DISPLAY.get(cell.language, cell.language),
                    "domain":           cell.domain,
                    "severity":         severity,
                    "metric":           metric,
                    "value":            value,
                    "recommendation":   _advice_for(
                        metric, LANGUAGE_DISPLAY.get(cell.language, cell.language)
                    ),
                }
            )

    # Sort: WEAK first, then WATCH, then by lowest value, then by domain
    severity_order = {"WEAK": 0, "WATCH": 1}
    recs.sort(
        key=lambda r: (
            severity_order.get(str(r["severity"]), 2),
            -float(r["value"]),
            str(r["domain"]),
            str(r["language"]),
        )
    )
    return recs


def format_recommendations_markdown(recs: List[Dict[str, object]]) -> str:
    """Return a Markdown-formatted recommendation report."""
    if not recs:
        return (
            "# AjraSakha — Multilingual Roll-out Recommendations\n\n"
            "All languages are at STRONG (>90%) pass rate. "
            "No remediation required before national rollout.\n"
        )

    lines = [
        "# AjraSakha — Multilingual Roll-out Recommendations",
        "",
        f"_{len(recs)} recommendation(s), ordered by severity "
        "(🔴 WEAK first, 🟡 WATCH)._",
        "",
    ]

    by_lang: Dict[str, List[Dict[str, object]]] = {}
    for r in recs:
        by_lang.setdefault(str(r["language_display"]), []).append(r)

    for lang_display, items in by_lang.items():
        lines.append(f"## {lang_display}")
        lines.append("")
        for r in items:
            emoji = "🔴" if r["severity"] == "WEAK" else "🟡"
            value_pct = int(round(float(r["value"]) * 100))
            lines.append(
                f"- {emoji} **{r['severity']}** — "
                f"`{r['domain']}/{r['metric']}` ({value_pct}%) — {r['recommendation']}"
            )
        lines.append("")

    return "\n".join(lines)


__all__ = ["generate_recommendations", "format_recommendations_markdown"]