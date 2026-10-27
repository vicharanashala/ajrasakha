import difflib
import logging
import math
import os
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from wordfreq import zipf_frequency

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("chemical_detector")

load_dotenv()
_parents = Path(__file__).resolve().parents
if len(_parents) > 2:
    load_dotenv(_parents[2] / ".env")

app = FastAPI(title="Banned/Restricted Chemical Detector")

CHEMICAL_DB_URL = os.getenv("CHEMICAL_DB_URL")
CHEMICAL_DB_NAME = os.getenv("CHEMICAL_DB_NAME", "agriai")
CHEMICAL_COLLECTION_NAME = os.getenv("CHEMICAL_COLLECTION_NAME", "crop_master")

try:
    client = MongoClient(CHEMICAL_DB_URL)
    collection = client[CHEMICAL_DB_NAME][CHEMICAL_COLLECTION_NAME]
except PyMongoError as e:
    log.error("[chemical_detector] failed to initialize MongoDB client: %s", e)
    collection = None

SIMILARITY_CUTOFF = 0.85
_MIN_TOKEN_LEN = 3
_WORD_RE = re.compile(r"[A-Za-z0-9'-]+")
_CODE_RE = re.compile(r"[A-Za-z0-9,.\-]+")
_RAW_TOKEN_RE = re.compile(r"\S+")
_MIN_SQUASHED_LEN = 4
_FORMULATION_SUFFIX_RE = re.compile(
    r"(-based|-insecticide|-pesticide|-formulation|\d+%?[a-z]{0,4})$"
)
_LEET_MAP = str.maketrans(
    {"@": "a", "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s"}
)
_CONFUSABLE_MAP = str.maketrans(
    {
        "А": "A",
        "В": "B",
        "Е": "E",
        "К": "K",
        "М": "M",
        "Н": "H",
        "О": "O",
        "Р": "P",
        "С": "C",
        "Т": "T",
        "Х": "X",
        "а": "a",
        "в": "b",
        "е": "e",
        "к": "k",
        "м": "m",
        "н": "h",
        "о": "o",
        "р": "p",
        "с": "c",
        "т": "t",
        "х": "x",
    }
)

# These are language signals, not chemical names. They make a close spelling
# less likely to be reported when it is being used as a place/name reference.
_LOCATION_CONTEXT = {
    "village", "town", "district", "road", "street", "city", "state", "near",
    "from", "resident", "residents", "located", "taluk", "block", "address",
    "boundary", "route", "landmark", "residence", "local", "locality", "hamlet",
}
_AGRICULTURAL_CONTEXT = {
    "spray", "sprayed", "apply", "applied", "mix", "mixed", "dose", "drench",
    "treat", "treated", "pesticide", "insecticide", "fungicide", "chemical",
    "crop", "field", "seed", "soil", "pest", "farm", "farmer", "cotton",
    "paddy", "wheat", "rice", "vegetable", "fruit", "orchard", "plantation",
    "nursery", "foliar", "fungal", "weed", "weeds", "control", "management",
    "manage", "protection", "protect", "prohibited", "banned", "restricted",
    "residue", "active", "ingredient", "product", "label", "registered",
    "formulation", "concentration", "solution", "water", "litre", "liter",
    "millilitre", "ml", "gram", "grams", "kilogram", "kilograms", "kg", "acre",
    "hectare", "per", "treatment", "treated",
}
_BIOLOGICAL_CONTEXT = {
    "organism", "organisms", "natural", "enemy", "enemies", "beneficial",
    "predator", "predators", "parasitoid", "parasitoids", "parasitic", "larvae",
    "larval", "pupa", "pupae", "egg", "eggs", "species", "genus", "beetle",
    "beetles", "wasp", "wasps", "fly", "flies", "mite", "mites", "spider",
    "spiders", "insect", "insects", "thrips", "bug", "bugs", "bird", "birds",
    "conservation", "conserve", "habitat", "habitats", "refuge", "refuges",
    "shelter", "shelters", "nectar", "pollen", "host", "hosts", "microclimate",
    "ecological", "ecology", "biological", "bio", "companion", "trap",
    "flowering", "bund", "bunds", "tillage",
}
_SCIENTIFIC_SUFFIXES = {
    "ae",
    "i",
    "is",
    "us",
    "um",
    "a",
}
_COMMON_ALIAS_ZIPF_THRESHOLD = 2.0
_MAX_INPUT_CHARACTERS = 100_000
_MAX_INPUT_WORDS = 20_000
_AMBIGUITY_MARGIN = 0.05

