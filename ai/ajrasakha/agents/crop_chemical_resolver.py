"""Crop/chemical name resolver — ``crop_chemical_name.py`` → in-memory indexes.

Flow:
  1. Sync MongoDB crop_master → ``crop_chemical_name.py`` (build script)
  2. At process start, import ``crop_chemical_name`` dict into memory for fuzzy lookup
"""

from __future__ import annotations

import logging
import os
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from importlib import import_module
from importlib import reload as reload_module
from pathlib import Path
from typing import Any, Literal

import unicodedataplus as udp
from pymongo import MongoClient
from rapidfuzz import fuzz, process

logger = logging.getLogger(__name__)

ScriptName = Literal[
    "latin",
    "devanagari",
    "telugu",
    "tamil",
    "kannada",
    "malayalam",
    "bengali",
    "gurmukhi",
    "gujarati",
    "odia",
    "unknown",
]

_SUPPORTED_UDP: dict[str, ScriptName] = {
    "Latin": "latin",
    "Devanagari": "devanagari",
    "Telugu": "telugu",
    "Tamil": "tamil",
    "Kannada": "kannada",
    "Malayalam": "malayalam",
    "Bengali": "bengali",
    "Gurmukhi": "gurmukhi",
    "Gujarati": "gujarati",
    "Oriya": "odia",
}

_SKIP_UDP = frozenset({"Common", "Inherited", "Unknown"})

_CROP_FUZZY_MIN_SCORE = 80
_MIN_FUZZY_ALIAS_LEN = 3

_SENTINEL_CROP_NAMES = frozenset({
    "all",
    "all crops",
    "n/a",
    "na",
    "weather",
    "crop selection",
    "crop production",
    "others",
    "other",
})

_AGENTS_DIR = Path(__file__).resolve().parent
DEFAULT_CROP_CHEMICAL_NAME_MODULE = "ajrasakha.agents.crop_chemical_name"
DEFAULT_CROP_CHEMICAL_NAME_PATH = _AGENTS_DIR / "crop_chemical_name.py"


@dataclass(frozen=True)
class IndexedAlias:
    alias: str
    alias_normalized: str
    entry_id: str
    script: ScriptName


