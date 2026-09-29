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
# Keyed by state only. The AgriTeam sheet's own "category" values (Disease,
# Pest, Weed, Injury, Deficiency, Nutrient, Soil, Climate, ...) are far
# broader than the four supported question types, so filtering slang lookup
# by question type silently dropped most records. State is the real relevance
# boundary here; question_type is kept as an argument for prompt framing only.
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
    """True when a "local name" is just the plain English crop name itself
    (e.g. local_name "Soybean" for crop_english "Soybean") -- confirmed via
    a real 74-answer run to be true for 1,115 of 1,735 rows (64%) in
    quality_local_names_crops.json, apparently entered as a placeholder
    when no distinct vernacular term was known for that crop/region. These
    add no real crop-mismatch detection value and were the source of
    confirmed false positives: "neem" mentioned as a pesticide ingredient
    on an unrelated crop was being read as a claim that the crop itself
    was neem, because "neem" is separately recorded as its own "local
    name" for the crop "Neem". Only applies to crop/weed records (the ones
    with a crop field); slang/pest/disease terms have no crop field and
    are unaffected.
    """
    crop_name = str(record.get("crop_english") or record.get("crop") or "").strip()
    return bool(crop_name) and alias.casefold() == crop_name.casefold()


_alias_index: dict[str, list[ReferenceRecord]] | None = None
_alias_pattern: re.Pattern[str] | None = None
_alias_build_lock = threading.Lock()


def _matching_index() -> tuple[dict[str, list[ReferenceRecord]], re.Pattern[str] | None]:
    """Build one reusable matcher instead of compiling per record/per answer.

    Built under a lock and published only once complete: answers are checked
    in parallel, and without this a second thread could see the index
    half-built (index present, pattern still None) and silently report "no
    local names found" for whichever answers ran first.
    """
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
                # Publish the pattern first, the index last: the index is
                # what other threads test, so once it is visible the
                # pattern is already in place.
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
    """Decide, from the reference data alone, whether a locally-used term
    is being applied to the wrong crop -- no LLM judgment needed when the
    data already settles it.

    NOT currently wired into llm_checker.apply_context_overrides(), despite
    being correct in isolation (see its tests). A real 74-answer run
    surfaced that a chunk of quality_local_names_crops.json's "local_name"
    values are just the plain English crop name itself ("neem" for
    crop_english "Neem", "onion" for "Onion"). Any answer mentioning that
    word for an unrelated reason -- neem used as a pesticide ingredient on
    a totally different crop, not a claim that the crop IS neem -- gets
    mechanically flagged as a mismatch. 19 of 74 real answers false-flagged
    this way before the wiring was reverted. Needs the reference data
    cleaned (separating genuine vernacular terms from plain crop-name
    entries) before this can be safely wired in.

    For each distinct local-name term actually found in the answer text,
    checks every reference record sharing that exact term: if at least one
    of them names this answer's actual crop, the term is being used
    correctly here (a term can validly apply to more than one crop). If
    every record for that term names a *different* crop, it's a real,
    evidence-backed mismatch.

    Only crop-name and weed records carry a crop field ("crop_english" or
    "crop"); slang/pest/disease terms carry only state, not crop, so there
    is nothing to mechanically check them against. Returns (None, None) for
    those -- the caller should fall back to LLM judgment rather than guess.

    Returns (True, record) for a confirmed mismatch (record is one example
    naming the actual crop it belongs to), (False, None) when every
    checkable term matches, or (None, None) when nothing here is checkable.
    """
    crop_key = (crop or "").strip().casefold()
    by_term: dict[str, list[ReferenceRecord]] = defaultdict(list)
    for record in used_local_names:
        term = (record.get("matched_local_name") or "").casefold()
        if term:
            by_term[term].append(record)

    # A confirmed mismatch always wins outright, even if some other term
    # used in the same answer happens to be uncheckable -- don't let an
    # unrelated ambiguous term mask a real, evidence-backed violation.
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
