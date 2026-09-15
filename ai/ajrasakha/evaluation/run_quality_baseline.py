"""
Runs evaluate_response_quality() against every case in quality_fixtures.py
and prints a summary report - the "baseline quality report across all 6
domains" required by Project 3's brief.

Usage: uv run python -m ajrasakha.evaluation.run_quality_baseline
"""

import time

from ajrasakha.evaluation.answer_eval import evaluate_response_quality
from ajrasakha.evaluation.quality_fixtures import QUALITY_TEST_CASES


def main():
    print(f"{'Domain':<12} {'Case':<24} {'Relevance':<10} {'Faithful':<10} {'GDBMatch':<10} {'Crop':<9} {'Treat':<9} {'Region':<9}")
    print("-" * 100)

    for case in QUALITY_TEST_CASES:
        result = {"response_text": case.get("expected_answer", "")}

        out = evaluate_response_quality(result, case, enabled=True)
        scores = out.get("answer_quality_scores", {})

        def s(key):
            val = scores.get(key)
            if isinstance(val, dict):
                if val.get("score") is not None:
                    return f"{val.get('score'):.2f}"
                print(f"    [DEBUG] {case['name']} / {key} failed: {val.get('reason')}")
                return "N/A"
            return "N/A"

        def status(key):
            val = scores.get(key, "N/A")
            return str(val)[:8] if not isinstance(val, dict) else "N/A"

        print(
            f"{case['expected_domain']:<12} {case['name']:<24} "
            f"{s('AnswerRelevancyMetric'):<10} {s('FaithfulnessMetric'):<10} "
            f"{s('GDBMatchScore'):<10} "
            f"{status('crop_correctness_status'):<9} "
            f"{status('treatment_correctness_status'):<9} "
            f"{status('region_correctness_status'):<9}"
        )

        time.sleep(15)


if __name__ == "__main__":
    main()
