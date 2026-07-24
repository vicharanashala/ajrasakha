"""Domain × Language matrix reporter (Step 014).

Produces a 5 domain_group × 6 language breakdown of test results,
with full denominator, PASS, FAIL, ERROR, BLOCKED, SKIPPED counts.
This is distinct from the 30-scenario × 6-language matrix in matrix.py.

Output formats:
  - dict of dicts (in-memory)
  - CSV (pipe-delimited)
  - Summary stats dict
"""

from __future__ import annotations

import csv
from pathlib import Path

from ajrasakha.evaluation.multilingual.case_schema import CaseResult, CaseStatus
from ajrasakha.evaluation.multilingual.languages import LANGUAGE_CODES
from ajrasakha.evaluation.multilingual.scenarios import _REQUIRED_DOMAIN_GROUPS

_DOMAIN_GROUPS = sorted(_REQUIRED_DOMAIN_GROUPS)  # consistent sort
_LANG_CODES = LANGUAGE_CODES

_COUNT_KEYS = ["total", "PASS", "FAIL", "ERROR", "BLOCKED", "SKIPPED", "SKIPPED_MISSING_TRANSLATION"]


def _empty_cell() -> dict:
    return {"total": 0, "PASS": 0, "FAIL": 0, "ERROR": 0, "BLOCKED": 0, "SKIPPED": 0, "SKIPPED_MISSING_TRANSLATION": 0}


def build_domain_matrix(results: list[CaseResult]) -> dict[str, dict[str, dict]]:
    """Build domain_group → language_code → {counts} matrix.

    Each cell is a dict with keys: total, PASS, FAIL, ERROR, BLOCKED, SKIPPED.
    """
    matrix: dict[str, dict[str, dict]] = {
        g: {lang: _empty_cell() for lang in _LANG_CODES}
        for g in _DOMAIN_GROUPS
    }

    for r in results:
        grp = r.case.domain_group
        lang = r.case.language_code
        status = r.status.value

        if grp not in matrix:
            matrix[grp] = {}
        if lang not in matrix[grp]:
            matrix[grp][lang] = _empty_cell()

        matrix[grp][lang][status] = matrix[grp][lang].get(status, 0) + 1
        # Only count cases in the denominator when there is real data to evaluate.
        # SKIPPED_MISSING_TRANSLATION cases lack a target-language query, so they
        # must be excluded from 'total' to avoid deflating domain pass rates.
        if status != "SKIPPED_MISSING_TRANSLATION":
            matrix[grp][lang]["total"] += 1

    return matrix


def domain_matrix_summary(matrix: dict[str, dict[str, dict]]) -> dict:
    """Return per-domain-group pass rates and overall stats."""
    summary: dict = {"by_domain_group": {}, "overall": {}}
    total_all = 0
    pass_all = 0

    for grp in _DOMAIN_GROUPS:
        lang_map = matrix.get(grp, {})
        grp_total = sum(cell["total"] for cell in lang_map.values())
        grp_pass = sum(cell.get("PASS", 0) for cell in lang_map.values())
        summary["by_domain_group"][grp] = {
            "total": grp_total,
            "pass": grp_pass,
            "pass_rate": round(grp_pass / grp_total, 4) if grp_total else 0.0,
        }
        total_all += grp_total
        pass_all += grp_pass

    summary["overall"] = {
        "total": total_all,
        "pass": pass_all,
        "pass_rate": round(pass_all / total_all, 4) if total_all else 0.0,
    }
    return summary


def write_domain_matrix_csv(
    matrix: dict[str, dict[str, dict]],
    output_path: str | Path,
) -> None:
    """Write domain × language matrix to CSV."""
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    with output.open("w", newline="", encoding="utf-8") as f:
        # Header: domain_group, EN_total, EN_PASS, EN_FAIL, ..., TE_SKIPPED, EN_pass_rate...
        header = ["domain_group"]
        for lang in _LANG_CODES:
            for key in _COUNT_KEYS:
                header.append(f"{lang}_{key}")
            header.append(f"{lang}_pass_rate")
        header.extend(["row_total", "row_pass", "row_pass_rate"])

        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()

        for grp in _DOMAIN_GROUPS:
            row: dict = {"domain_group": grp}
            row_total = 0
            row_pass = 0
            for lang in _LANG_CODES:
                cell = matrix.get(grp, {}).get(lang, _empty_cell())
                for key in _COUNT_KEYS:
                    row[f"{lang}_{key}"] = cell.get(key, 0)
                
                c_total = cell.get("total", 0)
                c_pass = cell.get("PASS", 0)
                if c_total > 0:
                    row[f"{lang}_pass_rate"] = f"{c_pass}/{c_total} ({c_pass/c_total:.1%})"
                else:
                    row[f"{lang}_pass_rate"] = "N/A"
                
                row_total += c_total
                row_pass += c_pass
            row["row_total"] = row_total
            row["row_pass"] = row_pass
            row["row_pass_rate"] = (
                f"{row_pass}/{row_total} ({row_pass / row_total:.1%})" if row_total else "N/A"
            )
            writer.writerow(row)
