#!/usr/bin/env python3
"""Multilingual suite orchestrator (CLI).

Runs all 180 test cases (30 scenarios × 6 languages) through
AjraSakha, scores each response, emits a Language Quality Matrix and
a recommendations Markdown file.

Usage::

    python -m qa.tests.multilingual.run_suite \\
        --output-dir qa/artifacts/multilingual

The orchestrator uses :func:`default_client` to decide between the
in-process mock and the live WhatsApp transport — see
``AJRASAKHA_USE_REAL_CLIENT`` env var.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import List

from qa.tests.multilingual.client import default_client
from qa.tests.multilingual.deep_eval import (
    MultilingualLLMScore,
    score_response,
)
from qa.tests.multilingual.reporter import (
    LanguageQualityMatrix,
    build_matrix,
    format_recommendations_markdown,
    generate_recommendations,
)
from qa.tests.multilingual.scenarios import FARMING_SCENARIOS
from qa.tests.multilingual.translations import (
    get_flat_test_cases,
    get_translation_lookup,
)

log = logging.getLogger("multilingual")


def run_all(*, output_dir: Path, languages: List[str] | None = None,
            domains: List[str] | None = None) -> int:
    """Run the full 180-case suite and write artifacts."""
    output_dir.mkdir(parents=True, exist_ok=True)

    client = default_client()
    cases = get_flat_test_cases()
    if languages:
        cases = [c for c in cases if c["language"] in set(languages)]
    if domains:
        cases = [c for c in cases if c["domain"] in set(domains)]

    log.info("Running %d test cases…", len(cases))
    scenarios_by_id = {s["id"]: s for s in FARMING_SCENARIOS}

    scores: List[MultilingualLLMScore] = []
    raw_responses: List[dict] = []

    started = time.time()
    for case in cases:
        scenario = scenarios_by_id[case["scenario_id"]]
        resp = client.ask(
            case_id=case["case_id"],
            scenario_id=case["scenario_id"],
            domain=case["domain"],
            language=case["language"],
            prompt=case["prompt"],
        )
        score = score_response(
            case_id=case["case_id"],
            scenario_id=case["scenario_id"],
            domain=case["domain"],
            query_language=case["language"],
            response_text=resp.response_text,
            response_gdb_ids=resp.gdb_ids,
            required_keywords=scenario.get("required_keywords", []),
            required_entities=scenario.get("required_entities", []),
            expected_gdb_id=scenario.get("expected_gdb_id", ""),
        )
        scores.append(score)
        raw_responses.append(resp.to_dict())

    elapsed = time.time() - started

    matrix = build_matrix(scores)
    recs = generate_recommendations(matrix)

    # Write artifacts
    matrix_paths = matrix.write_artifacts(output_dir)
    (output_dir / "recommendations.md").write_text(
        format_recommendations_markdown(recs), encoding="utf-8"
    )
    (output_dir / "recommendations.json").write_text(
        json.dumps(recs, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "scores.json").write_text(
        json.dumps([s.to_dict() for s in scores], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "raw_responses.json").write_text(
        json.dumps(raw_responses, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "summary.json").write_text(
        json.dumps(
            {
                "n_cases": len(scores),
                "n_passed": sum(1 for s in scores if s.passed),
                "elapsed_s": round(elapsed, 2),
                "totals": matrix.totals,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    log.info(
        "Done: %d cases in %.2fs — %d passed (%.0f%%).",
        len(scores), elapsed,
        sum(1 for s in scores if s.passed),
        100.0 * sum(1 for s in scores if s.passed) / max(1, len(scores)),
    )
    log.info("Artifacts written to %s", output_dir)
    log.info("Matrix: %s", matrix_paths["md"])
    log.info("Recommendations: %s", output_dir / "recommendations.md")
    return 0


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        default="qa/artifacts/multilingual",
        help="Directory to write matrix + recommendation artifacts.",
    )
    parser.add_argument(
        "--language",
        action="append",
        default=None,
        help="Restrict to a subset of languages (repeatable).",
    )
    parser.add_argument(
        "--domain",
        action="append",
        default=None,
        help="Restrict to a subset of domains (repeatable).",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable debug logging.",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    return run_all(
        output_dir=Path(args.output_dir),
        languages=args.language,
        domains=args.domain,
    )


if __name__ == "__main__":
    sys.exit(main())