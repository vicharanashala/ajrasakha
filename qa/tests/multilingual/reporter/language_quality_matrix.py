"""Language Quality Matrix — the headline deliverable of Project 4.

For every (domain, language) pair we report:

* ``n_cases``        — number of test cases run;
* ``gdb_accuracy``   — fraction of cases where the expected GDB
  entry was retrieved;
* ``response_lang``  — fraction of cases where the response was in
  the same language as the query;
* ``disclaimer``     — fraction of cases where the 2-hour
  disclaimer appeared in the correct language;
* ``no_switch``      — fraction of cases with no mid-answer
  language switch;
* ``transliteration``— fraction of cases where required named
  entities were recognised;
* ``overall``        — weighted overall pass rate;
* ``verdict``        — ``STRONG`` / ``WATCH`` / ``WEAK`` based on
  ``overall``.

The matrix can be written to CSV (machine readable), Markdown
(human readable) or JSON (for downstream dashboards).
"""
from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List

from qa.tests.multilingual.deep_eval import MultilingualLLMScore
from qa.tests.multilingual.translations.language_meta import (
    LANGUAGE_DISPLAY,
    LANGUAGE_LABELS,
    SUPPORTED_LANGUAGES,
)


@dataclass
class CellStats:
    """Aggregated stats for one (domain, language) cell."""

    domain: str
    language: str
    n_cases: int = 0
    gdb_accuracy: float = 0.0
    response_lang: float = 0.0
    disclaimer: float = 0.0
    no_switch: float = 0.0
    transliteration: float = 0.0
    overall: float = 0.0
    verdict: str = "n/a"

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


