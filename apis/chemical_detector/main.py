import difflib
import logging
import os
import re

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

load_dotenv()  # picks up .env locally, no-op on Render where vars are set in the dashboard

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

# in-memory lookup table built once from the DB: lowercase name/alias -> (real name, status)
_CANDIDATES: dict[str, tuple[str, str]] = {}
_CANDIDATE_TERMS: list[str] = []
_LOADED = False


def _ensure_loaded() -> None:
    """Loads all chemical records from Mongo into memory, once. Every request
    calls this first, but after the first successful call it's just a no-op,
    so we're not hitting the DB on every single request."""
    global _CANDIDATES, _CANDIDATE_TERMS, _LOADED
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
        docs = list(collection.find({"type": "chemical"}))
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
    _LOADED = True
    log.info("[chemical_detector] loaded %d chemical names/aliases", len(_CANDIDATES))


def _ngrams(words: list[str], n: int) -> list[str]:
    """Groups a list of words into consecutive chunks of n words.
    e.g. n=2 on ["the","farmer","used","lasso"] -> ["the farmer","farmer used","used lasso"].
    Needed because some chemical names are 2-3 words long (e.g. "Benzene Hexachloride")."""
    return [" ".join(words[i : i + n]) for i in range(len(words) - n + 1)]


def detect_chemicals(text: str) -> dict[str, str]:
    """Scans the given text for banned/restricted chemicals.

    Splits the text into words, then checks every 1-word, 2-word, and 3-word
    combination against the known chemical names/aliases. Exact matches are
    free; anything else gets a fuzzy match so small typos still get caught.
    Returns {chemical name: status}, with each chemical only appearing once
    even if it's mentioned multiple times in the text.
    """
    _ensure_loaded()
    words = _WORD_RE.findall(text)
    found: dict[str, str] = {}
    seen_grams: set[str] = set()

    for n in (1, 2, 3):
        for gram in _ngrams(words, n):
            gram_l = gram.lower()
            if len(gram_l) < _MIN_TOKEN_LEN or gram_l in seen_grams:
                continue
            seen_grams.add(gram_l)  # don't re-check the same phrase twice

            if gram_l in _CANDIDATES:
                # exact hit, no need to bother with fuzzy matching
                name, status = _CANDIDATES[gram_l]
                found[name] = status
                continue

            # not an exact hit - see if it's close enough to count as a typo/variant
            match = difflib.get_close_matches(
                gram_l, _CANDIDATE_TERMS, n=1, cutoff=SIMILARITY_CUTOFF
            )
            if match:
                name, status = _CANDIDATES[match[0]]
                found[name] = status

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
