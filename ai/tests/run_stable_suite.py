import csv
import html
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path.cwd()
REPORT_DIR = ROOT / "tests" / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

COMBINED_CSV = REPORT_DIR / "stable_suite_report.csv"
COMBINED_HTML = REPORT_DIR / "stable_suite_report.html"


COMMANDS = [
    {
        "layer": "Layer 1 - API Contracts",
        "name": "api_contracts",
        "command": [sys.executable, "-m", "tests.api.run_api_contracts"],
        "report": ROOT / "tests" / "api" / "reports" / "api_contract_report.csv",
    },
    {
        "layer": "Layer 2 - MCP Connectivity",
        "name": "mcp_connectivity",
        "command": [sys.executable, "-m", "tests.mcp.mcp_connectivity"],
        "report": ROOT / "tests" / "api" / "reports" / "mcp_connectivity_report.csv",
    },
    {
        "layer": "Layer 3 - Stable LangGraph Scenarios",
        "name": "stable_langgraph",
        "command": [sys.executable, "-m", "ajrasakha.evaluation.run", "--mode", "live", "--stable-only"],
        "report": ROOT / "evaluation_report_live.csv",
    },

   
]


def run_command(command):
    completed = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        shell=False,
    )
    return completed.returncode, completed.stdout, completed.stderr


def normalize_bool(value):
    return str(value).strip().lower() in {"true", "1", "yes", "pass", "passed"}


# Quality-score columns evaluate_response_quality() writes (see answer_eval.py's
# flattening loop and summary.py's QUALITY_METRICS). Layer 3's evaluation_report
# CSV has these; Layer 1/2's CSVs don't, so these are simply blank on those rows -
# same schema across every row, populated where the source data has it.
QUALITY_SCORE_COLUMNS = [
    "answerrelevancymetric_score",
    "faithfulnessmetric_score",
    "contextualrelevancymetric_score",
    "gdbmatchscore_score",
    "cropcorrectness_score",
    "treatmentcorrectness_score",
    "regioncorrectness_score",
]


def read_report_rows(layer, report_path):
    rows = []

    if not report_path.exists():
        return [
            {
                "layer": layer,
                "service": "",
                "name": report_path.name,
                "domain": "",
                "status": "FAIL",
                "status_code": "",
                "latency_seconds": "",
                "error": f"Report not found: {report_path}",
                "details": "",
                **{col: "" for col in QUALITY_SCORE_COLUMNS},
            }
        ]

    with report_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            passed_value = (
                row.get("passed")
                or row.get("technical_pass")
                or row.get("status_pass")
                or row.get("overall_pass")
                or ""
            )

            passed = normalize_bool(passed_value)

            rows.append(
                {
                    "layer": layer,
                    "service": row.get("service", ""),
                    "name": row.get("name", row.get("case_name", "")),
                    "domain": row.get("expected_domain", ""),
                    "status": "PASS" if passed else "FAIL",
                    "status_code": row.get("status_code", row.get("http_status", "")),
                    "latency_seconds": row.get("latency_seconds", row.get("latency", "")),
                    "error": row.get("error", row.get("failure_reason", "")),
                    "details": row.get("triage_category", row.get("response_text", ""))[:500],
                    **{col: row.get(col, "") for col in QUALITY_SCORE_COLUMNS},
                }
            )

    return rows


def write_combined_csv(rows):
    fields = [
        "layer",
        "service",
        "name",
        "domain",
        "status",
        "status_code",
        "latency_seconds",
        "error",
        "details",
        *QUALITY_SCORE_COLUMNS,
    ]

    with COMBINED_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


_QUALITY_SCORE_LABELS = {
    "answerrelevancymetric_score": "AR",
    "faithfulnessmetric_score": "Faith",
    "contextualrelevancymetric_score": "CtxRel",
    "gdbmatchscore_score": "GDB",
    "cropcorrectness_score": "Crop",
    "treatmentcorrectness_score": "Treat",
    "regioncorrectness_score": "Region",
}


def _format_quality_scores(row) -> str:
    """Compact 'AR 0.92 · Faith 0.88 · ...' summary; blank when a row has no
    quality data at all (Layer 1/2 rows, or quality scoring disabled)."""
    parts = []
    for col, label in _QUALITY_SCORE_LABELS.items():
        value = row.get(col, "")
        if value == "" or value is None:
            continue
        try:
            parts.append(f"{label} {float(value):.2f}")
        except (TypeError, ValueError):
            continue
    return " · ".join(parts)


