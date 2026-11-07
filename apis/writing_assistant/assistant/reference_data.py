"""Loads the four Golden Database reference CSVs (never committed to this
repo - see Writing Assistant Build Plan) into one validated ReferenceDataset.

Two thin adapters (local directory / GCS release) each just fetch raw CSV
text; both feed the same validate_and_build() so dev and production are
guaranteed to produce the same data model by sharing code, not convention.

Validation is atomic across the whole dataset (locked decision, Revision 10):
if any required question group in any of the four files is malformed, the
entire dataset fails to load. There is no partial activation.
"""

import csv
import io
from pathlib import Path

from . import config
from .models import (
    QuestionType,
    ReferenceDataset,
    ReferenceDataUnavailableError,
    ReferenceStep,
    ReferenceStructure,
    SourceType,
)

REQUIRED_FILES = (
    "Team Question.csv",
    "Crop Structural Variants.csv",
    "Domain-wise Answer Structures.csv",
    "Direct Topic Questions.csv",
)

_FILE_SOURCE_TYPE = {
    "Team Question.csv": SourceType.TEAM_QUESTION,
    "Crop Structural Variants.csv": SourceType.CROP_VARIANT,
    "Domain-wise Answer Structures.csv": SourceType.DOMAIN,
    "Direct Topic Questions.csv": SourceType.DIRECT_TOPIC,
}


def _blank(value: str | None) -> bool:
    return value is None or value.strip() == ""


def _parse_rows(filename: str, rows: list[dict[str, str]], errors: list[str]) -> list[ReferenceStructure]:
    """Reconstructs question groups from the carry-forward-blank-cell shape
    verified across all four files: the first row of a group carries
    Domain/Code/Question Type/Crop/Question/the written-answer column; every
    later row of that group leaves those blank and only carries
    SL No./Steps/Example/Suggestion 1/Suggestion 2."""
    source_type = _FILE_SOURCE_TYPE[filename]
    structures: list[ReferenceStructure] = []

    current: dict | None = None
    expected_sl_no = 1

    for row_num, row in enumerate(rows, start=2):  # header is row 1
        question = (row.get("Question") or "").strip()

        if question:
            if current is not None:
                structures.append(_finish_group(filename, current, errors))
            current = {
                "source_type": source_type,
                "domain": (row.get("Domain") or "").strip() or None,
                "code": (row.get("Code") or "").strip() or None,
                "question_type": (row.get("Question Type") or "").strip() or None,
                "crop": (row.get("Crop") or "").strip() or None,
                "question": question,
                "full_written_answer": (
                    row.get("Full Written Answer") or row.get("Their Original Answer") or ""
                ).strip(),
                "steps": [],
            }
            expected_sl_no = 1

        if current is None:
            errors.append(f"{filename}: row {row_num} has step data before any Question row")
            continue

        sl_no_raw = (row.get("SL No.") or "").strip()
        step_text = (row.get("Steps") or "").strip()
        example_text = (row.get("Example") or "").strip()

        if _blank(sl_no_raw) and _blank(step_text):
            # Blank sl/step on an otherwise-blank continuation row shouldn't
            # happen in real data, but don't silently fabricate a step for it.
            continue

        try:
            sl_no = int(sl_no_raw)
        except ValueError:
            errors.append(f"{filename}: row {row_num} ('{current['question'][:40]}...') has a non-numeric SL No.: '{sl_no_raw}'")
            continue

        if sl_no != expected_sl_no:
            errors.append(
                f"{filename}: row {row_num} ('{current['question'][:40]}...') SL No. out of sequence "
                f"- expected {expected_sl_no}, got {sl_no}"
            )
        expected_sl_no = sl_no + 1

        if _blank(step_text):
            errors.append(f"{filename}: row {row_num} ('{current['question'][:40]}...') has a blank Steps cell at SL No. {sl_no}")
        if _blank(example_text):
            errors.append(f"{filename}: row {row_num} ('{current['question'][:40]}...') has a blank Example cell at SL No. {sl_no}")

        current["steps"].append(
            {
                "sl_no": sl_no,
                "step": step_text,
                "example": example_text,
                "suggestion_1": (row.get("Suggestion 1") or "").strip() or None,
                "suggestion_2": (row.get("Suggestion 2") or "").strip() or None,
            }
        )

    if current is not None:
        structures.append(_finish_group(filename, current, errors))

    return structures


def _finish_group(filename: str, group: dict, errors: list[str]) -> ReferenceStructure | None:
    if not group["steps"]:
        errors.append(f"{filename}: question '{group['question'][:40]}...' has no step rows at all")
        return None
    try:
        return ReferenceStructure(
            source_type=group["source_type"],
            domain=group["domain"],
            code=group["code"],
            question_type=QuestionType(group["question_type"]) if group["question_type"] else None,
            crop=group["crop"],
            question=group["question"],
            full_written_answer=group["full_written_answer"],
            steps=[ReferenceStep(**s) for s in group["steps"]],
        )
    except ValueError as exc:
        errors.append(f"{filename}: question '{group['question'][:40]}...' failed validation: {exc}")
        return None


