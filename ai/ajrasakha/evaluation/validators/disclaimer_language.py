import re


SCRIPT_PATTERNS = {
    "English": r"[A-Za-z]",
    "Hindi": r"[\u0900-\u097F]",
    "Bengali": r"[\u0980-\u09FF]",
    "Assamese": r"[\u0980-\u09FF]",
    "Bodo": r"[\u0900-\u097F]",
    "Dogri": r"[\u0900-\u097F]",
    "Gujarati": r"[\u0A80-\u0AFF]",
    "Kannada": r"[\u0C80-\u0CFF]",
    "Kashmiri": r"[\u0600-\u06FF]",
    "Konkani": r"[\u0900-\u097F]",
    "Maithili": r"[\u0900-\u097F]",
    "Malayalam": r"[\u0D00-\u0D7F]",
    "Marathi": r"[\u0900-\u097F]",
    "Nepali": r"[\u0900-\u097F]",
    "Odia": r"[\u0B00-\u0B7F]",
    "Punjabi": r"[\u0A00-\u0A7F]",
    "Sanskrit": r"[\u0900-\u097F]",
    "Sindhi": r"[\u0600-\u06FF]",
    "Tamil": r"[\u0B80-\u0BFF]",
    "Telugu": r"[\u0C00-\u0C7F]",
    "Urdu": r"[\u0600-\u06FF]",
    "Manipuri (Meitei)": r"[\uABC0-\uABFF]",
    "Santali": r"[\u1C50-\u1C7F]",
}


def _norm(text: object) -> str:
    return str(text or "").replace("\r\n", "\n").strip()


def _has_script(text: str, language: str) -> bool:
    pattern = SCRIPT_PATTERNS.get(language)
    if not pattern:
        return True
    return bool(re.search(pattern, text))


def evaluate_disclaimer_language(result: dict, case: dict) -> dict:
    response = _norm(result.get("response_text"))

    expected_testing = _norm(
        case.get("expected_testing_disclaimer")
        or case.get("testing_disclaimer")
        or case.get("Testing disclaimer")
    )

    expected_2hr = _norm(
        case.get("expected_2hr_disclaimer")
        or case.get("two_hour_disclaimer")
        or case.get("2 hour disclaimer")
    )

    expected_language = (
        case.get("vocal_language")
        or case.get("Vocal Language")
        or case.get("language")
    )

    disclaimer_required = bool(expected_testing)
    testing_present = True
    testing_at_bottom = True

    if disclaimer_required:
        testing_present = expected_testing in response
        testing_at_bottom = response.endswith(expected_testing)

    two_hr_required = bool(case.get("expect_2hr_disclaimer", False))
    two_hr_present = True

    if two_hr_required:
        two_hr_present = bool(expected_2hr and expected_2hr in response)

    language_required = bool(expected_language)
    language_pass = True

    if language_required:
        language_pass = _has_script(response, str(expected_language))

    reasons = []
    if disclaimer_required and not testing_present:
        reasons.append("testing disclaimer missing")
    if disclaimer_required and testing_present and not testing_at_bottom:
        reasons.append("testing disclaimer not at bottom")
    if two_hr_required and not two_hr_present:
        reasons.append("2-hour disclaimer missing")
    if language_required and not language_pass:
        reasons.append(f"expected language/script not detected: {expected_language}")

    return {
        "disclaimer_required": disclaimer_required,
        "testing_disclaimer_present": testing_present,
        "testing_disclaimer_at_bottom": testing_at_bottom,
        "two_hr_disclaimer_required": two_hr_required,
        "two_hr_disclaimer_present": two_hr_present,
        "language_required": language_required,
        "language_pass": language_pass,
        "disclaimer_language_pass": len(reasons) == 0,
        "disclaimer_language_reason": "; ".join(reasons),
    } 