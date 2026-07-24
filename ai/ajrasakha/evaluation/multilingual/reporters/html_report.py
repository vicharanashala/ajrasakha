"""HTML report generator for the Multilingual Testing Suite.

Produces a single self-contained HTML file with:
  - Summary banner (total / pass / fail / blocked / skipped)
  - Language Quality Matrix (30×6 color-coded grid)
  - Full results table (all 180 cases with all validator columns)
  - Recommendations section
  - Command execution log

Design: uses only inline CSS (no external deps, safe to email/share).
"""

from __future__ import annotations

import html
from datetime import datetime
from pathlib import Path
from typing import Optional

from ajrasakha.evaluation.multilingual.case_schema import CaseResult, CaseStatus
from ajrasakha.evaluation.multilingual.reporters.recommendations import Recommendation
from ajrasakha.evaluation.multilingual.languages import LANGUAGES


# Status → CSS class
_CSS_CLASS = {
    "PASS": "pass",
    "FAIL": "fail",
    "ERROR": "error",
    "BLOCKED": "blocked",
    "SKIPPED": "skipped",
}

_PRIORITY_CLASS = {
    "CRITICAL": "fail",
    "HIGH": "error",
    "MEDIUM": "blocked",
    "INFO": "info",
}


def _e(s: object) -> str:
    """HTML-escape a string."""
    return html.escape(str(s or ""))


def _matrix_html(matrix: dict[str, dict[str, str]]) -> str:
    """Render the Language Quality Matrix as an HTML table."""
    lang_codes = [lang.code for lang in LANGUAGES]
    lang_names = [lang.name for lang in LANGUAGES]

    header_cells = "".join(
        f"<th>{_e(name)}<br><small>{_e(code)}</small></th>"
        for code, name in zip(lang_codes, lang_names)
    )

    rows_html = []
    for scenario_id, lang_row in matrix.items():
        cells = "".join(
            f"<td class='{_CSS_CLASS.get(lang_row.get(code, 'SKIPPED'), 'skipped')}'>"
            f"{_e(lang_row.get(code, 'SKIPPED'))}</td>"
            for code in lang_codes
        )
        rows_html.append(
            f"<tr><td class='scenario-id'>{_e(scenario_id)}</td>{cells}</tr>"
        )

    return f"""
    <table class='matrix-table'>
      <thead>
        <tr>
          <th>Scenario</th>
          {header_cells}
        </tr>
      </thead>
      <tbody>
        {''.join(rows_html)}
      </tbody>
    </table>
    """


def _results_table_html(results: list[CaseResult]) -> str:
    """Render the full results table."""
    rows_html = []
    for r in results:
        status_class = _CSS_CLASS.get(r.status.value, "skipped")
        row = r.to_row()
        rows_html.append(f"""
        <tr>
          <td>{_e(row['case_id'])}</td>
          <td>{_e(row['scenario_id'])}</td>
          <td>{_e(row['language_code'])}</td>
          <td>{_e(row['domain'])}</td>
          <td class='{status_class}'>{_e(row['status'])}</td>
          <td>{_e(row['language_pass'])}</td>
          <td>{_e(row['disclaimer_pass'])}</td>
          <td>{_e(row['lang_switch_detected'])}</td>
          <td>{_e(row['terminology_pass'])}</td>
          <td>{_e(row['routing_pass'])}</td>
          <td>{_e(row['translation_review_status'])}</td>
          <td class='detail'>{_e(row['error'] or row['disclaimer_reason'] or row['language_reason'])}</td>
        </tr>
        """)

    return f"""
    <table>
      <thead>
        <tr>
          <th>Case ID</th>
          <th>Scenario</th>
          <th>Lang</th>
          <th>Domain</th>
          <th>Status</th>
          <th>Lang✓</th>
          <th>Disclaimer✓</th>
          <th>Switch?</th>
          <th>Terms✓</th>
          <th>Routing✓</th>
          <th>Review</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {''.join(rows_html)}
      </tbody>
    </table>
    """


