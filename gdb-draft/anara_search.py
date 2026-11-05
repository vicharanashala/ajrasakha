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

import anara_tokens
import library_files

logger = logging.getLogger(__name__)

# Anara stops a script after 39 seconds itself, so a call that takes longer is stuck
ANARA_TIMEOUT_SECONDS = 45
_WORD = re.compile(r"[a-z0-9]+")
_CROP_NOISE = frozenset({"and", "or", "of", "the", "other", "others"})
# a record's own file is uploaded as "src-<Zoho file id>__<name>.pdf" (anara_sources.py)
_RECORD_SOURCE_NAME = re.compile(r"^src-([A-Za-z0-9]+)__(.*?)(?:\.pdf)?$")


# The library has no state field. A document names its state in its file name (Odisha__Paddy__...) or
# in its title (Package of Practices for Crops of Punjab); the rest are national or unstated.
STATES = (
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh",
)
_STATE_ALIASES = {
    "orissa": "Odisha", "tamilnadu": "Tamil Nadu", "pau": "Punjab", "angrau": "Andhra Pradesh",
    "tnau": "Tamil Nadu", "ysr": "Andhra Pradesh", "dharmapuri": "Tamil Nadu", "ludhiana": "Punjab",
}
# fewer usable passages than this from the state's own and national documents: the rest of the library is searched too
MIN_STATE_HITS = 6


def canonical_state(text: str | None) -> str | None:
    """The state a name or title refers to, or None when it names none or more than one."""
    haystack = " ".join(_WORD.findall((text or "").lower()))
    found = {state for state in STATES if f" {' '.join(_WORD.findall(state.lower()))} " in f" {haystack} "}
    found |= {state for word, state in _STATE_ALIASES.items() if f" {word} " in f" {haystack} "}
    return found.pop() if len(found) == 1 else None


def state_scope_ids(state: str | None) -> list[str] | None:
    """The documents a record of this state may use: its own state's and the ones that name no state.
    None when the state is unknown or nothing would be left out."""
    wanted = canonical_state(state)
    if not wanted:
        return None
    ids, left_out = [], 0
    for name, entry in library_files.load_manifest().items():
        document_state = canonical_state(name.split("~")[0])
        if document_state in (None, wanted):
            ids.append(entry["documentId"])
        else:
            left_out += 1
    return ids if ids and left_out else None


def other_state_notice(citations: list[dict[str, Any]], state: str | None) -> str:
    """A warning for the reviewer when the cited documents belong to other states than the record's.
    Empty when there is no state, or every cited document is the record's own state's or names no state."""
    wanted = canonical_state(state)
    if not wanted:
        return ""
    cited = {canonical_state(str(c.get("documentName") or "").split("~")[0]) for c in citations}
    cited.discard(None)
    others = sorted(cited - {wanted})
    if not others:
        return ""
    names = ", ".join(others)
    if wanted not in cited:
        return (f"No cited document is specific to {wanted}; the advice comes from {names} documents and may not "
                f"apply there. Check it before accepting.")
    return f"Some cited documents are from other states ({names}); check that they apply to {wanted}."


def enabled() -> bool:
    return os.getenv("DRAFT_SEARCH", "anara").strip().lower() != "local"


def install_tokens() -> bool:
    """Write the sign-in to where the Anara client reads it, if not there already. It comes from
    ANARA_TOKENS_B64 and, when ANARA_TOKEN_SECRET is set, from Secret Manager: the newer of the two is used,
    because every renewal makes the older refresh token useless."""
    import anara_client

    if anara_client.TOKEN_FILE.exists():
        return False
    candidates = []
    encoded = os.getenv("ANARA_TOKENS_B64", "").strip()
    if len(encoded) >= 20:  # a short value is the deployment's "none" placeholder
        try:
            candidates.append(json.loads(base64.b64decode(encoded, validate=True).decode("utf-8")))
        except ValueError:
            logger.warning("ANARA_TOKENS_B64 is not a base64 encoded JSON file; ignoring it")
    remote = anara_tokens.remote_load()
    if remote:
        candidates.append(remote)
    if not candidates:
        return False
    newest = max(candidates, key=lambda data: data.get("saved_at") or 0)
    anara_client.TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    anara_client.TOKEN_FILE.write_text(json.dumps(newest, indent=2), encoding="utf-8")
    return True


def keepalive(hours: float = 6) -> None:
    """Use Anara every few hours so its sign-in is renewed before it runs out, even when nobody drafts."""
    import anara_client

    while True:
        try:
            prepare()
            within(ANARA_TIMEOUT_SECONDS, anara_client.library_size)
        except Exception as error:
            logger.warning("the Anara keep-alive failed: %s", error)
        time.sleep(hours * 3600)


def prepare() -> None:
    """Make the Anara client safe on a server: install the saved sign-in, and never wait for a browser sign-in
    (with no sign-in saved, the client would wait five minutes for a person who is not there)."""
    os.environ.setdefault("ANARA_NO_BROWSER", "1")
    install_tokens()


