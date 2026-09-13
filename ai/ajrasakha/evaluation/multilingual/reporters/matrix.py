"""Language Quality Matrix builder.

Produces a 30×6 matrix (scenarios × languages) of CaseStatus values,
with convenience aggregation methods for per-language and per-scenario
pass rates.

Output formats:
  - dict-of-dicts (in-memory)
  - CSV (pipe-delimited for readability)
  - Summary stats dict
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Optional

from ajrasakha.evaluation.multilingual.case_schema import CaseResult, CaseStatus
from ajrasakha.evaluation.multilingual.scenarios import SCENARIOS
from ajrasakha.evaluation.multilingual.languages import LANGUAGES, LANGUAGE_CODES


# Column order for the matrix
_LANG_CODES = LANGUAGE_CODES          # ["EN", "HI", "KN", "TA", "PA", "TE"]
_STATUS_SYMBOL = {
    CaseStatus.PASS:    "PASS",
    CaseStatus.FAIL:    "FAIL",
    CaseStatus.ERROR:   "ERROR",
    CaseStatus.BLOCKED: "BLOCKED",
    CaseStatus.SKIPPED: "SKIPPED",
}


def build_matrix(results: list[CaseResult]) -> dict[str, dict[str, str]]:
    """Build a (scenario_id → language_code → status_string) matrix.

    Missing cells (no result for that combination) default to "SKIPPED".
    """
    # Index results by (scenario_id, language_code)
    index: dict[tuple[str, str], CaseResult] = {}
    for r in results:
        key = (r.case.scenario_id, r.case.language_code)
        index[key] = r

    matrix: dict[str, dict[str, str]] = {}
    for scenario in SCENARIOS:
        row: dict[str, str] = {}
        for lang in LANGUAGES:
            result = index.get((scenario.id, lang.code))
            if result is None:
                row[lang.code] = CaseStatus.SKIPPED.value
            else:
                row[lang.code] = result.status.value
        matrix[scenario.id] = row

    return matrix


def matrix_summary(matrix: dict[str, dict[str, str]]) -> dict:
    """Compute per-language and per-scenario pass rates from the matrix.

    Returns a dict with:
        total_cases         int
        pass_count          int
        fail_count          int
        error_count         int
        blocked_count       int
        skipped_count       int
        pass_rate           float  (pass / (total - skipped))
        per_language        dict[lang_code, {"pass": int, "total": int, "rate": float}]
        per_scenario        dict[scenario_id, {"pass": int, "total": int, "rate": float}]
        worst_language      str  (lowest pass rate)
        worst_scenario      str  (lowest pass rate)
    """
    counts = {s.value: 0 for s in CaseStatus}

    per_language: dict[str, dict[str, int]] = {
        code: {"pass": 0, "fail": 0, "error": 0, "blocked": 0, "skipped": 0}
        for code in _LANG_CODES
    }
    per_scenario: dict[str, dict[str, int]] = {
        s.id: {"pass": 0, "fail": 0, "error": 0, "blocked": 0, "skipped": 0}
        for s in SCENARIOS
    }

    for scenario_id, lang_row in matrix.items():
        for lang_code, status_str in lang_row.items():
            status_lower = status_str.lower()
            counts[status_str] = counts.get(status_str, 0) + 1
            if lang_code in per_language:
                per_language[lang_code][status_lower] = (
                    per_language[lang_code].get(status_lower, 0) + 1
                )
            if scenario_id in per_scenario:
                per_scenario[scenario_id][status_lower] = (
                    per_scenario[scenario_id].get(status_lower, 0) + 1
                )

    total = sum(counts.values())
    eligible = total - counts.get("SKIPPED", 0)
    pass_count = counts.get("PASS", 0)
    pass_rate = round(pass_count / eligible, 4) if eligible > 0 else 0.0

    def _rate(d: dict[str, int]) -> float:
        p = d.get("pass", 0)
        t = sum(d.values()) - d.get("skipped", 0)
        return round(p / t, 4) if t > 0 else 0.0

    lang_stats = {
        code: {
            "pass": per_language[code]["pass"],
            "total": sum(per_language[code].values()) - per_language[code].get("skipped", 0),
            "rate": _rate(per_language[code]),
        }
        for code in _LANG_CODES
    }

    scenario_stats = {
        sid: {
            "pass": per_scenario[sid]["pass"],
            "total": sum(per_scenario[sid].values()) - per_scenario[sid].get("skipped", 0),
            "rate": _rate(per_scenario[sid]),
        }
        for sid in per_scenario
    }

    worst_lang = min(lang_stats, key=lambda k: lang_stats[k]["rate"]) if lang_stats else ""
    worst_scen = min(scenario_stats, key=lambda k: scenario_stats[k]["rate"]) if scenario_stats else ""

    return {
        "total_cases": total,
        "pass_count": pass_count,
        "fail_count": counts.get("FAIL", 0),
        "error_count": counts.get("ERROR", 0),
        "blocked_count": counts.get("BLOCKED", 0),
        "skipped_count": counts.get("SKIPPED", 0),
        "pass_rate": pass_rate,
        "per_language": lang_stats,
        "per_scenario": scenario_stats,
        "worst_language": worst_lang,
        "worst_scenario": worst_scen,
    }


def write_matrix_csv(
    matrix: dict[str, dict[str, str]],
    output_path: Path,
    results: Optional[list[CaseResult]] = None,
) -> None:
    """Write the Language Quality Matrix to a CSV file.

    Includes per-metric pass rate columns (language, disclaimer, lang_switch,
    terminology, GDB retrieval, DeepEval) when results list is supplied.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Index results per scenario if available
    scenario_results: dict[str, list[CaseResult]] = {}
    if results:
        for r in results:
            scenario_results.setdefault(r.case.scenario_id, []).append(r)

    metric_cols = [
        "language_pass_rate",
        "disclaimer_pass_rate",
        "lang_switch_pass_rate",
        "terminology_pass_rate",
        "gdb_pass_rate",
        "deepeval_pass_rate",
    ]

    # Header: scenario_id, scenario_name, domain, EN, HI, KN, TA, PA, TE (+ metrics if results present)
    scenario_meta = {s.id: (s.name, s.domain) for s in SCENARIOS}
    headers = ["scenario_id", "scenario_name", "domain"] + _LANG_CODES + (metric_cols if results else [])

    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for scenario_id, lang_row in matrix.items():
            name, domain = scenario_meta.get(scenario_id, ("", ""))
            row = {
                "scenario_id": scenario_id,
                "scenario_name": name,
                "domain": domain,
            }
            row.update(lang_row)

            if results:
                c_list = scenario_results.get(scenario_id, [])
                n = len(c_list)
                if n > 0:
                    row["language_pass_rate"] = f"{sum(1 for r in c_list if r.language_pass is True) / n:.1%}"
                    row["disclaimer_pass_rate"] = f"{sum(1 for r in c_list if r.disclaimer_pass is True) / n:.1%}"
                    row["lang_switch_pass_rate"] = f"{sum(1 for r in c_list if r.lang_switch_detected is False and r.language_segment_switch_detected is False) / n:.1%}"
                    row["terminology_pass_rate"] = f"{sum(1 for r in c_list if r.terminology_pass is True) / n:.1%}"
                    row["gdb_pass_rate"] = f"{sum(1 for r in c_list if r.gdb_retrieval_status == 'PASS') / n:.1%}"
                    row["deepeval_pass_rate"] = f"{sum(1 for r in c_list if r.deepeval_status == 'PASS') / n:.1%}"
                else:
                    for col in metric_cols:
                        row[col] = "0.0%"

            writer.writerow(row)

    print(f"Language Quality Matrix written to: {output_path.resolve()}")

