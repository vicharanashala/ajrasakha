"""Standalone banned/restricted-chemical-name matcher. Ported verbatim
(same algorithm, same constants) from apis/chemical_detector/main.py's
detect_chemicals() rather than calling that sibling service over HTTP -
see Writing Assistant Build Plan, Revision 14, ISS-03: a real test report
showed that HTTP dependency failing both via cold-start 502s and platform-
level 429 rate-limiting, and the team wants this service immune to that
sibling's deploy/uptime/plan status entirely, not just more resilient to
it. This connects directly, read-only, to the same staging Mongo cluster
apis/chemical_detector reads from - the same authoritative source of
truth, just loaded in-process instead of over the network.
"""

import difflib
import logging
import math
import re

from pymongo import MongoClient
from pymongo.errors import PyMongoError

try:
    from wordfreq import zipf_frequency
except ImportError:  # pragma: no cover - wordfreq is a hard requirement in production
    zipf_frequency = None

from . import config

log = logging.getLogger("writing_assistant.chemical_matcher")


class ChemicalDetectorUnavailableError(Exception):
    pass


SIMILARITY_CUTOFF = 0.85  # how close a multi-word phrase needs to match to count
_MIN_TOKEN_LEN = 3  # skip tiny words like "a", "ok" - too short to match anything meaningfully
_WORD_RE = re.compile(r"[A-Za-z0-9'-]+")  # pulls out words, drops punctuation

# a flat similarity cutoff can't tell "real chemical typo" apart from "real
# English word/phrase that happens to look similar" - both score the same
# under plain string similarity. Pick one of two cutoffs instead, based on
# whether it's made of actual, independently-meaningful English words
# (checked by real-world word frequency, not a hardcoded list - so this
# protects against any common word/phrase that resembles a chemical name,
# not just ones we've already seen cause problems):
#   - common words ("methyl", "ammonium sulphate") must be a near-exact
#     match to count - typos of chemical names don't happen to also be
#     common, unrelated words
#   - a non-word ("akdrin", "quualphos") only makes sense as a misspelling
#     of something, so a looser match is safe
_COMMON_WORD_ZIPF_THRESHOLD = 1.0  # wordfreq scale; real typos score 0.0, "methyl" scores 3.2
_COMMON_WORD_CUTOFF = 0.95
_NONWORD_CUTOFF = 0.80
# the same one-letter difference swings the ratio much further on a short
# string than a long one, so the lenient cutoff above is only safe to use on
# longer non-words - below this length, fall back to the normal cutoff.
_NONWORD_LENIENT_MIN_LEN = 6

# a second, wider tokenizer that keeps commas/periods inside a word - needed
# for chemical codes like "2,4,5-T" or "2,4-D", which _WORD_RE would otherwise
# shred into meaningless fragments. Only used for the punctuation-normalized
# pass below.
_CODE_RE = re.compile(r"[A-Za-z0-9,.\-]+")
_MIN_SQUASHED_LEN = 4  # don't bother matching squashed strings shorter than this

# trailing formulation/dosage code or a "-based"/"-insecticide" style suffix,
# e.g. "Carbaryl50EC" -> "carbaryl", "Aldrin-based" -> "aldrin".
_FORMULATION_SUFFIX_RE = re.compile(r"(-based|-insecticide|-pesticide|-formulation|\d+%?[a-z]{0,4})$")

# any non-whitespace run - wider than _WORD_RE, which drops symbols like "@"
# entirely. Needed to catch leetspeak ("M@l@thion") before it gets shredded.
_RAW_TOKEN_RE = re.compile(r"\S+")
_LEET_MAP = str.maketrans({"@": "a", "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s"})

# difflib's ratio is 2*shared/(lenA+lenB), capped by the shorter string's length,
# so two strings whose lengths are too far apart can NEVER reach a given cutoff.
# This is the min(lenA,lenB)/max(lenA,lenB) that's just barely still possible -
# used to skip candidates that can't match instead of running the full fuzzy
# comparison on them.
_LEN_RATIO_BOUND = _NONWORD_CUTOFF / (2 - _NONWORD_CUTOFF)

# in-memory lookup table built once from the DB: lowercase name/alias -> (real name, status)
_CANDIDATES: dict[str, tuple[str, str]] = {}
_CANDIDATE_TERMS: list[str] = []
_TERMS_BY_LEN: dict[int, list[str]] = {}

# same candidates again, but under three different normalizations:
_CANDIDATES_SQUASHED: dict[str, tuple[str, str]] = {}  # punctuation stripped, e.g. "2,4,5-t" -> "245t"
_CANDIDATES_SORTED: dict[str, tuple[str, str]] = {}  # words alphabetized
_CANDIDATES_PHF: dict[str, tuple[str, str]] = {}  # "ph" -> "f" (same sound)

_MAX_CANDIDATE_WORDS = 3
_LOADED = False
_client: MongoClient | None = None
_collection = None


