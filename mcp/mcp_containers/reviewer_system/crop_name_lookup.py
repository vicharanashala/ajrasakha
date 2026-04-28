import json
import re
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path


def _normalize_name(value: str) -> str:
    if value is None:
        return ""
    text = str(value).strip().casefold()
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


@lru_cache(maxsize=1)
def _load_lookup_data() -> dict:
    base_path = Path(__file__).resolve().parent
    data_path = base_path / "output.json"
    with data_path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    english_to_key = {}
    local_to_english = {}
    local_names = []
    local_name_meta = []

    for english_name, aliases in raw.items():
        english_norm = _normalize_name(english_name)
        if not english_norm:
            continue

        english_to_key[english_norm] = english_name

        if english_norm not in local_to_english:
            local_to_english[english_norm] = english_name
            local_names.append(english_norm)
            local_name_meta.append({"name": english_name, "english_name": english_name})

        if not isinstance(aliases, list):
            continue

        for alias in aliases:
            alias_norm = _normalize_name(alias)
            if not alias_norm:
                continue
            if alias_norm not in local_to_english:
                local_to_english[alias_norm] = english_name
                local_names.append(alias_norm)
                local_name_meta.append({"name": alias, "english_name": english_name})

    return {
        "english_to_key": english_to_key,
        "local_to_english": local_to_english,
        "local_names": local_names,
        "local_name_meta": local_name_meta,
    }


def find_english_crop(english_name: str) -> str | None:
    english_norm = _normalize_name(english_name)
    if not english_norm:
        return None
    return _load_lookup_data()["english_to_key"].get(english_norm)


def find_local_exact(local_name: str) -> str | None:
    local_norm = _normalize_name(local_name)
    if not local_norm:
        return None
    return _load_lookup_data()["local_to_english"].get(local_norm)


def find_local_fuzzy(local_name: str, min_score: int = 90) -> dict | None:
    local_norm = _normalize_name(local_name)
    if not local_norm:
        return None

    lookup_data = _load_lookup_data()
    best_score = -1.0
    best_idx = -1
    for idx, candidate in enumerate(lookup_data["local_names"]):
        score = SequenceMatcher(None, local_norm, candidate).ratio()
        if score > best_score:
            best_score = score
            best_idx = idx

    score_percent = round(best_score * 100, 2)
    if best_idx >= 0 and score_percent >= min_score:
        meta = lookup_data["local_name_meta"][best_idx]
        return {
            "matched": True,
            "score": score_percent,
            "matched_local_name": meta["name"],
            "english_name": meta["english_name"],
        }

    return None


def get_top_local_candidates(local_name: str, top_n: int = 5) -> list[dict]:
    local_norm = _normalize_name(local_name)
    if not local_norm:
        return []

    lookup_data = _load_lookup_data()
    scored = []
    for idx, candidate in enumerate(lookup_data["local_names"]):
        score = SequenceMatcher(None, local_norm, candidate).ratio()
        meta = lookup_data["local_name_meta"][idx]
        scored.append(
            {
                "local_name": meta["name"],
                "english_name": meta["english_name"],
                "score": round(score * 100, 2),
            }
        )

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[: max(0, top_n)]
