import difflib
import logging
import math
import os
import re
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pymongo import MongoClient
from pymongo.errors import PyMongoError

# basic logging setup so we can see what's happening in the Render logs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("chemical_detector")

# this service's own .env wins if present; the repo root .env is a fallback
# for anything not set here (load_dotenv never overwrites an already-set var,
# so loading the local one first gives it priority). No-op on Render, where
# vars are set directly in the dashboard per service - there's no root .env there.
# Also a no-op inside Docker: the repo's apis/chemical_detector/ nesting only
# exists on the host - in the container everything is flattened to /app, so
# there's no repo root to find (and Compose's env_file already injected
# everything as real env vars before this even runs, so it's not needed there).
load_dotenv()
_parents = Path(__file__).resolve().parents
if len(_parents) > 2:
    load_dotenv(_parents[2] / ".env")

app = FastAPI(title="Banned/Restricted Chemical Detector")

# this DB is separate from the main app's DB_URL on purpose - it's a different,
# external, read-only cluster that the Reviewer System team gave us access to
CHEMICAL_DB_URL = os.getenv("CHEMICAL_DB_URL")
CHEMICAL_DB_NAME = os.getenv("CHEMICAL_DB_NAME", "agriai")
CHEMICAL_COLLECTION_NAME = os.getenv("CHEMICAL_COLLECTION_NAME", "crop_master")

# mongodb+srv:// connects/resolves DNS as soon as MongoClient() is called, so if the
# host is wrong or unreachable it would crash the app on startup. wrapping it here
# so the app still comes up and just reports 503 on the endpoints instead of dying.
try:
    client = MongoClient(CHEMICAL_DB_URL)
    collection = client[CHEMICAL_DB_NAME][CHEMICAL_COLLECTION_NAME]
except PyMongoError as e:
    log.error("[chemical_detector] failed to initialize MongoDB client: %s", e)
    collection = None

SIMILARITY_CUTOFF = 0.85  # how close a word needs to match a chemical name/alias to count
_MIN_TOKEN_LEN = 3  # skip tiny words like "a", "ok" - too short to match anything meaningfully
_WORD_RE = re.compile(r"[A-Za-z0-9'-]+")  # pulls out words, drops punctuation

# a second, wider tokenizer that keeps commas/periods inside a word - needed
# for chemical codes like "2,4,5-T" or "2,4-D", which _WORD_RE would otherwise
# shred into meaningless fragments ("2", "4", "5-t") because it doesn't treat
# "," as part of a word. Only used for the punctuation-normalized pass below.
_CODE_RE = re.compile(r"[A-Za-z0-9,.\-]+")
_MIN_SQUASHED_LEN = 4  # don't bother matching squashed strings shorter than this

# trailing formulation/dosage code or a "-based"/"-insecticide" style suffix,
# e.g. "Carbaryl50EC" -> "carbaryl", "Aldrin-based" -> "aldrin". Stripping this
# before giving up on a word lets us still catch the real chemical name inside it.
_FORMULATION_SUFFIX_RE = re.compile(r"(-based|-insecticide|-pesticide|-formulation|\d+%?[a-z]{0,4})$")

# any non-whitespace run - wider than _WORD_RE, which drops symbols like "@"
# entirely. Needed to catch leetspeak ("M@l@thion") before it gets shredded.
_RAW_TOKEN_RE = re.compile(r"\S+")
_LEET_MAP = str.maketrans({"@": "a", "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s"})

# difflib's ratio is 2*shared/(lenA+lenB), capped by the shorter string's length,
# so two strings whose lengths are too far apart can NEVER reach SIMILARITY_CUTOFF
# no matter what they contain. This is the min(lenA,lenB)/max(lenA,lenB) that's
# just barely still possible - used below to skip candidates that can't match
# instead of running the full (much more expensive) fuzzy comparison on them.
_LEN_RATIO_BOUND = SIMILARITY_CUTOFF / (2 - SIMILARITY_CUTOFF)