def _get_collection():
    global _client, _collection
    if _client is not None:
        return _collection
    if not config.CHEMICAL_DB_URL:
        return None
    try:
        _client = MongoClient(config.CHEMICAL_DB_URL)
        _collection = _client[config.CHEMICAL_DB_NAME][config.CHEMICAL_COLLECTION_NAME]
    except PyMongoError as exc:
        log.error("Failed to initialize chemical-staging MongoDB client: %s", exc)
        _collection = None
    return _collection


def _squash(s: str) -> str:
    """Lowercase and strip everything that isn't a letter or digit.
    "2,4,5-T" and "245T" both become "245t"."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _ensure_loaded() -> None:
    """Loads all chemical records from Mongo into memory, once per process
    - every call after the first successful one is a no-op."""
    global _CANDIDATES, _CANDIDATE_TERMS, _TERMS_BY_LEN
    global _CANDIDATES_SQUASHED, _CANDIDATES_SORTED, _CANDIDATES_PHF, _MAX_CANDIDATE_WORDS, _LOADED
    if _LOADED:
        return

    collection = _get_collection()
    if collection is None:
        # Never put the env var name or connection details in the
        # user-facing message - this reaches the public API response
        # (Writing Assistant Build Plan, Revision 16, ISS-14, confirmed
        # live: a real response leaked "CHEMICAL_DB_URL is not set"). The
        # real detail is only in this log line, server-side.
        log.error("Chemical staging DB is not configured or the client could not connect")
        raise ChemicalDetectorUnavailableError("chemical reference data is currently unavailable")

    try:
        docs = list(collection.find({"type": "chemical"}, {"name": 1, "status": 1, "aliases": 1}))
    except PyMongoError as exc:
        log.error("Chemical staging DB query failed: %s", exc)
        raise ChemicalDetectorUnavailableError("chemical reference data is currently unavailable") from exc

    candidates: dict[str, tuple[str, str]] = {}
    for doc in docs:
        name = (doc.get("name") or "").strip()
        status = (doc.get("status") or "").strip()
        if not name or not status:
            continue

        terms = {name.lower()}
        for alias in doc.get("aliases") or []:
            for key in ("english_representation", "native_representation"):
                val = (alias.get(key) or "").strip()
                if val:
                    terms.add(val.lower())
        for term in terms:
            candidates[term] = (name, status)

    _build_indices(candidates)
    _LOADED = True
    log.info("Loaded %d chemical names/aliases", len(_CANDIDATES))


def _build_indices(candidates: dict[str, tuple[str, str]]) -> None:
    """Builds every lookup index from a flat {term: (name, status)} dict.
    Split out from _ensure_loaded() so tests can populate the matcher with
    a small fake candidate set directly, without a real Mongo connection."""
    global _CANDIDATES, _CANDIDATE_TERMS, _TERMS_BY_LEN
    global _CANDIDATES_SQUASHED, _CANDIDATES_SORTED, _CANDIDATES_PHF, _MAX_CANDIDATE_WORDS

    _CANDIDATES = candidates
    _CANDIDATE_TERMS = list(candidates.keys())
    _TERMS_BY_LEN = {}
    for term in _CANDIDATE_TERMS:
        _TERMS_BY_LEN.setdefault(len(term), []).append(term)

    _CANDIDATES_SQUASHED = {}
    for term, value in candidates.items():
        squashed = _squash(term)
        if len(squashed) >= _MIN_SQUASHED_LEN:
            _CANDIDATES_SQUASHED[squashed] = value

    _CANDIDATES_SORTED = {}
    for term, value in candidates.items():
        term_words = term.split()
        if len(term_words) >= 2:
            _CANDIDATES_SORTED[" ".join(sorted(term_words))] = value

    _CANDIDATES_PHF = {}
    for term, value in candidates.items():
        _CANDIDATES_PHF[term.replace("ph", "f")] = value

    _MAX_CANDIDATE_WORDS = max((len(t.split()) for t in _CANDIDATE_TERMS), default=3)


def _candidates_near_length(n: int) -> list[str]:
    """Only returns candidate terms whose length could possibly reach
    SIMILARITY_CUTOFF against a string of length n."""
    lo = max(1, math.floor(n * _LEN_RATIO_BOUND))
    hi = math.ceil(n / _LEN_RATIO_BOUND)
    narrowed: list[str] = []
    for length in range(lo, hi + 1):
        narrowed.extend(_TERMS_BY_LEN.get(length, ()))
    return narrowed


def _ngrams_with_pos(words: list[str], n: int) -> list[tuple[int, str]]:
    return [(i, " ".join(words[i : i + n])) for i in range(len(words) - n + 1)]


def _is_common_word(word: str) -> bool:
    """True if `word` is independently meaningful in everyday English."""
    if zipf_frequency is None:
        return False
    return zipf_frequency(word, "en") >= _COMMON_WORD_ZIPF_THRESHOLD


def _fuzzy_lookup(term: str) -> tuple[str, str] | None:
    words_in_term = term.split()
    if len(words_in_term) > 1:
        cutoff = _COMMON_WORD_CUTOFF if all(_is_common_word(w) for w in words_in_term) else SIMILARITY_CUTOFF
    elif _is_common_word(term):
        cutoff = _COMMON_WORD_CUTOFF
    elif len(term) >= _NONWORD_LENIENT_MIN_LEN:
        cutoff = _NONWORD_CUTOFF
    else:
        cutoff = SIMILARITY_CUTOFF

    match = difflib.get_close_matches(term, _candidates_near_length(len(term)), n=1, cutoff=cutoff)
    return _CANDIDATES[match[0]] if match else None


def _collapse_letter_spaced_runs(words: list[str]) -> list[str]:
    """Joins runs of 2+ consecutive single-letter words ("E n d r i n")."""
    collapsed: list[str] = []
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
    if not any(c in token for c in "@0134578$"):
        return None
    return token.translate(_LEET_MAP).lower()


def _strip_formulation_suffix(term: str) -> str | None:
    stripped = _FORMULATION_SUFFIX_RE.sub("", term).rstrip("-")
    return stripped if stripped and stripped != term else None


def detect_chemicals(text: str) -> dict[str, str]:
    """Scans text for banned/restricted chemicals. Returns {chemical name:
    status}. Raises ChemicalDetectorUnavailableError if the chemical list
    couldn't be loaded - callers must treat that as a failed check, never
    as 'nothing detected'. See apis/chemical_detector/main.py's own
    detect_chemicals() docstring for the full matching-strategy writeup -
    this is the same algorithm."""
    _ensure_loaded()
    words = _WORD_RE.findall(text)
    found: dict[str, str] = {}
    seen_grams: set[str] = set()
    exact_covered: set[int] = set()

    for n in range(_MAX_CANDIDATE_WORDS, 0, -1):
        for start, gram in _ngrams_with_pos(words, n):
            gram_l = gram.lower()
            if len(gram_l) < _MIN_TOKEN_LEN or gram_l in seen_grams:
                continue
            seen_grams.add(gram_l)
            span = range(start, start + n)

            if span and all(i in exact_covered for i in span):
                continue

            if gram_l in _CANDIDATES:
                name, status = _CANDIDATES[gram_l]
                found[name] = status
                exact_covered.update(span)
                continue

            if n >= 2:
                sorted_gram = " ".join(sorted(gram_l.split()))
                if sorted_gram in _CANDIDATES_SORTED:
                    name, status = _CANDIDATES_SORTED[sorted_gram]
                    found[name] = status
                    continue

            phf_gram = gram_l.replace("ph", "f")
            if phf_gram in _CANDIDATES_PHF:
                name, status = _CANDIDATES_PHF[phf_gram]
                found[name] = status
                continue

            hit = _fuzzy_lookup(gram_l)
            if hit:
                found[hit[0]] = hit[1]
                continue

            stripped = _strip_formulation_suffix(gram_l)
            if stripped and len(stripped) >= _MIN_TOKEN_LEN:
                if stripped in _CANDIDATES:
                    name, status = _CANDIDATES[stripped]
                    found[name] = status
                else:
                    hit = _fuzzy_lookup(stripped)
                    if hit:
                        found[hit[0]] = hit[1]

    code_words = _CODE_RE.findall(text)
    seen_squashed: set[str] = set()
    for n in (1, 2, 3):
        for _, gram in _ngrams_with_pos(code_words, n):
            squashed = _squash(gram)
            if len(squashed) < _MIN_SQUASHED_LEN or squashed in seen_squashed:
                continue
            seen_squashed.add(squashed)
            if squashed in _CANDIDATES_SQUASHED:
                name, status = _CANDIDATES_SQUASHED[squashed]
                found[name] = status

    for collapsed in _collapse_letter_spaced_runs(words):
        collapsed_l = collapsed.lower()
        if collapsed_l in _CANDIDATES:
            name, status = _CANDIDATES[collapsed_l]
            found[name] = status
        else:
            hit = _fuzzy_lookup(collapsed_l)
            if hit:
                found[hit[0]] = hit[1]

    for raw_token in _RAW_TOKEN_RE.findall(text):
        decoded = _leet_decode(raw_token)
        if not decoded or len(decoded) < _MIN_TOKEN_LEN:
            continue
        if decoded in _CANDIDATES:
            name, status = _CANDIDATES[decoded]
            found[name] = status
        else:
            hit = _fuzzy_lookup(decoded)
            if hit:
                found[hit[0]] = hit[1]

    if len(found) > 1:
        names = list(found)
        for name in names:
            contained_in_another = any(
                other != name and f" {name.lower()} " in f" {other.lower()} " for other in names
            )
            if contained_in_another:
                del found[name]

    return found
