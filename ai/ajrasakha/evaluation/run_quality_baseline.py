"""
Runs evaluate_response_quality() against every case in quality_fixtures.py,
prints a summary table, AND saves each result to Postgres - the "baseline
quality report across all 6 domains" required by Project 3's brief.

Usage: uv run python -m ajrasakha.evaluation.run_quality_baseline

Note: main() is kept synchronous (not async) because evaluate_response_quality()
internally uses DeepEval's GEval, which manages its own event loop. Wrapping
the whole script in one outer asyncio.run() caused a silent hang (two event
loops competing). Instead, asyncio.run() is called narrowly, only around the
two small DB operations.
"""

import asyncio
import time

from ajrasakha.evaluation.answer_eval import evaluate_response_quality
from ajrasakha.evaluation.quality_fixtures import QUALITY_TEST_CASES
from ajrasakha.evaluation.quality_storage import init_db, save_quality_score


def main():
    asyncio.run(init_db())

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

        if scores:
            asyncio.run(save_quality_score(
                case_name=case["name"],
                domain=case["expected_domain"],
                query=case["query"],
                answer_quality_scores=scores,
            ))

        time.sleep(25)


if __name__ == "__main__":
    main()