@dataclass(frozen=True)
class CropMasterEntry:
    id: str
    name: str
    type: str
    aliases: tuple[IndexedAlias, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class AliasHit:
    alias: str
    script: ScriptName
    entry: CropMasterEntry
    score: float
    match_type: str


_entries_by_id: dict[str, CropMasterEntry] = {}
_alias_exact: dict[tuple[str, ScriptName], AliasHit] = {}
_alias_fuzzy_by_script: dict[ScriptName, list[tuple[str, str]]] = {}
_LATIN_TOKEN_MIN_LEN = 4
_loaded = False
_dictionary_path: Path | None = None


def crop_chemical_name_path() -> Path:
    raw = os.getenv("GOLDEN_CROP_CHEMICAL_NAME_PATH", "").strip()
    if raw:
        return Path(raw)
    return DEFAULT_CROP_CHEMICAL_NAME_PATH


def _udp_script(char: str) -> str:
    return udp.script(char)


def _map_udp_script(raw: str) -> ScriptName:
    return _SUPPORTED_UDP.get(raw, "unknown")


def detect_dominant_script(text: str) -> ScriptName:
    """Dominant Unicode script for a single alias string (index time)."""
    scripts = [
        _udp_script(ch)
        for ch in text
        if ch.strip() and _udp_script(ch) not in _SKIP_UDP
    ]
    if not scripts:
        return "unknown"
    raw = Counter(scripts).most_common(1)[0][0]
    return _map_udp_script(raw)


def segment_by_script(text: str) -> list[tuple[str, ScriptName]]:
    """Split query text into contiguous runs sharing the same script."""
    if not text:
        return []

    segments: list[tuple[str, ScriptName]] = []
    current_script: ScriptName | None = None
    current_chars: list[str] = []

    def flush() -> None:
        nonlocal current_script, current_chars
        if not current_chars:
            return
        segment = "".join(current_chars).strip()
        if segment and current_script and current_script != "unknown":
            segments.append((segment, current_script))
        current_script = None
        current_chars = []

    for ch in text:
        if not ch.strip():
            if current_chars:
                current_chars.append(ch)
            continue

        raw = _udp_script(ch)
        if raw in _SKIP_UDP:
            if current_chars:
                current_chars.append(ch)
            continue

        script = _map_udp_script(raw)
        if script == "unknown":
            flush()
            continue

        if current_script is None:
            current_script = script
            current_chars = [ch]
        elif script == current_script:
            current_chars.append(ch)
        else:
            flush()
            current_script = script
            current_chars = [ch]

    flush()
    return segments


def _normalize_latin_alias(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _normalize_alias(value: str, script: ScriptName) -> str:
    if script == "latin":
        return _normalize_latin_alias(value)
    return re.sub(r"\s+", " ", (value or "").strip())


def _split_alias_values(value: str) -> list[str]:
    parts = re.split(r"\s*,\s*", (value or "").strip())
    return [p.strip() for p in parts if p.strip()]


def _is_sentinel_crop(name: str) -> bool:
    return _normalize_latin_alias(name) in _SENTINEL_CROP_NAMES


def _resolve_entry_type(raw_type: Any) -> str:
    if raw_type is None or str(raw_type).strip() == "":
        return "crop"
    return str(raw_type).strip().lower()


def _iter_alias_records(doc: dict[str, Any]) -> list[tuple[str, ScriptName]]:
    """Yield (alias_text, script) pairs for one crop_master document."""
    records: list[tuple[str, ScriptName]] = []
    name = str(doc.get("name") or "").strip()
    if name:
        records.append((name, "latin"))

    for alias in doc.get("aliases") or []:
        if isinstance(alias, str):
            text = alias.strip()
            if text:
                records.append((text, detect_dominant_script(text)))
        elif isinstance(alias, dict):
            en = str(alias.get("english_representation") or "").strip()
            for part in _split_alias_values(en):
                records.append((part, "latin"))
            native = str(alias.get("native_representation") or "").strip()
            for part in _split_alias_values(native):
                records.append((part, detect_dominant_script(part)))

    seen: set[tuple[str, ScriptName]] = set()
    unique: list[tuple[str, ScriptName]] = []
    for alias_text, script in records:
        norm = _normalize_alias(alias_text, script)
        key = (norm, script)
        if not norm or key in seen:
            continue
        seen.add(key)
        unique.append((alias_text, script))
    return unique


def _serialize_entry(entry_id: str, name: str, entry_type: str, indexed: list[IndexedAlias]) -> dict[str, Any]:
    return {
        "id": entry_id,
        "name": name,
        "type": entry_type,
        "aliases": [
            {
                "alias": ia.alias,
                "alias_normalized": ia.alias_normalized,
                "script": ia.script,
            }
            for ia in indexed
        ],
    }


def build_dictionary_from_docs(
    docs: list[dict[str, Any]],
    *,
    source: str = "crop_master",
) -> dict[str, Any]:
    """Build the on-disk dictionary payload from MongoDB-shaped documents."""
    entries: list[dict[str, Any]] = []

    for doc in docs:
        entry_id = str(doc.get("_id", ""))
        name = str(doc.get("name") or "").strip()
        if not entry_id or not name:
            continue

        entry_type = _resolve_entry_type(doc.get("type"))
        indexed: list[IndexedAlias] = []

        for alias_text, script in _iter_alias_records(doc):
            norm = _normalize_alias(alias_text, script)
            if not norm:
                continue
            indexed.append(
                IndexedAlias(
                    alias=alias_text,
                    alias_normalized=norm,
                    entry_id=entry_id,
                    script=script,
                )
            )

        entries.append(_serialize_entry(entry_id, name, entry_type, indexed))

    entries.sort(key=lambda e: (e["type"], e["name"].lower()))

    return {
        "version": 1,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "entry_count": len(entries),
        "alias_count": sum(len(e["aliases"]) for e in entries),
        "entries": entries,
    }


def write_crop_chemical_name_module(
    payload: dict[str, Any],
    path: Path | None = None,
) -> Path:
    """Write literal ``crop_chemical_name = {...}`` Python module."""
    import json

    out = path or crop_chemical_name_path()
    out.parent.mkdir(parents=True, exist_ok=True)
    literal = json.dumps(payload, ensure_ascii=False, indent=4)
    content = (
        '"""Auto-generated from crop_master. Do not edit by hand.\n\n'
        "Rebuild: python -m ajrasakha.agents.build_crop_master_dictionary\n"
        '"""\n\n'
        "from __future__ import annotations\n\n"
        f"crop_chemical_name: dict = {literal}\n"
    )
    out.write_text(content, encoding="utf-8")
    logger.info(
        "crop_chemical_name written: %s entries=%d aliases=%d",
        out,
        payload.get("entry_count", 0),
        payload.get("alias_count", 0),
    )
    return out


def load_crop_chemical_name_dict(*, reload: bool = False) -> dict[str, Any]:
    """Import ``crop_chemical_name`` dict from the generated Python module."""
    module = import_module(DEFAULT_CROP_CHEMICAL_NAME_MODULE)
    if reload:
        module = reload_module(module)
    data = getattr(module, "crop_chemical_name", None)
    if not isinstance(data, dict):
        raise ValueError(f"{DEFAULT_CROP_CHEMICAL_NAME_MODULE}.crop_chemical_name must be a dict")
    return data


def _has_word_boundary_match(query: str, alias: str) -> bool:
    """True when query and alias share a complete word (not a substring inside a word)."""
    if not query or not alias:
        return False
    if re.search(rf"\b{re.escape(query)}\b", alias, re.IGNORECASE):
        return True
    if re.search(rf"\b{re.escape(alias)}\b", query, re.IGNORECASE):
        return True
    return False


def _alias_match_score(query: str, alias: str) -> float:
    """Word-boundary match → 100; else best fuzz.ratio (per alias word if multi-word)."""
    if _has_word_boundary_match(query, alias):
        return 100.0

    if " " in alias:
        word_scores = [_alias_match_score(query, word) for word in alias.split()]
        return max(word_scores) if word_scores else 0.0

    return float(fuzz.ratio(query, alias))


def _alias_match_scorer(query: str, alias: str, **_: Any) -> float:
    """rapidfuzz scorer wrapper (accepts score_cutoff kwarg from process.extract)."""
    return _alias_match_score(query, alias)


def _latin_match_tokens(segment: str, *, min_len: int = _LATIN_TOKEN_MIN_LEN) -> list[str]:
    """Word tokens for latin fuzzy match (avoids 'us' inside 'use' on whole-phrase match)."""
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9\-]*", segment)
    return [t for t in tokens if len(t) >= min_len]


def _match_units(segment: str, script: ScriptName) -> list[str]:
    if script == "latin":
        tokens = _latin_match_tokens(segment)
        if tokens:
            return tokens
        stripped = segment.strip()
        return [stripped] if len(stripped) >= _LATIN_TOKEN_MIN_LEN else []
    tokens = [w for w in re.split(r"\s+", segment.strip()) if w]
    return tokens if tokens else ([segment.strip()] if segment.strip() else [])


def _build_memory_indexes(entries: list[dict[str, Any]]) -> None:
    global _entries_by_id, _alias_exact, _alias_fuzzy_by_script, _loaded

    entries_by_id: dict[str, CropMasterEntry] = {}
    alias_exact: dict[tuple[str, ScriptName], AliasHit] = {}
    alias_fuzzy_by_script: dict[ScriptName, list[tuple[str, str]]] = {}

    for row in entries:
        entry_id = str(row.get("id", ""))
        name = str(row.get("name") or "").strip()
        entry_type = str(row.get("type") or "crop")
        if not entry_id or not name:
            continue

        indexed: list[IndexedAlias] = []
        for alias_row in row.get("aliases") or []:
            alias_text = str(alias_row.get("alias") or "").strip()
            norm = str(alias_row.get("alias_normalized") or "").strip()
            script = alias_row.get("script") or "unknown"
            if not alias_text or not norm:
                continue
            indexed.append(
                IndexedAlias(
                    alias=alias_text,
                    alias_normalized=norm,
                    entry_id=entry_id,
                    script=script,
                )
            )

        entry = CropMasterEntry(
            id=entry_id,
            name=name,
            type=entry_type,
            aliases=tuple(indexed),
        )
        entries_by_id[entry_id] = entry

        is_crop = entry_type == "crop"
        is_chemical = entry_type == "chemical"
        skip_fuzzy = is_crop and _is_sentinel_crop(name)
        index_fuzzy = (is_crop and not skip_fuzzy) or is_chemical

        for ia in indexed:
            hit = AliasHit(
                alias=ia.alias,
                script=ia.script,
                entry=entry,
                score=100.0,
                match_type="exact",
            )
            alias_exact[(ia.alias_normalized, ia.script)] = hit

            if (
                index_fuzzy
                and ia.script != "unknown"
                and len(ia.alias_normalized) >= _MIN_FUZZY_ALIAS_LEN
            ):
                alias_fuzzy_by_script.setdefault(ia.script, []).append(
                    (ia.alias_normalized, entry_id)
                )

    _entries_by_id = entries_by_id
    _alias_exact = alias_exact
    _alias_fuzzy_by_script = alias_fuzzy_by_script
    _loaded = True

    fuzzy_alias_count = sum(len(v) for v in alias_fuzzy_by_script.values())
    logger.info(
        "crop_master memory cache loaded: entries=%d exact_aliases=%d fuzzy_aliases=%d scripts=%d",
        len(entries_by_id),
        len(alias_exact),
        fuzzy_alias_count,
        len(alias_fuzzy_by_script),
    )


def build_cache_from_dictionary(payload: dict[str, Any]) -> None:
    """Load in-memory indexes from a dictionary payload."""
    _build_memory_indexes(list(payload.get("entries") or []))


def build_cache_from_docs(docs: list[dict[str, Any]]) -> None:
    """Rebuild in-memory indexes from MongoDB-shaped documents (tests / one-off)."""
    build_cache_from_dictionary(build_dictionary_from_docs(docs, source="inline"))


def load_memory_from_crop_chemical_name(*, reload: bool = False) -> None:
    """Load in-memory indexes from ``crop_chemical_name`` Python module."""
    global _dictionary_path
    payload = load_crop_chemical_name_dict(reload=reload)
    build_cache_from_dictionary(payload)
    _dictionary_path = crop_chemical_name_path()


def _fetch_docs_from_mongo() -> list[dict[str, Any]]:
    uri = os.getenv("GOLDEN_MONGODB_URI")
    if not uri:
        raise RuntimeError("GOLDEN_MONGODB_URI is not set")

    database = os.getenv("GOLDEN_MONGODB_DATABASE", "agriai")
    collection_name = os.getenv("GOLDEN_CROP_MASTER_COLLECTION", "crop_master")

    client = MongoClient(uri, serverSelectionTimeoutMS=15000)
    try:
        col = client[database][collection_name]
        return list(col.find({}, {"name": 1, "type": 1, "aliases": 1}))
    finally:
        client.close()


def sync_crop_chemical_name_from_mongo(path: Path | None = None) -> Path:
    """MongoDB → ``crop_chemical_name.py`` (run when crop_master changes)."""
    database = os.getenv("GOLDEN_MONGODB_DATABASE", "agriai")
    collection = os.getenv("GOLDEN_CROP_MASTER_COLLECTION", "crop_master")
    docs = _fetch_docs_from_mongo()
    payload = build_dictionary_from_docs(docs, source=f"{database}.{collection}")
    return write_crop_chemical_name_module(payload, path)


def load_crop_master_cache(*, force: bool = False) -> None:
    """Load in-memory cache from ``crop_chemical_name`` Python module."""
    global _loaded
    if _loaded and not force:
        return
    try:
        load_memory_from_crop_chemical_name(reload=force)
    except ModuleNotFoundError:
        logger.warning(
            "crop_chemical_name module missing — run: "
            "python -m ajrasakha.agents.build_crop_master_dictionary",
        )
        _loaded = False
    except Exception as exc:
        logger.warning("crop_chemical_name load failed (planner hints disabled): %s", exc)
        _loaded = False


def ensure_crop_master_loaded(*, force: bool = False) -> None:
    load_crop_master_cache(force=force)


def reload_crop_master_cache() -> None:
    load_crop_master_cache(force=True)


def get_dictionary_entries() -> list[dict[str, Any]]:
    """Return full dictionary entries currently in memory (for inspection)."""
    return [
        {
            "id": e.id,
            "name": e.name,
            "type": e.type,
            "aliases": [
                {
                    "alias": a.alias,
                    "alias_normalized": a.alias_normalized,
                    "script": a.script,
                }
                for a in e.aliases
            ],
        }
        for e in sorted(_entries_by_id.values(), key=lambda x: (x.type, x.name.lower()))
    ]


def resolve_alias_exact(raw: str, *, script: ScriptName | None = None) -> AliasHit | None:
    if not _loaded:
        return None
    resolved_script = script
    if resolved_script is None:
        resolved_script = detect_dominant_script(raw)
        if resolved_script == "unknown":
            resolved_script = "latin"
    norm = _normalize_alias(raw, resolved_script)
    return _alias_exact.get((norm, resolved_script))


def find_crop_fuzzy_matches(
    text: str,
    *,
    min_score: float = _CROP_FUZZY_MIN_SCORE,
    limit: int = 5,
) -> list[AliasHit]:
    """Fuzzy alias hits for crops and chemicals (script-scoped, token-aware for latin)."""
    if not _loaded or not text.strip():
        return []

    best_by_entry: dict[str, AliasHit] = {}

    for segment, script in segment_by_script(text):
        choices = _alias_fuzzy_by_script.get(script)
        if not choices:
            continue

        alias_strings = [alias for alias, _ in choices]
        alias_to_entry = {alias: entry_id for alias, entry_id in choices}

        for unit in _match_units(segment, script):
            query = _normalize_alias(unit, script)
            if not query:
                continue

            matches = process.extract(
                query,
                alias_strings,
                scorer=_alias_match_scorer,
                limit=max(limit * 3, 10),
            )

            for matched_alias, score, _idx in matches:
                if score <= min_score:
                    continue
                entry_id = alias_to_entry.get(matched_alias)
                if not entry_id:
                    continue
                entry = _entries_by_id.get(entry_id)
                if not entry:
                    continue

                hit = AliasHit(
                    alias=matched_alias,
                    script=script,
                    entry=entry,
                    score=float(score),
                    match_type="fuzzy",
                )
                prev = best_by_entry.get(entry_id)
                if prev is None or hit.score > prev.score:
                    best_by_entry[entry_id] = hit

    ranked = sorted(best_by_entry.values(), key=lambda h: h.score, reverse=True)
    return ranked[:limit]


def format_planner_crop_hints(text: str, *, limit: int = 5) -> str:
    """Format script-scoped crop alias hints for planner deterministic_context."""
    from ajrasakha.agents.thread_trace import trace_event

    matches = find_crop_fuzzy_matches(text, limit=limit)
    trace_event(
        "crop_fuzzy_match_results",
        query_excerpt=text[:500],
        match_count=len(matches),
        matches=[
            {
                "alias": h.alias,
                "script": h.script,
                "canonical": h.entry.name,
                "score": h.score,
                "type": h.entry.type,
            }
            for h in matches
        ],
    )
    if not matches:
        return ""

    lines = [
        "CROP/CHEMICAL ALIAS HINTS from crop_master "
        "(latest farmer message only; word-boundary match or fuzz.ratio > 80%; "
        "latin tokens >= 4 chars — use when rephrasing/detecting crop or chemical):",
    ]
    for hit in matches:
        lines.append(
            f'- [{hit.script}] {hit.entry.type} alias "{hit.alias}" -> '
            f'canonical "{hit.entry.name}" (score {hit.score:.0f}%)'
        )
    return "\n".join(lines)