def write_html(rows, command_results):
    total = len(rows)
    passed = sum(1 for row in rows if row["status"] == "PASS")
    failed = total - passed
    overall = "PASS" if failed == 0 else "FAIL"

    layers = []
    for row in rows:
        if row["layer"] not in layers:
            layers.append(row["layer"])

    layer_sections = []

    for layer in layers:
        layer_rows = [row for row in rows if row["layer"] == layer]
        layer_passed = sum(1 for row in layer_rows if row["status"] == "PASS")
        layer_failed = len(layer_rows) - layer_passed
        layer_status = "PASS" if layer_failed == 0 else "FAIL"

        table_rows = "\n".join(
            f"""
            <tr>
                <td>{html.escape(row["service"])}</td>
                <td>{html.escape(row["name"])}</td>
                <td>{html.escape(row.get("domain", ""))}</td>
                <td class="{row["status"].lower()}">{row["status"]}</td>
                <td>{html.escape(str(row["status_code"]))}</td>
                <td>{html.escape(str(row["latency_seconds"]))}</td>
                <td>{html.escape(_format_quality_scores(row))}</td>
                <td>{html.escape(str(row["error"]))}</td>
            </tr>
            """
            for row in layer_rows
        )

        layer_sections.append(
            f"""
            <section>
                <h2>{html.escape(layer)} — <span class="{layer_status.lower()}">{layer_status}</span></h2>
                <p>{layer_passed}/{len(layer_rows)} checks passed</p>
                <table>
                    <thead>
                        <tr>
                            <th>Service</th>
                            <th>Name</th>
                            <th>Domain</th>
                            <th>Status</th>
                            <th>Status Code</th>
                            <th>Latency</th>
                            <th>Quality Scores</th>
                            <th>Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        {table_rows}
                    </tbody>
                </table>
            </section>
            """
        )

    command_section = "\n".join(
        f"""
        <tr>
            <td>{html.escape(item["name"])}</td>
            <td>{item["returncode"]}</td>
            <td><pre>{html.escape(item["stdout"][-1000:])}</pre></td>
            <td><pre>{html.escape(item["stderr"][-1000:])}</pre></td>
        </tr>
        """
        for item in command_results
    )

    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Ajrasakha Stable Suite Report</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
                margin: 24px;
                background: #f7f7f7;
                color: #222;
            }}
            .summary {{
                padding: 16px;
                border-radius: 8px;
                background: white;
                border-left: 8px solid {"#178a3b" if overall == "PASS" else "#c62828"};
                margin-bottom: 24px;
            }}
            .pass {{
                color: #178a3b;
                font-weight: bold;
            }}
            .fail {{
                color: #c62828;
                font-weight: bold;
            }}
            section {{
                background: white;
                padding: 16px;
                border-radius: 8px;
                margin-bottom: 20px;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin-top: 12px;
            }}
            th, td {{
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
                vertical-align: top;
                font-size: 14px;
            }}
            th {{
                background: #efefef;
            }}
            pre {{
                white-space: pre-wrap;
                max-height: 200px;
                overflow: auto;
            }}
        </style>
    </head>
    <body>
        <div class="summary">
            <h1>Ajrasakha Stable Suite Report</h1>
            <h2>Overall Status: <span class="{overall.lower()}">{overall}</span></h2>
            <p>Generated at: {generated_at}</p>
            <p>Total checks: {total} | Passed: {passed} | Failed: {failed}</p>
        </div>

        {''.join(layer_sections)}

        <section>
            <h2>Command Execution Logs</h2>
            <table>
                <thead>
                    <tr>
                        <th>Command</th>
                        <th>Return Code</th>
                        <th>Stdout</th>
                        <th>Stderr</th>
                    </tr>
                </thead>
                <tbody>
                    {command_section}
                </tbody>
            </table>
        </section>
    </body>
    </html>
    """

    COMBINED_HTML.write_text(content, encoding="utf-8")


def main():
    all_rows = []
    command_results = []

    for item in COMMANDS:
        print(f"Running {item['layer']}: {item['name']}")
        returncode, stdout, stderr = run_command(item["command"])

        command_results.append(
            {
                "name": item["name"],
                "returncode": returncode,
                "stdout": stdout,
                "stderr": stderr,
            }
        )

        all_rows.extend(read_report_rows(item["layer"], item["report"]))

    write_combined_csv(all_rows)
    write_html(all_rows, command_results)

    failed = sum(1 for row in all_rows if row["status"] != "PASS")
    print(f"Combined CSV written to: {COMBINED_CSV}")
    print(f"Combined HTML written to: {COMBINED_HTML}")

    if failed:
        print(f"Stable suite finished with failures: {failed}")
        sys.exit(1)

    print("Stable suite passed.")


if __name__ == "__main__":
    main()