_CANDIDATES: dict[str, tuple[str, str]] = {}
_CANDIDATE_TERMS: list[str] = []
_TERMS_BY_LEN: dict[int, list[str]] = {}
_CANDIDATES_SQUASHED: dict[str, tuple[str, str]] = {}
_CANDIDATES_SORTED: dict[str, tuple[str, str]] = {}
_CANDIDATES_PHF: dict[str, tuple[str, str]] = {}
_COMPACT_TERMS_BY_LEN: dict[int, list[str]] = {}
_CANONICAL_TERMS: set[str] = set()
_MAX_CANDIDATE_WORDS = 3
_LOADED = False


@dataclass(frozen=True)
class _ScoredCandidate:
    value: tuple[str, str]
    score: float
    match_type: str
    context: str


def _normalize(value: str) -> str:
    value = value.translate(_CONFUSABLE_MAP)
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.lower().replace("’", "'")
    return re.sub(r"\s+", " ", value).strip()


def _squash(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _normalize(value))


def _ensure_loaded() -> None:
    global _CANDIDATES, _CANDIDATE_TERMS, _TERMS_BY_LEN
    global _CANDIDATES_SQUASHED, _CANDIDATES_SORTED, _CANDIDATES_PHF
    global _COMPACT_TERMS_BY_LEN
    global _CANONICAL_TERMS, _MAX_CANDIDATE_WORDS, _LOADED

    if _LOADED:
        return
    if collection is None:
        raise HTTPException(
            status_code=503,
            detail="Chemical database is currently unavailable. Please try again later.",
        )

    candidates: dict[str, tuple[str, str]] = {}
    canonical_terms: set[str] = set()
    try:
        docs = list(
            collection.find({"type": "chemical"}, {"name": 1, "status": 1, "aliases": 1})
        )
    except PyMongoError as e:
        log.error("[chemical_detector] chemical DB query failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Chemical database is currently unavailable. Please try again later.",
        )

    for doc in docs:
        name = (doc.get("name") or "").strip()
        status = (doc.get("status") or "").strip()
        if not name or not status:
            continue
        canonical_name = _normalize(name)
        canonical_terms.add(canonical_name)
        terms = {canonical_name}
        for alias in doc.get("aliases") or []:
            for key in ("english_representation", "native_representation"):
                value = (alias.get(key) or "").strip()
                if value:
                    terms.add(_normalize(value))
        for term in terms:
            candidates[term] = (name, status)

    _CANDIDATES = candidates
    _CANONICAL_TERMS = canonical_terms
    _CANDIDATE_TERMS = list(candidates)
    _TERMS_BY_LEN = {}
    _COMPACT_TERMS_BY_LEN = {}
    for term in _CANDIDATE_TERMS:
        compact = _squash(term)
        _TERMS_BY_LEN.setdefault(len(compact), []).append(term)
        _COMPACT_TERMS_BY_LEN.setdefault(len(compact), []).append(compact)

    _CANDIDATES_SQUASHED = {}
    _CANDIDATES_SORTED = {}
    _CANDIDATES_PHF = {}
    for term, value in candidates.items():
        squashed = _squash(term)
        if len(squashed) >= _MIN_SQUASHED_LEN:
            _CANDIDATES_SQUASHED[squashed] = value
        words = term.split()
        if len(words) >= 2:
            _CANDIDATES_SORTED[" ".join(sorted(words))] = value
        _CANDIDATES_PHF[term.replace("ph", "f")] = value

    _MAX_CANDIDATE_WORDS = max((len(t.split()) for t in _CANDIDATE_TERMS), default=3)
    _LOADED = True
    _fuzzy_candidates.cache_clear()
    log.info("[chemical_detector] loaded %d chemical names/aliases", len(_CANDIDATES))


