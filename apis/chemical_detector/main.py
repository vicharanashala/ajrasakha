import difflib
import logging
import os
import re

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pymongo import MongoClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("chemical_detector")

load_dotenv()

app = FastAPI(title="Banned/Restricted Chemical Detector")

# Separate, read-only staging database shared by the Reviewer System team —
# intentionally not the main ajrasakha DB_URL.
CHEMICAL_DB_URL = os.getenv("CHEMICAL_DB_URL")
CHEMICAL_DB_NAME = os.getenv("CHEMICAL_DB_NAME", "agriai")
CHEMICAL_COLLECTION_NAME = os.getenv("CHEMICAL_COLLECTION_NAME", "crop_master")

client = MongoClient(CHEMICAL_DB_URL)
collection = client[CHEMICAL_DB_NAME][CHEMICAL_COLLECTION_NAME]

SIMILARITY_CUTOFF = 0.85
_MIN_TOKEN_LEN = 3
_WORD_RE = re.compile(r"[A-Za-z0-9'-]+")

# term (lowercased name or alias) -> (canonical name, status)
_CANDIDATES: dict[str, tuple[str, str]] = {}
_CANDIDATE_TERMS: list[str] = []
_LOADED = False


def _ensure_loaded() -> None:
    global _CANDIDATES, _CANDIDATE_TERMS, _LOADED
    if _LOADED:
        return
    candidates: dict[str, tuple[str, str]] = {}
    for doc in collection.find({"type": "chemical"}):
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
    _CANDIDATES = candidates
    _CANDIDATE_TERMS = list(candidates.keys())
    _LOADED = True
    log.info("[chemical_detector] loaded %d chemical names/aliases", len(_CANDIDATES))


def _ngrams(words: list[str], n: int) -> list[str]:
    return [" ".join(words[i : i + n]) for i in range(len(words) - n + 1)]


def detect_chemicals(text: str) -> dict[str, str]:
    """Return {canonical chemical name: status} for every banned/restricted
    chemical found in `text`, via 1/2/3-word tokens fuzzy-matched (cutoff 0.85)
    against known chemical names and aliases."""
    _ensure_loaded()
    words = _WORD_RE.findall(text)
    found: dict[str, str] = {}
    seen_grams: set[str] = set()

    for n in (1, 2, 3):
        for gram in _ngrams(words, n):
            gram_l = gram.lower()
            if len(gram_l) < _MIN_TOKEN_LEN or gram_l in seen_grams:
                continue
            seen_grams.add(gram_l)

            if gram_l in _CANDIDATES:
                name, status = _CANDIDATES[gram_l]
                found[name] = status
                continue

            match = difflib.get_close_matches(
                gram_l, _CANDIDATE_TERMS, n=1, cutoff=SIMILARITY_CUTOFF
            )
            if match:
                name, status = _CANDIDATES[match[0]]
                found[name] = status

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