@dataclass
class LanguageQualityMatrix:
    """Container for the matrix with rendering helpers."""

    domains: List[str] = field(default_factory=list)
    languages: List[str] = field(default_factory=list)
    cells: Dict[str, CellStats] = field(default_factory=dict)
    totals: Dict[str, Dict[str, float]] = field(default_factory=dict)

    # ------------------------------------------------------------------
    # Builders
    # ------------------------------------------------------------------

    @classmethod
    def from_scores(cls, scores: List[MultilingualLLMScore]) -> "LanguageQualityMatrix":
        mtx = cls()
        mtx.languages = list(SUPPORTED_LANGUAGES)
        bucket: Dict[str, List[MultilingualLLMScore]] = {}
        for s in scores:
            bucket.setdefault(f"{s.domain}|{s.language}", []).append(s)
            mtx.domains.append(s.domain)
        mtx.domains = sorted(set(mtx.domains))

        for key, items in bucket.items():
            domain, lang = key.split("|", 1)
            n = len(items)
            cell = CellStats(domain=domain, language=lang, n_cases=n)
            cell.gdb_accuracy    = _mean([s.gdb_accuracy     for s in items])
            cell.response_lang   = _mean([s.response_language for s in items])
            cell.disclaimer      = _mean([s.disclaimer_present for s in items])
            cell.no_switch       = _mean([s.no_mid_answer_switch for s in items])
            cell.transliteration = _mean([s.transliteration   for s in items])
            cell.overall         = _mean([s.overall           for s in items])
            cell.verdict         = _verdict(cell.overall)
            mtx.cells[key] = cell

        # Per-language column totals
        for lang in mtx.languages:
            lang_cells = [c for c in mtx.cells.values() if c.language == lang]
            if not lang_cells:
                continue
            mtx.totals[lang] = {
                "n_cases":        sum(c.n_cases for c in lang_cells),
                "gdb_accuracy":   _mean([c.gdb_accuracy   for c in lang_cells]),
                "response_lang":  _mean([c.response_lang  for c in lang_cells]),
                "disclaimer":     _mean([c.disclaimer     for c in lang_cells]),
                "no_switch":      _mean([c.no_switch      for c in lang_cells]),
                "transliteration":_mean([c.transliteration for c in lang_cells]),
                "overall":        _mean([c.overall        for c in lang_cells]),
            }
            mtx.totals[lang]["verdict"] = _verdict(mtx.totals[lang]["overall"])
        return mtx

    # ------------------------------------------------------------------
    # Renderers
    # ------------------------------------------------------------------

    def to_csv(self) -> str:
        """Return a CSV string.  Rows = domains, columns = languages."""
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["domain"]
            + [LANGUAGE_DISPLAY[lang] for lang in self.languages]
            + ["verdict_avg"]
        )
        for domain in self.domains:
            row = [domain]
            verdicts: List[str] = []
            for lang in self.languages:
                cell = self.cells.get(f"{domain}|{lang}")
                if not cell:
                    row.append("-")
                    continue
                pct = int(round(cell.overall * 100))
                row.append(f"{pct}% ({_verdict_short(cell.verdict)})")
                verdicts.append(cell.verdict)
            row.append(_mode(verdicts))
            writer.writerow(row)
        # totals row
        totals = ["ALL"]
        verdicts = []
        for lang in self.languages:
            t = self.totals.get(lang, {})
            pct = int(round(t.get("overall", 0.0) * 100))
            totals.append(f"{pct}% ({_verdict_short(t.get('verdict', 'n/a'))})")
            if t:
                verdicts.append(t["verdict"])
        totals.append(_mode(verdicts))
        writer.writerow(totals)
        return buf.getvalue()

    def to_markdown(self) -> str:
        """Return a Markdown table with emoji-coded verdicts."""
        lines = [
            "# AjraSakha — Language Quality Matrix",
            "",
            "*Pass rate per (domain × language) cell. Cells marked "
            "🟢 ≥ 90 %, 🟡 70–89 %, 🔴 < 70 %.*",
            "",
            "| Domain | "
            + " | ".join(LANGUAGE_DISPLAY[l] for l in self.languages)
            + " | Domain Verdict |",
            "| --- | "
            + " | ".join("---" for _ in self.languages)
            + " | --- |",
        ]
        for domain in self.domains:
            row = [domain]
            verdicts = []
            for lang in self.languages:
                cell = self.cells.get(f"{domain}|{lang}")
                if not cell:
                    row.append("—")
                    continue
                pct = int(round(cell.overall * 100))
                row.append(f"{_emoji(cell.verdict)} {pct}%")
                verdicts.append(cell.verdict)
            row.append(_mode(verdicts))
            lines.append("| " + " | ".join(row) + " |")

        # Totals
        row = ["**ALL**"]
        verdicts = []
        for lang in self.languages:
            t = self.totals.get(lang, {})
            pct = int(round(t.get("overall", 0.0) * 100))
            row.append(f"{_emoji(t.get('verdict', 'n/a'))} {pct}%")
            if t:
                verdicts.append(t["verdict"])
        row.append(_mode(verdicts))
        lines.append("| " + " | ".join(row) + " |")
        lines.append("")
        lines.append(
            "_Domain Verdict = mode of language verdicts in that row._"
        )
        return "\n".join(lines)

    def to_json(self) -> str:
        """Return the full matrix as JSON."""
        return json.dumps(
            {
                "domains": self.domains,
                "languages": self.languages,
                "cells": {k: v.to_dict() for k, v in self.cells.items()},
                "totals": self.totals,
            },
            ensure_ascii=False,
            indent=2,
        )

    def write_artifacts(self, out_dir: str | Path) -> Dict[str, str]:
        """Write CSV / Markdown / JSON to ``out_dir``.

        Returns a dict of written file paths keyed by extension.
        """
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        paths = {
            "csv":     out / "language_quality_matrix.csv",
            "md":      out / "language_quality_matrix.md",
            "json":    out / "language_quality_matrix.json",
        }
        paths["csv"].write_text(self.to_csv(), encoding="utf-8")
        paths["md"].write_text(self.to_markdown(), encoding="utf-8")
        paths["json"].write_text(self.to_json(), encoding="utf-8")
        return {k: str(p) for k, p in paths.items()}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mean(values: List[float]) -> float:
    return round(sum(values) / len(values), 4) if values else 0.0


def _verdict(overall: float) -> str:
    if overall >= 0.90:
        return "STRONG"
    if overall >= 0.70:
        return "WATCH"
    return "WEAK"


def _verdict_short(verdict: str) -> str:
    return {"STRONG": "🟢", "WATCH": "🟡", "WEAK": "🔴"}.get(verdict, "·")


def _emoji(verdict: str) -> str:
    return _verdict_short(verdict)


def _mode(items: List[str]) -> str:
    if not items:
        return "—"
    counts: Dict[str, int] = {}
    for it in items:
        counts[it] = counts.get(it, 0) + 1
    # bias ordering: WEAK < WATCH < STRONG for tie-breaking
    return sorted(
        counts.items(),
        key=lambda kv: (-kv[1], {"WEAK": 0, "WATCH": 1, "STRONG": 2}.get(kv[0], 3)),
    )[0][0]


def build_matrix(scores: List[MultilingualLLMScore]) -> LanguageQualityMatrix:
    """Convenience wrapper around ``LanguageQualityMatrix.from_scores``."""
    return LanguageQualityMatrix.from_scores(scores)


__all__ = ["LanguageQualityMatrix", "CellStats", "build_matrix"]