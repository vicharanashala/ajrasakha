"""Run the four-layer AjraSakha production test suite.

Layer 1 checks Aegra AI, reviewer backend, and wa-client API contracts.
Layer 2 checks MCP service connectivity.
Layer 3 runs live LangGraph regression evaluation scenarios.
Layer 4 sends WhatsApp webhook messages and validates responses and tool routing.

Required environment variables: BACKEND_BASE_URL, WHATSAPP_CLIENT_BASE_URL,
LIVE_API_URL, WHATSAPP_WEBHOOK_URL, WHATSAPP_INTERNAL_API_KEY,
WHATSAPP_TEST_PHONE_NUMBER, WHATSAPP_META_APP_SECRET, ASSISTANT_ID, REMOTE_IP.
"""

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
        "layer": "Layer 3 - LangGraph Regression Scenarios",
        "name": "langgraph_regression",
        "command": [sys.executable, "-m", "ajrasakha.evaluation.run", "--mode", "live"],
        "report": ROOT / "evaluation_report_live.csv",
    },
    {
        "layer": "Layer 4 - WhatsApp E2E Tests",
        "name": "whatsapp_e2e",
        "command": [sys.executable, "-m", "tests.run_whatsapp_e2e"],
        "report": ROOT / "tests" / "api" / "reports" / "whatsapp_e2e_report.csv",
    },
]


def run_command(command):
    completed = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=False,
    )
    return completed.returncode, completed.stdout, completed.stderr


def normalize_bool(value):
    return str(value).strip().lower() in {"true", "1", "yes", "pass", "passed"}


def read_report_rows(layer, report_path):
    rows = []

    if not report_path.exists():
        return [
            {
                "layer": layer,
                "service": "",
                "name": report_path.name,
                "status": "FAIL",
                "status_code": "",
                "latency_seconds": "",
                "error": f"Report not found: {report_path}",
                "details": "",
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
                    "status": "PASS" if passed else "FAIL",
                    "status_code": row.get("status_code", row.get("http_status", "")),
                    "latency_seconds": row.get("latency_seconds", row.get("latency", "")),
                    "error": row.get("error", row.get("failure_reason", "")),
                    "details": row.get("triage_category", row.get("response_text", ""))[:500],
                }
            )

    return rows


def write_combined_csv(rows):
    fields = [
        "layer",
        "service",
        "name",
        "status",
        "status_code",
        "latency_seconds",
        "error",
        "details",
    ]

    with COMBINED_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


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
                <td class="{row["status"].lower()}">{row["status"]}</td>
                <td>{html.escape(str(row["status_code"]))}</td>
                <td>{html.escape(str(row["latency_seconds"]))}</td>
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
                            <th>Status</th>
                            <th>Status Code</th>
                            <th>Latency</th>
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