# in-memory lookup table built once from the DB: lowercase name/alias -> (real name, status)
_CANDIDATES: dict[str, tuple[str, str]] = {}
_CANDIDATE_TERMS: list[str] = []
_TERMS_BY_LEN: dict[int, list[str]] = {}  # same terms, grouped by length - see _candidates_near_length

# same candidates again, but under three different normalizations, so we can
# catch matches the plain exact/fuzzy check above would miss:
_CANDIDATES_SQUASHED: dict[str, tuple[str, str]] = {}  # punctuation stripped, e.g. "2,4,5-t" -> "245t"
_CANDIDATES_SORTED: dict[str, tuple[str, str]] = {}  # words alphabetized, e.g. "calcium cyanide" -> "calcium cyanide" either order
_CANDIDATES_PHF: dict[str, tuple[str, str]] = {}  # "ph" -> "f" (same sound), e.g. "mevinphos" -> "mevinfos"

# how many words the longest real chemical name/alias has - computed from the
# actual data in _ensure_loaded() instead of a fixed number, so a future name
# longer than today's longest one still gets matched as a whole phrase.
_MAX_CANDIDATE_WORDS = 3
_LOADED = False


def _squash(s: str) -> str:
    """Lowercase and strip everything that isn't a letter or digit.
    "2,4,5-T" and "245T" both become "245t" - lets us match chemical codes
    however their punctuation is written, as long as the letters/digits agree."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _ensure_loaded() -> None:
    """Loads all chemical records from Mongo into memory, once. Every request
    calls this first, but after the first successful call it's just a no-op,
    so we're not hitting the DB on every single request."""
    global _CANDIDATES, _CANDIDATE_TERMS, _TERMS_BY_LEN
    global _CANDIDATES_SQUASHED, _CANDIDATES_SORTED, _CANDIDATES_PHF, _MAX_CANDIDATE_WORDS, _LOADED
    if _LOADED:
        return

    if collection is None:
        # client never connected in the first place (see try/except above)
        raise HTTPException(
            status_code=503,
            detail="Chemical database is currently unavailable. Please try again later.",
        )

    candidates: dict[str, tuple[str, str]] = {}
    try:
        # only pull the 3 fields we actually use - skips name/status/aliases'
        # surrounding fields (createdBy, timestamps, etc), lighter on both the
        # DB and our own memory once the chemical list gets big
        docs = list(
            collection.find({"type": "chemical"}, {"name": 1, "status": 1, "aliases": 1})
        )
    except PyMongoError as e:
        # DB was reachable before but the query itself failed (network blip, auth issue, etc.)
        log.error("[chemical_detector] chemical DB query failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Chemical database is currently unavailable. Please try again later.",
        )

    for doc in docs:
        name = (doc.get("name") or "").strip()
        status = (doc.get("status") or "").strip()
        if not name or not status:
            continue  # skip bad/incomplete records instead of crashing on them

        # a chemical can be found by its real name OR by any of its aliases,
        # so we map every variant to the same canonical name + status
        terms = {name.lower()}
        for alias in doc.get("aliases") or []:
            for key in ("english_representation", "native_representation"):
                val = (alias.get(key) or "").strip()
                if val:
                    terms.add(val.lower())
        for term in terms:
            candidates[term] = (name, status)

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
        if len(term_words) >= 2:  # sorting a single word is a no-op, skip it
            _CANDIDATES_SORTED[" ".join(sorted(term_words))] = value

    _CANDIDATES_PHF = {}
    for term, value in candidates.items():
        _CANDIDATES_PHF[term.replace("ph", "f")] = value

    _MAX_CANDIDATE_WORDS = max((len(t.split()) for t in _CANDIDATE_TERMS), default=3)

    _LOADED = True
    log.info("[chemical_detector] loaded %d chemical names/aliases", len(_CANDIDATES))


