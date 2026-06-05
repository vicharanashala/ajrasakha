def evaluate_response_quality(result: dict, enabled: bool = False) -> dict:
    return {
        "answer_quality_enabled": False,
        "answerrelevancymetric_score": "",
        "answerrelevancymetric_passed": "",
        "answerrelevancymetric_reason": "disabled",
    }