def _recommendations_html(recs: list[Recommendation]) -> str:
    """Render recommendations as an HTML list."""
    if not recs:
        return "<p>No recommendations generated.</p>"

    items = []
    for rec in recs:
        pclass = _PRIORITY_CLASS.get(rec.priority, "info")
        items.append(f"""
        <div class='rec-item {pclass}-border'>
          <span class='badge {pclass}'>{_e(rec.priority)}</span>
          <strong>{_e(rec.category)}</strong><br>
          <em>Finding:</em> {_e(rec.finding)}<br>
          <em>Recommendation:</em> {_e(rec.recommendation)}<br>
          <small><em>Evidence:</em> {_e(rec.evidence)}</small>
        </div>
        """)

    return "\n".join(items)


_CSS = """
body { font-family: Arial, sans-serif; margin: 24px; background: #f5f5f5; color: #222; }
.summary { padding: 16px; border-radius: 8px; background: white; margin-bottom: 24px; border-left: 8px solid #178a3b; }
.summary.has-failures { border-left-color: #c62828; }
section { background: white; padding: 16px; border-radius: 8px; margin-bottom: 20px; overflow-x: auto; }
h1 { margin: 0 0 8px 0; }
h2 { margin-top: 0; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; font-size: 13px; }
th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #efefef; font-size: 12px; }
.pass   { color: #178a3b; font-weight: bold; }
.fail   { color: #c62828; font-weight: bold; }
.error  { color: #e65100; font-weight: bold; }
.blocked { color: #6a1b9a; font-weight: bold; }
.skipped { color: #888; }
.info   { color: #1565c0; }
.scenario-id { font-family: monospace; font-size: 12px; }
.matrix-table td { text-align: center; min-width: 70px; }
.detail { font-size: 11px; max-width: 300px; color: #555; }
.rec-item { margin: 8px 0; padding: 10px; border-radius: 6px; background: #fafafa; border-left: 4px solid #ccc; }
.pass-border { border-left-color: #178a3b; }
.fail-border { border-left-color: #c62828; }
.error-border { border-left-color: #e65100; }
.blocked-border { border-left-color: #6a1b9a; }
.info-border { border-left-color: #1565c0; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;
         color: white; margin-right: 6px; }
.badge.pass    { background: #178a3b; }
.badge.fail    { background: #c62828; }
.badge.error   { background: #e65100; }
.badge.blocked { background: #6a1b9a; }
.badge.info    { background: #1565c0; }
"""


def write_html_report(
    results: list[CaseResult],
    matrix: dict[str, dict[str, str]],
    summary: dict,
    recs: list[Recommendation],
    output_path: Path,
    mode: str = "mock",
) -> None:
    """Write the complete HTML report."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    total = summary.get("total_cases", 0)
    passed = summary.get("pass_count", 0)
    failed = summary.get("fail_count", 0)
    blocked = summary.get("blocked_count", 0)
    skipped = summary.get("skipped_count", 0)
    pass_rate = summary.get("pass_rate", 0.0)

    overall = "PASS" if failed == 0 and summary.get("error_count", 0) == 0 else "FAIL"
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    has_failures_class = "has-failures" if overall == "FAIL" else ""

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AjraSakha Multilingual Test Suite — {mode.upper()} Report</title>
  <style>{_CSS}</style>
</head>
<body>
  <div class='summary {has_failures_class}'>
    <h1>AjraSakha Multilingual Testing Suite</h1>
    <h2>Mode: {_e(mode.upper())} | Overall: <span class='{overall.lower()}'>{_e(overall)}</span></h2>
    <p>Generated: {_e(generated_at)} | 
       Total: {total} | 
       <span class='pass'>Pass: {passed}</span> |
       <span class='fail'>Fail: {failed}</span> |
       <span class='error'>Error: {summary.get('error_count', 0)}</span> |
       <span class='blocked'>Blocked: {blocked}</span> |
       <span class='skipped'>Skipped: {skipped}</span> |
       Pass rate: {pass_rate:.1%}
    </p>
    <p><em>Worst language: {_e(summary.get('worst_language', 'N/A'))} | 
       Worst scenario: {_e(summary.get('worst_scenario', 'N/A'))}</em></p>
  </div>

  <section>
    <h2>Language Quality Matrix (30 Scenarios × 6 Languages)</h2>
    {_matrix_html(matrix)}
  </section>

  <section>
    <h2>Recommendations</h2>
    {_recommendations_html(recs)}
  </section>

  <section>
    <h2>Full Results ({total} cases)</h2>
    {_results_table_html(results)}
  </section>

</body>
</html>"""

    output_path.write_text(html_content, encoding="utf-8")
    print(f"HTML report written to: {output_path.resolve()}")
