"""
Unit tests for gdb_fixtures.py — PR2 ground-truth loader.
Tests load_ground_truth_cases() in isolation, no database, no network.

Run from ai/ directory:
    cd ai && python -m pytest tests/test_gdb_fixtures.py -v
"""

import os, sys, json, tempfile
from pathlib import Path
from contextlib import contextmanager

# Ensure ai/ is on the path
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# ------------------------------------------------------------------
# Must run from ai/ — verify BEFORE any other imports
# ------------------------------------------------------------------
if Path.cwd().resolve() != _ROOT:
    print(f"ERROR: tests must be run from ai/ directory (cwd={Path.cwd()})")
    sys.exit(1)

# ------------------------------------------------------------------
# Module under test
# ------------------------------------------------------------------
from ajrasakha.evaluation.gdb_fixtures import (
    load_ground_truth_cases,
    GDBFixtureError,
)


# =========================================================================
# Valid loading
# =========================================================================

class TestValidLoading:
    """Cases where the loader should accept the file and return valid output."""

    def test_valid_file_loads_correct_count_and_keys(self):
        cases = [
            {
                "question_id": "q1",
                "input": "What is tomato blight?",
                "expected_output": "Use copper fungicide.",
            },
            {
                "question_id": "q2",
                "input": "Best rice variety for West Bengal?",
                "expected_output": "MTU 1010 is recommended.",
            },
        ]
        with _write_json(cases) as path:
            result = load_ground_truth_cases(path)

        assert len(result) == 2
        # Canonical keys present on every case
        for case in result:
            assert "question_id" in case
            assert "input" in case
            assert "expected_output" in case
            assert "synthetic" in case
            assert "metadata" in case

    def test_synthetic_flag_absent_defaults_to_false(self):
        cases = [
            {
                "question_id": "q1",
                "input": "Q",
                "expected_output": "A",
            },
        ]
        with _write_json(cases) as path:
            result = load_ground_truth_cases(path)

        assert result[0]["synthetic"] is False

    def test_synthetic_true_preserved(self):
        cases = [
            {
                "question_id": "q1",
                "input": "Q",
                "expected_output": "A",
                "synthetic": True,
            },
        ]
        with _write_json(cases) as path:
            result = load_ground_truth_cases(path)

        assert result[0]["synthetic"] is True

    def test_metadata_absent_normalized_to_empty_dict(self):
        cases = [
            {
                "question_id": "q1",
                "input": "Q",
                "expected_output": "A",
            },
        ]
        with _write_json(cases) as path:
            result = load_ground_truth_cases(path)

        assert result[0]["metadata"] == {}

    def test_metadata_present_preserved(self):
        cases = [
            {
                "question_id": "q1",
                "input": "Q",
                "expected_output": "A",
                "metadata": {"domain": "gdb", "crop": "rice"},
            },
        ]
        with _write_json(cases) as path:
            result = load_ground_truth_cases(path)

        assert result[0]["metadata"] == {"domain": "gdb", "crop": "rice"}

    def test_whitespace_stripped_from_required_fields(self):
        cases = [
            {
                "question_id": "  q1  ",
                "input": "  What is tomato blight?  ",
                "expected_output": "  Use copper fungicide.  ",
            },
        ]
        with _write_json(cases) as path:
            result = load_ground_truth_cases(path)

        assert result[0]["question_id"] == "q1"
        assert result[0]["input"] == "What is tomato blight?"
        assert result[0]["expected_output"] == "Use copper fungicide."


# =========================================================================
# Validation errors
# =========================================================================

class TestValidationErrors:
    """Cases where the loader must raise GDBFixtureError with context."""

    def test_missing_input_raises_with_index_and_field(self):
        cases = [
            {
                "question_id": "q1",
                "expected_output": "A",
                # "input" absent
            },
        ]
        with _write_json(cases) as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                msg = str(e)
                assert "index" in msg or "0" in msg
                assert "input" in msg

    def test_missing_expected_output_raises_with_index_and_field(self):
        cases = [
            {
                "question_id": "q1",
                "input": "Q",
                # "expected_output" absent
            },
        ]
        with _write_json(cases) as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                msg = str(e)
                assert "expected_output" in msg

    def test_missing_question_id_raises_with_index_and_field(self):
        cases = [
            {
                "input": "Q",
                "expected_output": "A",
                # "question_id" absent
            },
        ]
        with _write_json(cases) as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                msg = str(e)
                assert "question_id" in msg

    def test_empty_string_input_raises(self):
        cases = [
            {
                "question_id": "q1",
                "input": "",
                "expected_output": "A",
            },
        ]
        with _write_json(cases) as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                assert "input" in str(e)

    def test_empty_string_expected_output_raises(self):
        cases = [
            {
                "question_id": "q1",
                "input": "Q",
                "expected_output": "",
            },
        ]
        with _write_json(cases) as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                assert "expected_output" in str(e)

    def test_whitespace_only_expected_output_raises(self):
        cases = [
            {
                "question_id": "q1",
                "input": "Q",
                "expected_output": "   \n\t",
            },
        ]
        with _write_json(cases) as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                assert "expected_output" in str(e)

    def test_non_string_input_raises(self):
        cases = [
            {
                "question_id": "q1",
                "input": 123,
                "expected_output": "A",
            },
        ]
        with _write_json(cases) as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                assert "input" in str(e)

    def test_file_not_found_raises_with_resolved_path(self):
        bad_path = str(_ROOT / "tests" / "fixtures" / "nonexistent_gdb_fixture_7f3a9c.json")
        try:
            load_ground_truth_cases(bad_path)
            assert False, "GDBFixtureError not raised"
        except GDBFixtureError as e:
            assert "nonexistent_gdb_fixture_7f3a9c.json" in str(e)

    def test_malformed_json_raises_with_json_error_text(self):
        with _write_text("not valid json {") as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                # Should wrap the JSON decode error text, not raw traceback
                assert "expecting" in str(e).lower() or "json" in str(e).lower()

    def test_top_level_object_not_list_raises(self):
        with _write_text('{"question_id": "q1", "input": "Q", "expected_output": "A"}') as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                assert "array" in str(e).lower()

    def test_empty_list_raises(self):
        with _write_json([]) as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                assert "empty" in str(e).lower() or "no cases" in str(e).lower()

    def test_non_object_element_in_array_raises(self):
        # valid case at index 0, bad element (int) at index 1
        with _write_json([
            {"question_id": "q1", "input": "Q", "expected_output": "A"},
            123,
        ]) as path:
            try:
                load_ground_truth_cases(path)
                assert False, "GDBFixtureError not raised"
            except GDBFixtureError as e:
                msg = str(e)
                # Should identify the index and the type found
                assert "1" in msg  # index of the bad element
                assert "int" in msg.lower()


# =========================================================================
# Helpers
# =========================================================================

@contextmanager
def _write_json(data):
    """Write data as JSON to a temp file. File is closed + readable on yield;
    deleted automatically when the caller's with-block exits."""
    fd, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f)
        yield path
    finally:
        os.unlink(path)


@contextmanager
def _write_text(content):
    """Write raw text to a temp file. File is closed + readable on yield;
    deleted automatically when the caller's with-block exits."""
    fd, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        yield path
    finally:
        os.unlink(path)