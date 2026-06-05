import json


def validate_response(result: dict, case: dict) -> dict:
    expected_status = case.get("expected_status", 200)
    allowed_statuses = case.get("allowed_statuses", [expected_status])
    required_fields = case.get("required_fields", [])

    status_pass = result["status_code"] in allowed_statuses

    field_pass = True
    missing_fields = []

    if required_fields:
        try:
            data = json.loads(result["response_text"])
            for field in required_fields:
                if field not in data:
                    field_pass = False
                    missing_fields.append(field)
        except Exception:
            field_pass = False
            missing_fields = required_fields

    passed = status_pass and field_pass and not result["error"]

    return {
        **result,
        "expected_status": expected_status,
        "allowed_statuses": ",".join(map(str, allowed_statuses)),
        "status_pass": status_pass,
        "field_pass": field_pass,
        "missing_fields": ",".join(missing_fields),
        "passed": passed,
    }