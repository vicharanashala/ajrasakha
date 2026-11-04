"""The draft service's main search: the Anara library, with the local search as the fallback.

Anara signs in through a browser, so a server cannot do it. Put the contents of the sign-in file
(%USERPROFILE%\.anara_mcp\tokens.json from a machine that has signed in) into the environment
variable ANARA_TOKENS_B64 (the same file, base64 encoded, so commas and quotes survive a deployment
setting); it is written to that file when the service starts and Anara's own
refresh keeps it valid. When the sign-in no longer works, or Anara is out of allowance, search()
returns None and the caller uses the local search instead.

DRAFT_SEARCH=local turns Anara off.
"""

from __future__ import annotations

import base64
import concurrent.futures
import json
import logging
import os
import re
import time
from typing import Any

import library_files

logger = logging.getLogger(__name__)

ANARA_TIMEOUT_SECONDS = 90
_WORD = re.compile(r"[a-z0-9]+")
_CROP_NOISE = frozenset({"and", "or", "of", "the", "other", "others"})
# a record's own file is uploaded as "src-<Zoho file id>__<name>.pdf" (anara_sources.py)
_RECORD_SOURCE_NAME = re.compile(r"^src-([A-Za-z0-9]+)__(.*?)(?:\.pdf)?$")


def enabled() -> bool:
    return os.getenv("DRAFT_SEARCH", "anara").strip().lower() != "local"


def install_tokens() -> bool:
    """Write the sign-in from ANARA_TOKENS_B64 to where the Anara client reads it, if not there already."""
    import anara_client

    encoded = os.getenv("ANARA_TOKENS_B64", "").strip()
    if len(encoded) < 20 or anara_client.TOKEN_FILE.exists():  # a short value is the deployment's "none" placeholder
        return False
    try:
        raw = base64.b64decode(encoded, validate=True).decode("utf-8")
        json.loads(raw)
    except ValueError:
        logger.warning("ANARA_TOKENS_B64 is not a base64 encoded JSON file; ignoring it")
        return False
    anara_client.TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    anara_client.TOKEN_FILE.write_text(raw, encoding="utf-8")
    return True


def check() -> dict[str, Any]:
    """Whether Anara works right now, for the /status route."""
    if not enabled():
        return {"enabled": False}
    os.environ.setdefault("ANARA_NO_BROWSER", "1")
    started = time.time()
    try:
        install_tokens()
        import anara_client

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            documents = pool.submit(anara_client.library_size).result(timeout=ANARA_TIMEOUT_SECONDS)
        return {"enabled": True, "ok": True, "documents": documents, "seconds": round(time.time() - started, 1)}
    except Exception as error:
        return {"enabled": True, "ok": False, "error": str(error)[:300]}


def crop_words(crop: str | None) -> set[str]:
    return {w for w in _WORD.findall((crop or "").lower()) if w not in _CROP_NOISE and len(w) > 2}


def mentions_crop(hit: dict[str, Any], words: set[str]) -> bool:
    """True when the passage's document name or text names the crop, so another crop's page is not used."""
    haystack = f"{hit.get('documentName', '')} {hit.get('text', '')}".lower()
    return any(re.search(rf"\b{re.escape(word)}", haystack) for word in words)


def search(question: str, crop: str | None = None) -> list[dict[str, Any]] | None:
    """Passages from the Anara library, or None when Anara cannot be used (the caller falls back)."""
    if not enabled():
        return None
    os.environ.setdefault("ANARA_NO_BROWSER", "1")
    try:
        install_tokens()
        import anara_client

        words = crop_words(crop)
        query = question if not words or any(w in question.lower() for w in words) else f"{crop} {question}"
        for attempt in (1, 2):
            try:
                # a worker thread, because the Anara client runs its own event loop
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    hits = pool.submit(anara_client.search_library, query).result(timeout=ANARA_TIMEOUT_SECONDS)
                break
            except Exception as error:
                # a network hiccup or a busy moment passes; an expired sign-in does not
                if attempt == 2 or "sign-in has expired" in str(error):
                    raise
                logger.warning("Anara search failed, trying once more: %s", error)
    except Exception as error:  # sign-in expired, usage limit, network
        logger.warning("Anara search unavailable, using the local search: %s", error)
        return None
    if words:
        hits = [hit for hit in hits if mentions_crop(hit, words)]
    for hit in hits:
        uploaded = _RECORD_SOURCE_NAME.match(str(hit.get("documentName") or ""))
        if uploaded:  # a file uploaded for some record: its PDF is fetched from Zoho again when it is opened
            hit["documentId"] = f"src-{uploaded.group(1)}"
            hit["documentName"] = uploaded.group(2) or hit["documentName"]
    # a citation the reviewer cannot open is worse than none, so a document we hold no file for is left out
    openable = library_files.openable_document_ids()
    skipped = [hit for hit in hits if hit.get("documentId") not in openable and not str(hit.get("documentId")).startswith("src-")]
    if skipped:
        logger.warning("left out %d passages of documents that cannot be opened: %s", len(skipped),
                       sorted({str(hit.get("documentName")) for hit in skipped}))
    hits = [hit for hit in hits if hit not in skipped]
    for hit in hits:
        full_name = library_files.name_for_document(hit.get("documentId", ""))
        if full_name:
            hit["documentName"] = full_name  # Anara shortens long names in its hits
        hit["sourcePages"] = hit.get("sourcePages") or []
    return hits