def parse_csv_text(filename: str, text: str, errors: list[str]) -> list[ReferenceStructure]:
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    return [s for s in _parse_rows(filename, rows, errors) if s is not None]


def validate_and_build(raw_files: dict[str, str]) -> ReferenceDataset:
    """The one place group-reconstruction and schema validation happen -
    shared by every loader adapter, local or GCS, so they can never drift
    into producing two different data models."""
    missing = [f for f in REQUIRED_FILES if f not in raw_files]
    if missing:
        raise ReferenceDataUnavailableError(
            f"Reference dataset is missing required file(s): {', '.join(missing)}"
        )

    errors: list[str] = []
    all_structures: list[ReferenceStructure] = []
    for filename in REQUIRED_FILES:
        all_structures.extend(parse_csv_text(filename, raw_files[filename], errors))

    if errors:
        # Atomic: any malformed group anywhere fails the whole dataset.
        # No per-group exclusion (explicitly rejected - Revision 10).
        raise ReferenceDataUnavailableError(
            "Reference dataset failed validation (" + str(len(errors)) + " issue(s)): " + "; ".join(errors)
        )

    return ReferenceDataset(structures=all_structures, release_id=None)


def load_from_local_dir(directory: str) -> dict[str, str]:
    base = Path(directory)
    raw: dict[str, str] = {}
    for filename in REQUIRED_FILES:
        path = base / filename
        if not path.is_file():
            # Render Secret Files can't contain spaces in their name (every
            # real filename here has one) - accept the underscore-for-space
            # variant too, so the local filenames (exactly as the team gave
            # them) never need renaming, and production just substitutes
            # underscores at upload time.
            alt_path = base / filename.replace(" ", "_")
            if alt_path.is_file():
                path = alt_path
        if path.is_file():
            raw[filename] = path.read_text(encoding="utf-8-sig")
    return raw


def load_from_gcs(bucket: str, prefix: str, release_id: str) -> dict[str, str]:
    """Not implemented in this phase - requires a GCS bucket and service
    account that have not been provisioned (see Writing Assistant Build
    Plan, 'Production release consistency'). No cloud resources have been
    created."""
    raise NotImplementedError(
        "GCS reference-data loading is not implemented yet - no GCS bucket "
        "or service account has been provisioned. Use REFERENCE_DATA_SOURCE=local "
        "for development and testing."
    )


def load_reference_dataset() -> ReferenceDataset:
    """Single entry point every caller (the FastAPI service, tests) should
    use. Fails closed to ReferenceDataUnavailableError rather than guessing
    - an unset or unrecognized REFERENCE_DATA_SOURCE is itself a failure,
    not a reason to fall back to a default."""
    source = config.REFERENCE_DATA_SOURCE

    if source == "local":
        if not config.REFERENCE_DATA_DIR:
            raise ReferenceDataUnavailableError("REFERENCE_DATA_SOURCE=local but REFERENCE_DATA_DIR is not set")
        raw = load_from_local_dir(config.REFERENCE_DATA_DIR)
        return validate_and_build(raw)

    if source == "gcs":
        if not config.REFERENCE_GCS_BUCKET or not config.REFERENCE_RELEASE_ID:
            raise ReferenceDataUnavailableError(
                "REFERENCE_DATA_SOURCE=gcs but REFERENCE_GCS_BUCKET or REFERENCE_RELEASE_ID is not set"
            )
        raw = load_from_gcs(config.REFERENCE_GCS_BUCKET, config.REFERENCE_GCS_PREFIX, config.REFERENCE_RELEASE_ID)
        dataset = validate_and_build(raw)
        dataset.release_id = config.REFERENCE_RELEASE_ID
        return dataset

    raise ReferenceDataUnavailableError(
        f"REFERENCE_DATA_SOURCE must be 'local' or 'gcs' - got: {source!r}"
    )


# Loaded once per process, like apis/chemical_detector's _ensure_loaded().
# Deliberately no automatic hot-reload or background polling - picking up a
# new release requires a deliberate restart (Writing Assistant Build Plan,
# "Production release consistency").
_cache_populated = False
_cached_dataset: ReferenceDataset | None = None


def get_cached_dataset() -> ReferenceDataset | None:
    global _cache_populated, _cached_dataset
    if not _cache_populated:
        try:
            _cached_dataset = load_reference_dataset()
        except ReferenceDataUnavailableError:
            _cached_dataset = None
        _cache_populated = True
    return _cached_dataset
