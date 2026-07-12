"""
gdb_fixtures — loader for GDB-derived ground truth evaluation cases.

Real cases are exported from the GDB `questions` collection to JSON by whoever
has MongoDB access.  This module reads that JSON file and returns a list of
dict cases ready for evaluate_response_quality() / LLMTestCase.

This module NEVER connects to MongoDB directly.

Usage:
    cases = load_ground_truth_cases("path/to/gdb_ground_truth.json")
"""

import json
from pathlib import Path

# Fields that MUST be present and non-empty in every case
_REQUIRED_FIELDS = ("input", "expected_output", "question_id")


class GDBFixtureError(Exception):
    """
    Raised by load_ground_truth_cases() when a fixture file is malformed
    or fails validation.  Carries a human-readable message describing exactly
    which case and which field failed.
    """
    pass


def load_ground_truth_cases(path: str | Path) -> list[dict]:
    """
    Load and validate a JSON fixture file containing GDB-derived ground truth cases.

    Args:
        path: Path to a JSON file (list of case objects).

    Returns:
        List[dict]: validated cases with canonical keys:
            question_id, input, expected_output, synthetic, metadata.

    Raises:
        GDBFixtureError: if the file is not valid JSON, is not a list,
            or any required field is missing / empty in any case.
    """
    p = Path(path)

    if not p.exists():
        raise GDBFixtureError(f"Fixture file not found: {p.resolve()}")

    try:
        raw = p.read_text(encoding="utf-8")
        cases = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise GDBFixtureError(
            f"Fixture file is not valid JSON: {p.resolve()}\n"
            f"  json.JSONDecodeError: {exc}"
        )

    if not isinstance(cases, list):
        raise GDBFixtureError(
            f"Fixture file must be a JSON array of case objects: {p.resolve()}\n"
            f"  Got: {type(cases).__name__}"
        )

    if len(cases) == 0:
        raise GDBFixtureError(
            f"Fixture file contains no cases: {p.resolve()}"
        )

    validated = []

    for idx, case in enumerate(cases):
        if not isinstance(case, dict):
            raise GDBFixtureError(
                f"Case at index {idx} is not an object: {type(case).__name__}"
            )

        # Check each required field
        for field in _REQUIRED_FIELDS:
            if field not in case:
                raise GDBFixtureError(
                    f"Case at index {idx} (question_id={case.get('question_id', '<missing>')}) "
                    f"is missing required field: '{field}'"
                )
            value = case[field]
            if not isinstance(value, str) or not value.strip():
                raise GDBFixtureError(
                    f"Case at index {idx} (question_id={case.get('question_id', '<missing>')}) "
                    f"has empty or non-string '{field}': {repr(value)}"
                )

        # Normalise optional fields
        #
        # Metadata synthesis from legacy flat fields:
        # Older fixtures (and the discrimination fixture) carry flat top-level
        # fields — domain, crop, state — instead of a nested metadata bag.
        # Loader-time normalisation moves them into metadata so downstream
        # code (the runner, evaluate_response_quality, the domain report)
        # only ever has to look at one place.
        metadata = case.get("metadata") or {}
        if not metadata:
            metadata = {}
            for flat_key, target_key in (
                ("domain", "domain"),
                ("crop",   "crop"),
                ("state",  "state"),
            ):
                if flat_key in case and isinstance(case[flat_key], str) and case[flat_key].strip():
                    metadata[target_key] = case[flat_key].strip()

        validated.append({
            "question_id":     case["question_id"].strip(),
            "input":           case["input"].strip(),
            "expected_output": case["expected_output"].strip(),
            "synthetic":       bool(case.get("synthetic", False)),
            "metadata":        metadata,
        })

    return validated