def _candidates_near_length(n: int) -> list[str]:
    """Only returns candidate terms whose length could possibly reach
    SIMILARITY_CUTOFF against a string of length n - anything outside this
    window is mathematically guaranteed to fail the fuzzy match anyway, so
    skipping them is free: same results, just without wasting time checking
    candidates that could never pass. This is what keeps fuzzy matching fast
    even if the chemical list grows into the thousands."""
    lo = max(1, math.floor(n * _LEN_RATIO_BOUND))
    hi = math.ceil(n / _LEN_RATIO_BOUND)
    narrowed: list[str] = []
    for length in range(lo, hi + 1):
        narrowed.extend(_TERMS_BY_LEN.get(length, ()))
    return narrowed


# ponytail: this length filter is a real, zero-risk speedup (verified identical
# results vs. a full scan), but normal English word lengths and chemical name
# lengths overlap too much for it to be a dramatic win on its own - measured
# ~1.3s per request at ~3500 candidate terms with a realistic ~150-word input.
# Fine for today's ~500-term DB. If the chemical list grows into the thousands
# and this gets too slow, swap difflib for `rapidfuzz` (same ratio/cutoff math,
# C-implemented, drop-in) rather than hand-rolling a smarter index here.


def _ngrams_with_pos(words: list[str], n: int) -> list[tuple[int, str]]:
    """Same idea as grouping words into consecutive n-word chunks, but also
    hands back the starting word-index of each chunk. We need the position so
    that once a long chunk gets a confident exact match, we can tell which
    shorter chunks are "inside" it and skip double-checking those."""
    return [(i, " ".join(words[i : i + n])) for i in range(len(words) - n + 1)]


def _fuzzy_lookup(term: str) -> tuple[str, str] | None:
    """Fuzzy-match one term against the candidate list (see _candidates_near_length
    for why we don't scan the whole list). Returns (name, status) or None."""
    match = difflib.get_close_matches(
        term, _candidates_near_length(len(term)), n=1, cutoff=SIMILARITY_CUTOFF
    )
    return _CANDIDATES[match[0]] if match else None


def _collapse_letter_spaced_runs(words: list[str]) -> list[str]:
    """Finds runs of 2+ consecutive single-letter words (e.g. from "E n d r i n"
    typed with spaces between every letter) and joins each run into one word,
    so it can be matched normally. Single letters almost never appear
    back-to-back in real sentences, so this only ever triggers on this
    specific obfuscation pattern."""
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
    """Replaces leetspeak stand-ins (@ -> a, 0 -> o, etc.) with the letter they
    represent, e.g. "M@l@thion" -> "malathion". Returns None if the token has
    none of those characters, so callers can skip the (rare) extra work."""
    if not any(c in token for c in "@0134578$"):
        return None
    return token.translate(_LEET_MAP).lower()


def _strip_formulation_suffix(term: str) -> str | None:
    """Removes a trailing dosage/formulation code or "-based" style suffix,
    e.g. "carbaryl50ec" -> "carbaryl", "aldrin-based" -> "aldrin". Returns None
    if there's nothing to strip, so callers can tell "no change" from "stripped
    down to the same string" (which can't actually happen here, but is cheap
    to tell apart)."""
    stripped = _FORMULATION_SUFFIX_RE.sub("", term).rstrip("-")
    return stripped if stripped and stripped != term else None


