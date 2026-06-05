import csv
import os
import time
from pathlib import Path

import httpx


REMOTE_IP = os.getenv("REMOTE_IP", "100.100.108.43")

MCP_CASES = [
    {"name": "gdb_mcp", "url": f"http://{REMOTE_IP}:9005/mcp"},
    {"name": "soil_mcp", "url": f"http://{REMOTE_IP}:9008/mcp"},
    {"name": "enam_mcp", "url": f"http://{REMOTE_IP}:9002/mcp"},
    {"name": "agmarknet_mcp", "url": f"http://{REMOTE_IP}:9006/mcp"},
    {"name": "reviewer_mcp", "url": f"http://{REMOTE_IP}:9007/mcp"},
    {"name": "location_mcp", "url": f"http://{REMOTE_IP}:9000/mcp"},
    {"name": "schemes_mcp", "url": f"http://{REMOTE_IP}:9009/mcp"},
    {"name": "chemical_checker_mcp", "url": f"http://{REMOTE_IP}:9101/mcp"},
    #{"name": "weather_mcp", "url": "http://100.100.108.41:9017/mcp"},
    {"name": "weather_mcp", "url": f"http://{REMOTE_IP}:9017/health"},
]


def check_mcp(case: dict) -> dict:
    start = time.time()

    try:
        response = httpx.get(case["url"], timeout=10)
        return {
            "service": "mcp",
            "name": case["name"],
            "url": case["url"],
            "status_code": response.status_code,
            "latency_seconds": round(time.time() - start, 2),
            "passed": (
             response.status_code in [200, 405]
             or (
        response.status_code == 406
        and "text/event-stream" in response.text
    )
),
            "response_text": response.text[:300],
            "error": "",
        }
    except Exception as exc:
        return {
            "service": "mcp",
            "name": case["name"],
            "url": case["url"],
            "status_code": "",
            "latency_seconds": round(time.time() - start, 2),
            "passed": False,
            "response_text": "",
            "error": repr(exc),
        }


def write_csv(results: list[dict], output_path: str) -> None:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    with output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)


def main():
    results = []

    for case in MCP_CASES:
        print(f"Checking MCP: {case['name']}")
        results.append(check_mcp(case))

    report_path = "tests/api/reports/mcp_connectivity_report.csv"
    write_csv(results, report_path)

    passed = sum(1 for r in results if r["passed"])
    total = len(results)

    print(f"\nMCP connectivity report written to: {report_path}")
    print(f"Passed: {passed}/{total}")

    if passed != total:
        raise SystemExit(1)


if __name__ == "__main__":
    main()