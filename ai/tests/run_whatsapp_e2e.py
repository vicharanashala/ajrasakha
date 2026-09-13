import csv
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

load_dotenv()

from ajrasakha.agents.answer_quality import has_two_hour_disclaimer
from ajrasakha.agents.language import text_matches_user_language
from ajrasakha.evaluation.executors import run_whatsapp_case
from ajrasakha.evaluation.questions import TEST_CASES


CASE_DELAY_SECONDS = 15


def configure_utf8_output() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def get_expected_keywords(case_name: str) -> tuple[str, list[str]]:
    name = case_name.lower()
    if "weather" in name:
        return "weather", [
            "weather", "rain", "temp", "forecast", "degree", "celsius",
            "cloud", "sky", "wind", "humidity", "precipitation", "climat",
        ]
    if "market" in name or "mandi" in name or "price" in name:
        return "mandi", [
            "mandi", "price", "market", "rate", "rupee", "rs", "quintal",
            "cost", "paddy", "wheat", "rice",
        ]
    if "scheme" in name:
        return "schemes", [
            "scheme", "subsidy", "irrigation", "drip", "government",
            "pm-kisan", "yojana", "benefit", "eligibility", "application",
        ]
    if "soil" in name or "gdb" in name or "multi_tool" in name:
        return "gdb", [
            "fertilizer", "nitrogen", "phosphorus", "potassium", "paddy",
            "rice", "wheat", "yellow rust", "rust", "crop", "soil", "grow",
            "practice", "cultivat",
        ]
    return "other", []


def check_response(case: dict, result: dict) -> tuple[bool, str]:
    response_text = (result.get("response_text") or "").strip()
    reasons = []

    if not response_text:
        reasons.append("Response is empty")
    elif has_two_hour_disclaimer(response_text):
        reasons.append("2 hour disclaimer detected; AI did not answer directly")

    if response_text and not text_matches_user_language(response_text, case["query"]):
        reasons.append("Response language/script does not match the query")

    expected_tools = set(case.get("expected_tools", []))
    observed_tools = {
        tool.strip()
        for tool in (result.get("observed_tools") or "").split(",")
        if tool.strip()
    }
    missing_tools = sorted(expected_tools - observed_tools)
    if missing_tools:
        reasons.append(f"Missing expected tools: {missing_tools}")
    elif not expected_tools and observed_tools:
        reasons.append(f"Unexpected tools called: {sorted(observed_tools)}")

    category, keywords = get_expected_keywords(case["name"])
    matched_keywords = [
        keyword for keyword in keywords if keyword in response_text.lower()
    ]
    if response_text and keywords and not matched_keywords:
        reasons.append(
            f"Missing expected keywords for category '{category}' "
            f"(expected one of: {keywords})"
        )

    return not reasons, "; ".join(reasons)


def main() -> None:
    configure_utf8_output()

    webhook_url = os.getenv("WHATSAPP_WEBHOOK_URL")
    internal_api_key = os.getenv("WHATSAPP_INTERNAL_API_KEY")
    phone_number = os.getenv("WHATSAPP_TEST_PHONE_NUMBER")
    meta_app_secret = os.getenv("WHATSAPP_META_APP_SECRET")

    missing = [
        name
        for name, value in {
            "WHATSAPP_WEBHOOK_URL": webhook_url,
            "WHATSAPP_INTERNAL_API_KEY": internal_api_key,
            "WHATSAPP_TEST_PHONE_NUMBER": phone_number,
            "WHATSAPP_META_APP_SECRET": meta_app_secret,
        }.items()
        if not value
    ]
    if missing:
        print(f"Error: Missing required environment variables: {', '.join(missing)}")
        raise SystemExit(1)

    results = []

    parsed = urlparse(webhook_url)
    client_base_url = f"{parsed.scheme}://{parsed.netloc}"
    health_url = f"{client_base_url}/whatsapp/health"
    print(f"Checking client health at: {health_url}")

    start_health = time.time()
    health_passed = False
    health_status = None
    health_error = ""
    health_resp_text = ""

    try:
        resp = httpx.get(health_url, timeout=10)
        health_status = resp.status_code
        health_resp_text = resp.text
        health_passed = resp.status_code == 200
        if health_passed:
            print("Health check PASSED.")
        else:
            health_error = (
                f"Health check returned status {resp.status_code}: {resp.text}"
            )
            print(f"Health check FAILED: {health_error}")
    except Exception as exc:
        health_error = f"Health check connection failed: {exc!r}"
        print(f"Health check FAILED: {health_error}")

    results.append({
        "service": "whatsapp_client",
        "name": "health_check",
        "passed": health_passed,
        "status_pass": health_passed,
        "overall_pass": health_passed,
        "status_code": health_status or "",
        "latency_seconds": round(time.time() - start_health, 2),
        "error": health_error,
        "response_text": health_resp_text[:300],
        "expected_tools": "",
        "observed_tools": "",
        "validation_reason": health_error,
    })

    for index, case in enumerate(TEST_CASES):
        if index:
            print(f"\nWaiting {CASE_DELAY_SECONDS} seconds before the next case...")
            time.sleep(CASE_DELAY_SECONDS)

        print(f"\nRunning WhatsApp E2E case: {case['name']}")

        try:
            result = run_whatsapp_case(case)
            if result.get("graph_status") == "success":
                passed, reason = check_response(case, result)
                result.update({
                    "passed": passed,
                    "status_pass": passed,
                    "overall_pass": passed,
                    "validation_reason": reason,
                })
                if passed:
                    print(
                        f"Case {case['name']} PASSED. "
                        f"Response: {result['response_text'][:150]}..."
                    )
                else:
                    result["error"] = reason
                    print(f"Validation FAILED for {case['name']}: {reason}")
            else:
                result.update({
                    "passed": False,
                    "status_pass": False,
                    "overall_pass": False,
                    "validation_reason": result.get("error") or "",
                })
                print(f"Case {case['name']} FAILED: {result.get('error')}")
        except Exception as exc:
            error = repr(exc)
            result = {
                "name": case["name"],
                "expected_tools": ",".join(case.get("expected_tools", [])),
                "observed_tools": "",
                "http_status": "",
                "latency_seconds": 0.0,
                "response_text": "",
                "error": error,
                "validation_reason": error,
                "passed": False,
                "status_pass": False,
                "overall_pass": False,
            }
            print(f"Execution error for {case['name']}: {error}")

        results.append({
            "service": "whatsapp_bot",
            "name": result["name"],
            "passed": result["passed"],
            "status_pass": result["status_pass"],
            "overall_pass": result["overall_pass"],
            "status_code": result.get("http_status") or "",
            "latency_seconds": result.get("latency_seconds") or 0.0,
            "error": result.get("error") or "",
            "response_text": result.get("response_text") or "",
            "expected_tools": result.get("expected_tools") or "",
            "observed_tools": result.get("observed_tools") or "",
            "validation_reason": result.get("validation_reason") or "",
        })

    report_dir = Path("tests/api/reports")
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "whatsapp_e2e_report.csv"
    fieldnames = [
        "service", "name", "passed", "status_pass", "overall_pass",
        "status_code", "latency_seconds", "error", "response_text",
        "expected_tools", "observed_tools", "validation_reason",
    ]
    with report_path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    print(f"\nWhatsApp E2E report generated at: {report_path}")
    passed_count = sum(1 for result in results if result["passed"])
    print(f"WhatsApp E2E Suite: {passed_count}/{len(results)} passed.")
    raise SystemExit(0 if passed_count == len(results) else 1)


if __name__ == "__main__":
    main()