def detect_chemicals(text: str) -> dict[str, str]:
    """Scans the given text for banned/restricted chemicals.

    Splits the text into words, then checks every word-chunk (1 word up to
    however many words the longest real chemical name has) against the known
    chemical names/aliases, longest chunk first:
      1. exact match
      2. same words in a different order (e.g. "Cyanide Calcium" for "Calcium Cyanide")
      3. "ph" written as "f" or vice versa (e.g. "Mevinfos" for "Mevinphos")
      4. fuzzy match, so small typos still get caught
      5. if still nothing, strip a formulation/dosage suffix and retry 1-4
         (e.g. "Carbaryl50EC" -> "Carbaryl")
    Checking longest chunks first means once "methyl bromide" exact-matches,
    we don't also separately check "methyl" on its own and wrongly flag an
    unrelated chemical that it happens to resemble.

    Three separate passes handle text normal word-splitting can't represent:
      - a punctuation-tolerant tokenization for chemical codes like "2,4,5-T"
        (commas), matching "2,4,5-T" and "245T" the same way
      - collapsing runs of single letters typed with spaces ("E n d r i n")
      - decoding leetspeak stand-ins ("M@l@thion" -> "malathion")

    Returns {chemical name: status}, with each chemical only appearing once
    even if it's mentioned multiple times in the text.
    """
    _ensure_loaded()
    words = _WORD_RE.findall(text)
    found: dict[str, str] = {}
    seen_grams: set[str] = set()
    exact_covered: set[int] = set()  # word-indices already claimed by a bigger exact match

    for n in range(_MAX_CANDIDATE_WORDS, 0, -1):  # longest first, so exact hits can suppress shorter sub-matches
        for start, gram in _ngrams_with_pos(words, n):
            gram_l = gram.lower()
            if len(gram_l) < _MIN_TOKEN_LEN or gram_l in seen_grams:
                continue
            seen_grams.add(gram_l)  # don't re-check the same phrase twice
            span = range(start, start + n)

            # this chunk is fully inside a longer chunk that already matched
            # exactly - skip it entirely (exact or fuzzy), that's how "methyl"
            # (inside an already-matched "methyl bromide") used to also wrongly
            # flag the unrelated chemical "Methomyl" on its own, and how a real
            # but shorter name nested inside a longer one (e.g. "Ethyl Mercury
            # Chloride" inside "Methoxy Ethyl Mercury Chloride") used to fire
            # alongside the more specific, correct match.
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

    # separate pass: punctuation-tolerant tokenization, for chemical codes
    # like "2,4,5-T" that normal word-splitting would otherwise shred
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

    # separate pass: letters typed with spaces between them ("E n d r i n")
    for collapsed in _collapse_letter_spaced_runs(words):
        collapsed_l = collapsed.lower()
        if collapsed_l in _CANDIDATES:
            name, status = _CANDIDATES[collapsed_l]
            found[name] = status
        else:
            hit = _fuzzy_lookup(collapsed_l)
            if hit:
                found[hit[0]] = hit[1]

    # separate pass: leetspeak ("M@l@thion")
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

    # the suppression above only applies within the main word-based pass - the
    # punctuation/leetspeak/letter-spaced passes above run independently and
    # don't know about it, so they can still re-add a name that's actually
    # just a less-specific piece of another match we already have (e.g.
    # "Ethyl Mercury Chloride" re-appearing alongside "Methoxy Ethyl Mercury
    # Chloride", which contains it). Drop any found name that's a whole-word
    # substring of another found name, keeping the more specific one.
    if len(found) > 1:
        names = list(found)
        for name in names:
            contained_in_another = any(
                other != name and f" {name.lower()} " in f" {other.lower()} "
                for other in names
            )
            if contained_in_another:
                del found[name]

    return found


# ---- request/response shapes for the endpoint ----

class DetectRequest(BaseModel):
    text: str


class ChemicalMatch(BaseModel):
    name: str
    status: str


class DetectResponse(BaseModel):
    # only one of these two is ever filled in - matches when we found something,
    # message when we didn't. response_model_exclude_none=True on the route hides
    # whichever one is empty instead of sending it as null.
    matches: list[ChemicalMatch] | None = None
    message: str | None = None


@app.post("/detect-chemicals", response_model=DetectResponse, response_model_exclude_none=True)
def detect_chemicals_endpoint(request: DetectRequest):
    """Main endpoint the Reviewer System calls. Takes {"text": "..."} and tells
    them which banned/restricted chemicals (if any) show up in it."""
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
    """Simple check for Render/monitoring to confirm the service is up and
    the chemical data actually loaded from the DB."""
    _ensure_loaded()
    return {"status": "ok", "chemicals_loaded": len(_CANDIDATES)}


if __name__ == "__main__":
    # lets you run `python main.py` directly instead of going through uvicorn/docker
    uvicorn.run(app, host="0.0.0.0", port=8002)
