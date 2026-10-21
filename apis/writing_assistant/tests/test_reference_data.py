"""Tests for assistant.reference_data - all against fabricated fixtures or
inline fake CSV content. Never touches the real team CSVs (see Writing
Assistant Build Plan)."""

from pathlib import Path

import pytest

from assistant import config
from assistant.models import ReferenceDataUnavailableError, SourceType
from assistant.reference_data import (
    REQUIRED_FILES,
    load_from_local_dir,
    load_reference_dataset,
    validate_and_build,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ---- happy path, against the committed fixture directory ----

def test_fixture_directory_loads_successfully():
    raw = load_from_local_dir(str(FIXTURES_DIR))
    dataset = validate_and_build(raw)

    assert dataset.release_id is None
    # 3 domain-wise groups + 1 direct-topic + 2 crop-variant + 1 team-question
    assert len(dataset.structures) == 7


def test_group_reconstruction_carries_forward_blank_cells():
    raw = load_from_local_dir(str(FIXTURES_DIR))
    dataset = validate_and_build(raw)

    domain_groups = [s for s in dataset.structures if s.source_type == SourceType.DOMAIN]
    broad = next(s for s in domain_groups if s.question_type and s.question_type.value == "Broad" and s.code == "PMF")

    assert broad.domain == "Pest Management (Fixture)"
    assert len(broad.steps) == 3
    assert [s.sl_no for s in broad.steps] == [1, 2, 3]
    assert broad.steps[0].step == "Introduction"
    assert broad.steps[2].suggestion_1 == "Do not skip the severity check"
    # optional fields stay None when the cell was genuinely blank
    assert broad.steps[0].suggestion_1 is None
    assert broad.steps[0].suggestion_2 is None


def test_team_question_has_no_domain_or_code():
    raw = load_from_local_dir(str(FIXTURES_DIR))
    dataset = validate_and_build(raw)

    team = next(s for s in dataset.structures if s.source_type == SourceType.TEAM_QUESTION)
    assert team.domain is None
    assert team.code is None


def test_crop_variant_groups_are_independent_and_complete():
    raw = load_from_local_dir(str(FIXTURES_DIR))
    dataset = validate_and_build(raw)

    variants = [s for s in dataset.structures if s.source_type == SourceType.CROP_VARIANT]
    assert len(variants) == 2
    crops = {v.crop for v in variants}
    assert crops == {"Fixture Vegetable (continuous-harvest)", "Fixture Fruit Tree (single-harvest)"}
    for v in variants:
        assert len(v.steps) == 3
        assert [s.sl_no for s in v.steps] == [1, 2, 3]


# ---- atomic failure: SL No. out of sequence ----

def test_atomic_failure_on_sl_no_gap(tmp_path):
    _write_minimal_valid_set(tmp_path)
    # break the sequence in one file: 1, 3 (skips 2)
    (tmp_path / "Direct Topic Questions.csv").write_text(
        "Domain,Code,Question,Full Written Answer,SL No.,Steps,Example,Suggestion 1,Suggestion 2\n"
        "D,C,Q?,Answer.,1,Step one,Example one,,\n"
        ",,,,3,Step three,Example three,,\n",
        encoding="utf-8",
    )

    raw = load_from_local_dir(str(tmp_path))
    with pytest.raises(ReferenceDataUnavailableError, match="SL No. out of sequence"):
        validate_and_build(raw)


# ---- atomic failure: blank Example cell ----

def test_atomic_failure_on_blank_example(tmp_path):
    _write_minimal_valid_set(tmp_path)
    (tmp_path / "Team Question.csv").write_text(
        "Question,Their Original Answer,SL No.,Steps,Example,Suggestion 1,Suggestion 2\n"
        "Q?,Answer.,1,Step one,,,\n",
        encoding="utf-8",
    )

    raw = load_from_local_dir(str(tmp_path))
    with pytest.raises(ReferenceDataUnavailableError, match="blank Example"):
        validate_and_build(raw)


# ---- atomic failure: one malformed group must fail the WHOLE dataset,
#      not just exclude itself (locked decision, Revision 10) ----

def test_one_malformed_group_fails_entire_dataset_not_just_itself(tmp_path):
    _write_minimal_valid_set(tmp_path)
    # Domain-wise file: group 1 is fine, group 2 has a bad SL No sequence
    (tmp_path / "Domain-wise Answer Structures.csv").write_text(
        "Domain,Code,Question Type,Question,Full Written Answer,SL No.,Steps,Example,Suggestion 1,Suggestion 2\n"
        "D,C,Broad,Good question?,Answer.,1,Step one,Example one,,\n"
        "D,C,Narrow,Bad question?,Answer.,5,Step one,Example one,,\n",
        encoding="utf-8",
    )

    raw = load_from_local_dir(str(tmp_path))
    with pytest.raises(ReferenceDataUnavailableError):
        validate_and_build(raw)
    # the point of this test: there is no code path that returns a dataset
    # containing only the good group and silently dropping the bad one.


# ---- atomic failure: a required file is missing entirely ----

def test_missing_required_file_fails_the_whole_load(tmp_path):
    _write_minimal_valid_set(tmp_path)
    (tmp_path / "Team Question.csv").unlink()

    raw = load_from_local_dir(str(tmp_path))
    with pytest.raises(ReferenceDataUnavailableError, match="missing required file"):
        validate_and_build(raw)


def test_empty_directory_fails_closed(tmp_path):
    raw = load_from_local_dir(str(tmp_path))
    with pytest.raises(ReferenceDataUnavailableError, match="missing required file"):
        validate_and_build(raw)


# ---- load_reference_dataset(): source-selection must fail closed, never guess ----

def test_load_reference_dataset_requires_explicit_source(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", None)
    with pytest.raises(ReferenceDataUnavailableError, match="must be 'local' or 'gcs'"):
        load_reference_dataset()


def test_load_reference_dataset_rejects_unknown_source(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", "s3")
    with pytest.raises(ReferenceDataUnavailableError, match="must be 'local' or 'gcs'"):
        load_reference_dataset()


def test_load_reference_dataset_local_requires_dir_set(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", "local")
    monkeypatch.setattr(config, "REFERENCE_DATA_DIR", None)
    with pytest.raises(ReferenceDataUnavailableError, match="REFERENCE_DATA_DIR is not set"):
        load_reference_dataset()


def test_load_reference_dataset_local_happy_path(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", "local")
    monkeypatch.setattr(config, "REFERENCE_DATA_DIR", str(FIXTURES_DIR))
    dataset = load_reference_dataset()
    assert len(dataset.structures) == 7
    assert dataset.release_id is None


def test_load_reference_dataset_gcs_not_yet_implemented(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", "gcs")
    monkeypatch.setattr(config, "REFERENCE_GCS_BUCKET", "fixture-bucket")
    monkeypatch.setattr(config, "REFERENCE_RELEASE_ID", "fixture-release")
    with pytest.raises(NotImplementedError):
        load_reference_dataset()


# ---- helper ----

def _write_minimal_valid_set(directory: Path) -> None:
    """A tiny, valid 4-file set for the atomic-failure tests above to
    corrupt exactly one file against."""
    (directory / "Domain-wise Answer Structures.csv").write_text(
        "Domain,Code,Question Type,Question,Full Written Answer,SL No.,Steps,Example,Suggestion 1,Suggestion 2\n"
        "D,C,Broad,Question?,Answer.,1,Step one,Example one,,\n",
        encoding="utf-8",
    )
    (directory / "Direct Topic Questions.csv").write_text(
        "Domain,Code,Question,Full Written Answer,SL No.,Steps,Example,Suggestion 1,Suggestion 2\n"
        "D,C,Question?,Answer.,1,Step one,Example one,,\n",
        encoding="utf-8",
    )
    (directory / "Crop Structural Variants.csv").write_text(
        "Domain,Code,Crop,Question,Crop-Driven Structural Difference,Base Structure Reference,"
        "Full Written Answer,SL No.,Steps,Example,Suggestion 1,Suggestion 2\n"
        "D,C,Crop,Question?,Diff.,Base.,Answer.,1,Step one,Example one,,\n",
        encoding="utf-8",
    )
    (directory / "Team Question.csv").write_text(
        "Question,Their Original Answer,SL No.,Steps,Example,Suggestion 1,Suggestion 2\n"
        "Question?,Answer.,1,Step one,Example one,,\n",
        encoding="utf-8",
    )
    assert set(f.name for f in directory.iterdir()) == set(REQUIRED_FILES)