def within(seconds: float, function: Any, *args: Any) -> Any:
    """function(*args) on a worker thread (the Anara client runs its own event loop), or a TimeoutError after
    the seconds. A call that is still stuck is left on its thread; the caller does not wait for it."""
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        return pool.submit(function, *args).result(timeout=seconds)
    except concurrent.futures.TimeoutError:  # a different class from TimeoutError before Python 3.11
        raise TimeoutError(f"no answer after {seconds} seconds") from None
    finally:
        pool.shutdown(wait=False)


def check() -> dict[str, Any]:
    """Whether Anara works right now, for the /status route."""
    if not enabled():
        return {"enabled": False}
    started = time.time()
    try:
        prepare()
        import anara_client

        documents = within(ANARA_TIMEOUT_SECONDS, anara_client.library_size)
        return {"enabled": True, "ok": True, "documents": documents, "seconds": round(time.time() - started, 1)}
    except Exception as error:
        return {"enabled": True, "ok": False, "error": str(error)[:300]}


def crop_words(crop: str | None) -> set[str]:
    return {w for w in _WORD.findall((crop or "").lower()) if w not in _CROP_NOISE and len(w) > 2}


def mentions_crop(hit: dict[str, Any], words: set[str]) -> bool:
    """True when the passage's document name or text names the crop, so another crop's page is not used."""
    haystack = f"{hit.get('documentName', '')} {hit.get('text', '')}".lower()
    return any(re.search(rf"\b{re.escape(word)}", haystack) for word in words)


def without_repeats(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The same page often sits in the library twice (two copies of a document); the model reads only a few
    passages, so a repeat is left out and its place goes to another passage."""
    seen: set[str] = set()
    kept = []
    for hit in hits:
        key = " ".join(_WORD.findall(str(hit.get("text", "")).lower()))[:200]
        if key and key in seen:
            continue
        seen.add(key)
        kept.append(hit)
    return kept


def search(question: str, crop: str | None = None, state: str | None = None) -> list[dict[str, Any]] | None:
    """Passages from the Anara library, or None when Anara cannot be used (the caller falls back).

    A record with a state is searched first in the documents of that state and the national ones; when
    that gives too few passages, the rest of the library is searched too and its passages come last."""
    if not enabled():
        return None
    try:
        prepare()
        import anara_client

        words = crop_words(crop)
        query = question if not words or any(w in question.lower() for w in words) else f"{crop} {question}"

        def run(document_ids: list[str] | None) -> list[dict[str, Any]]:
            for attempt in (1, 2):
                try:
                    found = within(ANARA_TIMEOUT_SECONDS, anara_client.search_library, query, document_ids)
                    found = [hit for hit in found if mentions_crop(hit, words)] if words else found
                    # only passages that can be cited count: a document with no PDF here is dropped below
                    openable = library_files.openable_document_ids()
                    return [
                        hit for hit in found
                        if hit.get("documentId") in openable or _RECORD_SOURCE_NAME.match(str(hit.get("documentName") or ""))
                    ]
                except Exception as error:
                    # a network hiccup or a busy moment passes; an expired sign-in does not
                    if attempt == 2 or "sign-in has expired" in str(error):
                        raise
                    logger.warning("Anara search failed, trying once more: %s", error)
            return []

        scope = state_scope_ids(state)
        hits = run(scope)
        if scope and len(hits) < MIN_STATE_HITS:
            seen = {hit.get("passageId") for hit in hits}
            hits += [hit for hit in run(None) if hit.get("passageId") not in seen]
    except Exception as error:  # sign-in expired, usage limit, network
        logger.warning("Anara search unavailable, using the local search: %s", error)
        return None
    return finish_hits(hits)


def finish_hits(hits: list[dict[str, Any]], keep_unopenable: bool = False) -> list[dict[str, Any]]:
    """Make passages ready to cite: record files under their own names, no document the reviewer cannot
    open (unless keep_unopenable: the agent chose them, and the draft says which cannot be opened), the full
    document name, and no repeated page."""
    for hit in hits:
        uploaded = _RECORD_SOURCE_NAME.match(str(hit.get("documentName") or ""))
        if uploaded:  # a file uploaded for some record: its PDF is fetched from Zoho again when it is opened
            hit["documentId"] = f"src-{uploaded.group(1)}"
            hit["documentName"] = uploaded.group(2) or hit["documentName"]
    # a citation the reviewer cannot open is worse than none, so a document we hold no file for is left out
    openable = library_files.openable_document_ids()
    skipped = [hit for hit in hits if hit.get("documentId") not in openable and not str(hit.get("documentId")).startswith("src-")]
    if skipped and keep_unopenable:
        skipped = []
    if skipped:
        logger.warning("left out %d passages of documents that cannot be opened: %s", len(skipped),
                       sorted({str(hit.get("documentName")) for hit in skipped}))
    hits = [hit for hit in hits if hit not in skipped]
    for hit in hits:
        full_name = library_files.name_for_document(hit.get("documentId", ""))
        if full_name:
            hit["documentName"] = full_name  # Anara shortens long names in its hits
        hit["sourcePages"] = hit.get("sourcePages") or []
    return without_repeats(hits)