def _edit_distance(left: str, right: str) -> int:
    """Damerau-Levenshtein distance, including adjacent transpositions."""
    previous = list(range(len(right) + 1))
    previous_previous: list[int] | None = None
    for i, left_char in enumerate(left, 1):
        current = [i]
        for j, right_char in enumerate(right, 1):
            cost = 0 if left_char == right_char else 1
            value = min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + cost,
            )
            if (
                previous_previous is not None
                and i > 1
                and j > 1
                and left_char == right[j - 2]
                and left[i - 2] == right_char
            ):
                value = min(value, previous_previous[j - 2] + cost)
            current.append(value)
        previous_previous, previous = previous, current
    return previous[-1]


def _similarity(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    distance = _edit_distance(left, right)
    return 1.0 - distance / max(len(left), len(right))


def _allowed_edits(length: int) -> int:
    if length <= 5:
        return 0
    if length <= 8:
        return 1
    if length <= 14:
        return 2
    return 3


@lru_cache(maxsize=8192)
def _is_common_word(word: str) -> bool:
    return zipf_frequency(word, "en") >= 1.0


def _candidate_terms_near_length(term: str) -> list[str]:
    length = len(_squash(term))
    max_edits = _allowed_edits(length)
    return [
        candidate
        for candidate in _TERMS_BY_LEN.get(length, [])
        if abs(len(_squash(candidate)) - length) <= max_edits
    ] + [
        candidate
        for candidate in _TERMS_BY_LEN.get(length - 1, [])
        if max_edits >= 1
    ] + [
        candidate
        for candidate in _TERMS_BY_LEN.get(length + 1, [])
        if max_edits >= 1
    ] + [
        candidate
        for candidate in _TERMS_BY_LEN.get(length - 2, [])
        if max_edits >= 2
    ] + [
        candidate
        for candidate in _TERMS_BY_LEN.get(length + 2, [])
        if max_edits >= 2
    ] + [
        candidate
        for candidate in _TERMS_BY_LEN.get(length - 3, [])
        if max_edits >= 2
    ] + [
        candidate
        for candidate in _TERMS_BY_LEN.get(length + 3, [])
        if max_edits >= 2
    ] + [
        candidate
        for candidate in _TERMS_BY_LEN.get(length - 4, [])
        if max_edits >= 2
    ] + [
        candidate
        for candidate in _TERMS_BY_LEN.get(length + 4, [])
        if max_edits >= 2
    ]


@lru_cache(maxsize=4096)
def _fuzzy_candidates(term: str) -> tuple[str, ...]:
    """Use difflib's fast sequence filter before running edit distance.

    The edit-distance calculation is intentionally more precise, but it is
    much more expensive on every word n-gram in a long advisory. Most n-grams
    have no plausible chemical candidate, so retain only the closest few
    strings first.
    """
    compact = _squash(term)
    compact_candidates: list[str] = []
    length = len(compact)
    for candidate_length in range(max(1, length - 4), length + 5):
        compact_candidates.extend(_COMPACT_TERMS_BY_LEN.get(candidate_length, ()))
    close = difflib.get_close_matches(compact, compact_candidates, n=8, cutoff=0.55)
    return tuple(
        term
        for candidate in close
        for term in _CANDIDATES
        if _squash(term) == candidate
    )


def _context_score(words: list[str], start: int, end: int) -> float:
    surrounding = set(words[max(0, start - 3) : start] + words[end : end + 3])
    location = len(surrounding & _LOCATION_CONTEXT)
    agriculture = len(surrounding & _AGRICULTURAL_CONTEXT)
    return min(0.20, agriculture * 0.06) - min(0.35, location * 0.18)


def _sentence_context(words: list[str], start: int, end: int) -> tuple[str, float]:
    sentence_words = words[max(0, start - 12) : min(len(words), end + 12)]
    biological = len(set(sentence_words) & _BIOLOGICAL_CONTEXT)
    chemical = len(set(sentence_words) & _AGRICULTURAL_CONTEXT)
    if biological > chemical and biological:
        return "biological", -min(0.55, biological * 0.12)
    if chemical:
        return "chemical", min(0.25, chemical * 0.05)
    return "neutral", 0.0


def _biological_context_score(words: list[str], start: int, end: int) -> float:
    surrounding = set(words[max(0, start - 4) : start] + words[end : end + 4])
    biological = len(surrounding & _BIOLOGICAL_CONTEXT)
    return -min(0.45, biological * 0.15)


def _has_strong_chemical_context(words: list[str], start: int, end: int) -> bool:
    surrounding = set(words[max(0, start - 4) : start] + words[end : end + 4])
    return bool(surrounding & _AGRICULTURAL_CONTEXT)


def _is_place_name_context(words: list[str], start: int, end: int) -> bool:
    before = [_squash(word) for word in words[max(0, start - 3) : start]]
    after = [_squash(word) for word in words[end : end + 3]]
    location_nouns = _LOCATION_CONTEXT | {
        "area", "block", "colony", "farm", "field", "mandal", "market",
        "panchayat", "region", "station", "taluk",
    }

    if before and before[-1] in location_nouns:
        return True
    if after and after[0] in location_nouns:
        return True
    if len(before) >= 2 and before[-2:] in (
        ["called", "the"],
        ["named", "the"],
        ["is", "called"],
        ["is", "named"],
    ):
        return True
    if before and before[-1] in {"called", "named"}:
        return True
    if len(after) >= 2 and after[:2] == ["is", "a"]:
        return len(after) >= 3 and after[2] in location_nouns
    if len(after) >= 2 and after[0] in {"a", "an", "the"}:
        return after[1] in location_nouns
    return False


def _looks_like_scientific_name(term: str) -> bool:
    words = term.split()
    if len(words) != 2:
        return False
    second = words[1].rstrip(".")
    return len(words[0]) >= 4 and len(second) >= 4 and second.endswith(
        tuple(_SCIENTIFIC_SUFFIXES)
    )


def _best_fuzzy_match(
    term: str,
    words: list[str],
    start: int,
    end: int,
) -> _ScoredCandidate | None:
    normalized = _normalize(term)
    compact = _squash(normalized)
    if len(compact) < _MIN_TOKEN_LEN:
        return None

    common_phrase = all(_is_common_word(word) for word in normalized.split())
    candidates = _fuzzy_candidates(normalized)
    biological_context = _biological_context_score(words, start, end)
    scientific_name = _looks_like_scientific_name(normalized)
    sentence_context, sentence_bonus = _sentence_context(words, start, end)
    scored: list[tuple[float, str, tuple[str, str], str]] = []

    if _is_place_name_context(words, start, end):
        return None

    for candidate in candidates:
        # A fuzzy single-word chemical candidate must be compared with one
        # input token. Otherwise surrounding dosage, connector, or advisory
        # words can turn an unrelated phrase into a chemical typo.
        if len(normalized.split()) > 1 and len(candidate.split()) == 1:
            continue
        candidate_compact = _squash(candidate)
        distance = _edit_distance(compact, candidate_compact)
        # Base typo tolerance on the text supplied by the user. Using the
        # longer database term here lets a short unrelated word gain too many
        # edits and become a chemical match (for example, "azophos" versus
        # the longer "tiazophos" alias of Triazophos).
        max_edits = _allowed_edits(len(compact))
        similarity = _similarity(compact, candidate_compact)
        prefix_match = candidate.startswith(normalized) and len(normalized) >= 8
        candidate_value = _CANDIDATES[candidate]
        canonical = candidate == _normalize(candidate_value[0])
        match_type = "canonical-typo" if canonical else "alias-typo"
        candidate_is_common_alias = all(
            zipf_frequency(word, "en") >= _COMMON_ALIAS_ZIPF_THRESHOLD
            for word in candidate.split()
        ) and candidate != _normalize(candidate_value[0])
        if distance > max_edits and not (
            prefix_match and len(candidate_compact) - len(compact) <= 4
        ):
            continue
        if common_phrase and similarity < 0.95:
            continue
        if biological_context < 0 and not _has_strong_chemical_context(
            words, start, end
        ):
            continue
        if scientific_name and not _has_strong_chemical_context(words, start, end):
            continue
        if len(compact) <= 5:
            continue
        # A database alias that is an ordinary English word is not reliable
        # evidence for a chemical when the input is only a fuzzy spelling.
        # Keep exact aliases handled by the caller, but reject weak fuzzy
        # matches such as the biological genus "Bracon" to an alias like
        # "beacon" belonging to an unrelated chemical.
        if candidate_is_common_alias and _context_score(words, start, end) <= 0:
            continue
        if candidate_is_common_alias and similarity < 0.95:
            continue
        if not prefix_match and not common_phrase and similarity < 0.75:
            continue
        if prefix_match and similarity < 0.65:
            continue
        if not common_phrase and distance > max_edits and not prefix_match:
            continue
        score = similarity + _context_score(words, start, end) + biological_context + sentence_bonus
        if canonical:
            score += 0.05
        if prefix_match and len(candidate_compact) - len(compact) <= 4:
            score += 0.08
        scored.append((score, candidate, candidate_value, match_type))

    if not scored:
        return None
    scored.sort(reverse=True, key=lambda item: item[0])
    best_score, _, best_value, match_type = scored[0]
    if best_score < 0.75:
        return None
    if len(scored) > 1 and best_score - scored[1][0] < _AMBIGUITY_MARGIN:
        return None
    return _ScoredCandidate(best_value, best_score, match_type, sentence_context)


def _collapse_letter_spaced_runs(words: list[str]) -> list[str]:
    collapsed = []
    i = 0
    while i < len(words):
        if len(words[i]) == 1 and words[i].isalpha():
            j = i
            while j < len(words) and len(words[j]) == 1 and words[j].isalpha():
                j += 1
            if j - i >= 2:
                collapsed.append("".join(words[i:j]))
            i = j
        else:
            i += 1
    return collapsed


def _leet_decode(token: str) -> str | None:
    if not any(char in token for char in "@013457$"):
        return None
    return token.translate(_LEET_MAP).lower()


def _strip_formulation_suffix(term: str) -> str | None:
    stripped = _FORMULATION_SUFFIX_RE.sub("", term).rstrip("-")
    return stripped if stripped and stripped != term else None


def _record_match(
    found: dict[str, str],
    value: tuple[str, str],
    scores: dict[str, float],
    score: float,
) -> None:
    name, status = value
    if name not in found or score > scores[name]:
        found[name] = status
        scores[name] = score


def _is_common_alias(term: str) -> bool:
    return (
        term not in _CANONICAL_TERMS
        and all(
            zipf_frequency(word, "en") >= _COMMON_ALIAS_ZIPF_THRESHOLD
            for word in term.split()
        )
    )


def detect_chemicals(text: str) -> dict[str, str]:
    if len(text) > _MAX_INPUT_CHARACTERS:
        raise HTTPException(
            status_code=413,
            detail=f"Field 'text' must not exceed {_MAX_INPUT_CHARACTERS} characters.",
        )
    _ensure_loaded()
    normalized_text = _normalize(text)
    words = [_normalize(word) for word in _WORD_RE.findall(normalized_text)]
    if len(words) > _MAX_INPUT_WORDS:
        raise HTTPException(
            status_code=413,
            detail=f"Field 'text' must not exceed {_MAX_INPUT_WORDS} words.",
        )
    found: dict[str, str] = {}
    scores: dict[str, float] = {}
    covered: set[int] = set()

    for n in range(_MAX_CANDIDATE_WORDS, 0, -1):
        for start in range(len(words) - n + 1):
            end = start + n
            term = " ".join(words[start:end])
            if len(_squash(term)) < _MIN_TOKEN_LEN:
                continue
            if all(index in covered for index in range(start, end)):
                continue

            exact = _CANDIDATES.get(term)
            if exact:
                if _is_place_name_context(words, start, end):
                    continue
                if _is_common_alias(term) and (
                    _context_score(words, start, end) <= 0
                    or _biological_context_score(words, start, end) < 0
                ):
                    continue
                _record_match(found, exact, scores, 1.2 + _context_score(words, start, end))
                covered.update(range(start, end))
                continue

            if n > 1:
                reordered = _CANDIDATES_SORTED.get(" ".join(sorted(term.split())))
                if reordered:
                    _record_match(found, reordered, scores, 1.1)
                    covered.update(range(start, end))
                    continue

            phf = _CANDIDATES_PHF.get(term.replace("ph", "f"))
            if phf:
                phf_term = term.replace("ph", "f")
                if _is_common_alias(phf_term) and (
                    _context_score(words, start, end) <= 0
                    or _biological_context_score(words, start, end) < 0
                ):
                    continue
                _record_match(found, phf, scores, 1.05)
                covered.update(range(start, end))
                continue

            hit = _best_fuzzy_match(term, words, start, end)
            if hit:
                _record_match(found, hit.value, scores, hit.score)
                log.debug(
                    "[chemical_detector] fuzzy match name=%s score=%.3f type=%s context=%s",
                    hit.value[0],
                    hit.score,
                    hit.match_type,
                    hit.context,
                )
                covered.update(range(start, end))
                continue

            stripped = _strip_formulation_suffix(term)
            if stripped and len(_squash(stripped)) >= _MIN_TOKEN_LEN:
                hit = _CANDIDATES.get(stripped) or _best_fuzzy_match(
                    stripped, words, start, end
                )
                if hit:
                    if isinstance(hit, _ScoredCandidate):
                        _record_match(found, hit.value, scores, hit.score)
                    else:
                        _record_match(found, hit, scores, 1.0)
                    covered.update(range(start, end))

    code_words = [_normalize(word) for word in _CODE_RE.findall(normalized_text)]
    for n in range(1, min(_MAX_CANDIDATE_WORDS, 3) + 1):
        for start in range(len(code_words) - n + 1):
            squashed = _squash(" ".join(code_words[start : start + n]))
            value = _CANDIDATES_SQUASHED.get(squashed)
            if value:
                code_term = " ".join(code_words[start : start + n])
                if _is_place_name_context(code_words, start, start + n):
                    continue
                if _is_common_alias(code_term):
                    continue
                _record_match(found, value, scores, 1.15)

    for collapsed in _collapse_letter_spaced_runs(words):
        value = _CANDIDATES.get(collapsed)
        if value:
            _record_match(found, value, scores, 1.1)

    for raw_token in _RAW_TOKEN_RE.findall(normalized_text):
        decoded = _leet_decode(raw_token)
        if not decoded or len(decoded) < _MIN_TOKEN_LEN:
            continue
        value = _CANDIDATES.get(decoded) or _best_fuzzy_match(decoded, words, 0, 0)
        if value:
            if isinstance(value, _ScoredCandidate):
                _record_match(found, value.value, scores, value.score)
            else:
                _record_match(found, value, scores, 1.0)

    names = list(found)
    for name in names:
        if any(
            other != name and f" {_normalize(name)} " in f" {_normalize(other)} "
            for other in names
        ):
            del found[name]
    return found


class DetectRequest(BaseModel):
    text: str


class ChemicalMatch(BaseModel):
    name: str
    status: str


class DetectResponse(BaseModel):
    matches: list[ChemicalMatch] | None = None
    message: str | None = None


@app.post("/detect-chemicals", response_model=DetectResponse, response_model_exclude_none=True)
def detect_chemicals_endpoint(request: DetectRequest):
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Field 'text' must not be empty.")
    found = detect_chemicals(request.text)
    if not found:
        return DetectResponse(message="No banned or restricted chemical detected")
    return DetectResponse(
        matches=[ChemicalMatch(name=name, status=status) for name, status in found.items()]
    )


@app.get("/health")
def health():
    _ensure_loaded()
    return {"status": "ok", "chemicals_loaded": len(_CANDIDATES)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
