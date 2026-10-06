"""Load and index local agricultural names for prompt reference context."""

from __future__ import annotations

import json
import re
import threading
from collections import defaultdict
from pathlib import Path
from typing import Any, TypeAlias


DATA_DIRECTORY = Path(__file__).resolve().parent.parent / "data"
EXPECTED_RECORD_COUNTS = {
    "quality_local_names_crops.json": 763,
    "quality_local_names_slangs.json": 436,
    "quality_local_names_weeds.json": 69,
}


def _load(filename: str) -> list[dict[str, object]]:
    with (DATA_DIRECTORY / filename).open(encoding="utf-8") as source:
        records = json.load(source)
    expected_count = EXPECTED_RECORD_COUNTS[filename]
    if not isinstance(records, list) or len(records) != expected_count:
        actual_count = len(records) if isinstance(records, list) else "not a list"
        raise ValueError(
            f"{filename} must contain {expected_count} records; found {actual_count}"
        )
    return records


def _key(value: object) -> str:
    return str(value or "").strip().casefold()


def _append_unique_record(
    values: list[dict[str, Any]], record: dict[str, object]
) -> None:
    preserved = dict(record)
    if preserved not in values:
        values.append(preserved)


CROP_NAMES = _load("quality_local_names_crops.json")
SLANG_NAMES = _load("quality_local_names_slangs.json")
WEED_NAMES = _load("quality_local_names_weeds.json")

ReferenceRecord: TypeAlias = dict[str, Any]
NestedIndex: TypeAlias = dict[str, dict[str, list[ReferenceRecord]]]
crops_index: NestedIndex = defaultdict(lambda: defaultdict(list))
# keyed by state only, filtering by question type dropped most records
slangs_index: dict[str, list[ReferenceRecord]] = defaultdict(list)
weeds_index: dict[str, list[ReferenceRecord]] = defaultdict(list)

for entry in CROP_NAMES:
    _append_unique_record(
        crops_index[_key(entry.get("state"))][_key(entry.get("crop_english"))],
        entry,
    )

for entry in SLANG_NAMES:
    _append_unique_record(slangs_index[_key(entry.get("state"))], entry)

for entry in WEED_NAMES:
    _append_unique_record(
        weeds_index[_key(entry.get("crop"))],
        entry,
    )


def get_relevant_names(
    state: str, crop: str, category: str
) -> list[ReferenceRecord]:
    """Return complete records matching state/crop, plus all state slang/weed terms."""
    state_key = _key(state)
    crop_key = _key(crop)
    relevant: list[ReferenceRecord] = []

    for record in crops_index.get(state_key, {}).get(crop_key, []):
        _append_unique_record(relevant, record)
    for record in slangs_index.get(state_key, []):
        _append_unique_record(relevant, record)
    for record in weeds_index.get(crop_key, []):
        _append_unique_record(relevant, record)

    return relevant


def _aliases(local_name: object) -> list[str]:
    """Split cells that explicitly contain multiple slash/comma aliases."""
    return [
        alias.strip()
        for alias in re.split(r"\s*[/,]\s*", str(local_name or ""))
        if alias.strip()
    ]


def _is_self_referential_crop_name(record: ReferenceRecord, alias: str) -> bool:
    """True when the "local name" is just the English crop name (about 64% of the crop rows)."""
    crop_name = str(record.get("crop_english") or record.get("crop") or "").strip()
    return bool(crop_name) and alias.casefold() == crop_name.casefold()


_alias_index: dict[str, list[ReferenceRecord]] | None = None
_alias_pattern: re.Pattern[str] | None = None
_alias_build_lock = threading.Lock()


def _matching_index() -> tuple[dict[str, list[ReferenceRecord]], re.Pattern[str] | None]:
    """Build the name matcher once; the lock stops threads seeing it half-built."""
    global _alias_index, _alias_pattern
    if _alias_index is None:
        with _alias_build_lock:
            if _alias_index is None:
                index: dict[str, list[ReferenceRecord]] = defaultdict(list)
                for record in [*CROP_NAMES, *SLANG_NAMES, *WEED_NAMES]:
                    for alias in _aliases(record.get("local_name")):
                        if _is_self_referential_crop_name(record, alias):
                            continue
                        _append_unique_record(index[alias.casefold()], record)
                alternatives = sorted(index, key=len, reverse=True)
                pattern = (
                    re.compile(
                        r"(?<![\w])(?:"
                        + "|".join(re.escape(alias) for alias in alternatives)
                        + r")(?![\w])",
                        re.IGNORECASE,
                    )
                    if alternatives
                    else None
                )
                # set the pattern first, other threads check the index
                _alias_pattern = pattern
                _alias_index = index
    return _alias_index, _alias_pattern


def find_local_name_records(answer_text: str) -> list[ReferenceRecord]:
    """Return reference records whose documented local name occurs in text."""
    found: list[ReferenceRecord] = []
    alias_index, pattern = _matching_index()
    if pattern is None:
        return found
    for match in pattern.finditer(answer_text):
        for record in alias_index.get(match.group(0).casefold(), []):
            matched = dict(record)
            matched["matched_local_name"] = match.group(0)
            _append_unique_record(found, matched)
    return found


def detect_local_name_mismatch(
    used_local_names: list[ReferenceRecord], crop: str, state: str
) -> tuple[bool | None, ReferenceRecord | None]:
    """Check from the reference data whether a local name is used for the wrong crop.

    Not used right now: the crop data lists English crop names as local names,
    so it flagged too many answers.

    Returns (True, record) for a mismatch, (False, None) if everything
    matches, or (None, None) when nothing can be checked (slang terms have
    no crop).
    """
    crop_key = (crop or "").strip().casefold()
    by_term: dict[str, list[ReferenceRecord]] = defaultdict(list)
    for record in used_local_names:
        term = (record.get("matched_local_name") or "").casefold()
        if term:
            by_term[term].append(record)

    # a confirmed mismatch wins even if another term can't be checked
    any_uncheckable = False
    for records in by_term.values():
        checkable = [r for r in records if r.get("crop_english") or r.get("crop")]
        if not checkable:
            any_uncheckable = True
            continue
        if not any(
            (r.get("crop_english") or r.get("crop") or "").strip().casefold() == crop_key
            for r in checkable
        ):
            return True, checkable[0]
    if any_uncheckable:
        return None, None
    return False, None
