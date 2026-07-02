import csv
from pathlib import Path

from tests.api.core.client import send_request
from tests.api.core.validators import validate_response
from tests.api.contracts.ai_api import AI_API_BASE_URL, AI_API_CASES
from tests.api.contracts.backend_questions import BACKEND_BASE_URL, BACKEND_QUESTIONS_CASES
from tests.api.contracts.backend_answers import BACKEND_ANSWERS_CASES
from tests.api.contracts.backend_analytics import BACKEND_ANALYTICS_CASES
from tests.api.contracts.backend_auth import BACKEND_AUTH_CASES


WHATSAPP_BACKEND_CASES = [
    {
        "service": "whatsapp_api",
        "name": "whatsapp_threads_requires_or_accepts_auth",
        "method": "GET",
        "path": "/whatsapp/threads",
        "allowed_statuses": [200, 401, 403],
    },
    {
        "service": "whatsapp_api",
        "name": "whatsapp_unique_users_requires_or_accepts_auth",
        "method": "GET",
        "path": "/whatsapp/unique-users",
        "allowed_statuses": [200, 401, 403],
    },
    {
        "service": "whatsapp_api",
        "name": "whatsapp_users_requires_or_accepts_auth",
        "method": "GET",
        "path": "/whatsapp/users",
        "allowed_statuses": [200, 401, 403],
    },
    {
        "service": "whatsapp_api",
        "name": "whatsapp_inactive_users_requires_or_accepts_auth",
        "method": "GET",
        "path": "/whatsapp/inactive-users",
        "allowed_statuses": [200, 401, 403],
    },
    {
        "service": "whatsapp_api",
        "name": "whatsapp_send_message_rejects_empty_body_or_auth",
        "method": "POST",
        "path": "/whatsapp/send-message",
        "json": {},
        "allowed_statuses": [400, 401, 403],
    },
]


def run_suite(base_url: str, cases: list[dict]) -> list[dict]:
    results = []

    for case in cases:
        print(f"Running [{case.get('service')}]: {case['name']}")
        raw = send_request(base_url, case)
        checked = validate_response(raw, case)
        results.append(checked)

    return results


def write_csv(results: list[dict], output_path: str) -> None:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    if not results:
        raise ValueError("No API contract results to write.")

    fieldnames = list(results[0].keys())

    with output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)


def main():
    results = []

    results.extend(run_suite(AI_API_BASE_URL, AI_API_CASES))

    results.extend(run_suite(BACKEND_BASE_URL, BACKEND_QUESTIONS_CASES))
    results.extend(run_suite(BACKEND_BASE_URL, BACKEND_ANSWERS_CASES))
    results.extend(run_suite(BACKEND_BASE_URL, BACKEND_ANALYTICS_CASES))
    results.extend(run_suite(BACKEND_BASE_URL, BACKEND_AUTH_CASES))

    # WhatsApp backend endpoints are part of the same reviewer/backend API.
    # Do not use localhost:4000 here unless that WhatsApp service is actually running.
    results.extend(run_suite(BACKEND_BASE_URL, WHATSAPP_BACKEND_CASES))

    report_path = "tests/api/reports/api_contract_report.csv"
    write_csv(results, report_path)

    passed = sum(1 for r in results if r["passed"])
    total = len(results)

    print(f"\nAPI contract report written to: {report_path}")
    print(f"Passed: {passed}/{total}")

    if passed != total:
        raise SystemExit(1)


if __name__ == "__main__":
    main()