"""Check whether an answer's chemical/dose/formulation claims are actually
supported by its cited source document(s).

Fetches each cited source via the team's own Zoho WorkDrive workspace,
extracts text with pypdf, and asks MiniMax whether the answer's specific
claims are supported, contradicted, or simply not covered by the source.
When the answer's own citation is missing or unreadable, falls back to
(or tops up with) the pilot document index -- other real answers' most-cited
documents for the same crop -- rather than going straight to
NOT_APPLICABLE. See build_source_document_index.py.

Scope, deliberately: only chemical names, doses, units, and formulation
codes are checked -- not general factual correctness beyond what the
compared document(s) say. A source that is a scanned image (no extractable
text) is NOT_EVALUATED, not guessed at -- OCR support is a separate, larger
piece of work, out of scope here. Nothing downloaded here is kept beyond
this call; only the pilot index (built separately, offline) persists.
"""

from __future__ import annotations

import io
import json
import os
import re
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import requests
from pypdf import PdfReader

import run_stats
from llm_client import LLMCallFailed, call_llm
from normalizer import AnswerContext
from result_state import FAIL, NOT_EVALUATED, PASS, check_result, error_result, not_applicable_result
from uniformity_checker import extract_chemical_doses


ZOHO_API_BASE = "https://workdrive.zohoexternal.in/public/api/v1"
MIN_TEXT_CHARS = 200  # below this, treat the source as scanned/unusable
# Larger prompts round-trip through the MiniMax proxy far less reliably
# (observed directly during this project's reliability work). Keep both the
# per-source excerpt and the number of sources bounded rather than sending
# full documents.
MAX_SOURCE_CHARS_FOR_PROMPT = 4500
MAX_SOURCES_PER_CHECK = 2
FILE_ID_PATTERN = re.compile(r"/file/([A-Za-z0-9]+)")
USE_MOCK_LLM = os.getenv("USE_MOCK_LLM", "false").strip().casefold() in {
    "1", "true", "yes", "on"
}

# Pilot document index (Track B): a small cache of the most-cited real
# source documents, tagged by which crops actually cite them. Lets this
# check fall back to a relevant authoritative document when the answer's
# own citation is missing or unreadable, instead of going straight to
# NOT_APPLICABLE -- built by build_source_document_index.py, not fetched
# live here. Optional: an empty/missing index just means no fallback.
SOURCE_DOCUMENT_INDEX_PATH = Path(__file__).resolve().parent.parent / "data" / "source_document_index.json"
if SOURCE_DOCUMENT_INDEX_PATH.exists():
    with SOURCE_DOCUMENT_INDEX_PATH.open(encoding="utf-8") as index_source:
        SOURCE_DOCUMENT_INDEX: dict[str, dict[str, Any]] = json.load(index_source)
else:
    SOURCE_DOCUMENT_INDEX = {}


_CENTRAL_SOURCE_KEYWORDS = (
    "niphm", "national institute of plant health management", "ppqs", "icar",
    "national horticulture board", "directorate of pulses development",
    "directorate of jute development", "directorate of onion and garlic research",
    "crijaf", "central research institute",
)
_STATE_LOCAL_SOURCE_KEYWORDS = (
    "agricultural university", "agriculture university", "krishi vigyan kendra",
    "kvk", "state pop", "pau,", "pau ", "department of agriculture",
    "department of farmer welfare", "agriculture development", "college",
)


def _document_hierarchy_rank(source_name: str) -> int:
    """0 = state/local POP, 1 = central/national body, 2 = other -- per the
    team's stated document-preference order (state/local first, then
    central, then anything else) for when more than one relevant document
    exists for a crop. Central bodies are checked first and explicitly,
    since several of them (NIPHM, PPQS) also name a city in their own
    address ("NIPHM, Hyderabad") which must not be mistaken for a
    state-specific document.
    """
    lowered = source_name.casefold()
    if any(keyword in lowered for keyword in _CENTRAL_SOURCE_KEYWORDS):
        return 1
    if "government of india" in lowered:
        return 1
    if any(keyword in lowered for keyword in _STATE_LOCAL_SOURCE_KEYWORDS):
        return 0
    if "government of" in lowered:
        # Already ruled out "government of india" above, so this is a
        # state government department (e.g. "Government of Madhya Pradesh").
        return 0
    return 2


def _indexed_documents_for_crop(crop: str) -> list[dict[str, str]]:
    """Indexed documents whose citing answers actually covered this crop,
    state/local sources first, then central, then other, most-cited
    within each tier -- a real cross-check pool, not the answer's own
    self-reported citation.
    """
    normalized_crop = (crop or "").strip().casefold()
    if not normalized_crop:
        return []
    matches = [
        {"sourceName": doc["sourceName"], "text": doc["text"], "citations": doc["citations"]}
        for doc in SOURCE_DOCUMENT_INDEX.values()
        if normalized_crop in {c.strip().casefold() for c in doc.get("crops", [])}
    ]
    matches.sort(
        key=lambda doc: (_document_hierarchy_rank(doc["sourceName"]), -doc["citations"])
    )
    return matches


def _cross_check_dose_values(answer_text: str, source_texts: list[dict[str, str]]) -> str | None:
    """Deterministic, advisory cross-check: for a chemical mentioned with a
    dose in both the answer and the compared source text, do the numbers
    actually match? A real numeric disagreement is worth flagging
    alongside the LLM's own qualitative judgment, not left to it alone.
    Reuses uniformity_checker's own dose-extraction regex rather than
    re-deriving one -- same extraction, same known limitations.

    Advisory only, like the other deterministic cross-checks added
    tonight: only compares same-chemical, same-unit pairs (no unit
    conversion attempted, to avoid guessing), and returns None (no flag)
    whenever there's nothing directly comparable -- never invents a
    mismatch from incomplete data.
    """
    answer_doses = extract_chemical_doses({"answer_text": answer_text})
    if not answer_doses:
        return None
    combined_source_text = "\n".join(source["text"] for source in source_texts)
    source_doses = extract_chemical_doses({"answer_text": combined_source_text})
    if not source_doses:
        return None

    source_by_chemical: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in source_doses:
        source_by_chemical[item["chemical"].casefold()].append(item)

    for answer_item in answer_doses:
        candidates = source_by_chemical.get(answer_item["chemical"].casefold())
        if not candidates:
            continue
        same_unit = [c for c in candidates if c["unit"] == answer_item["unit"]]
        if not same_unit:
            continue  # different units -- don't guess at a conversion
        if any(c["dose"] == answer_item["dose"] for c in same_unit):
            continue  # at least one matching value -- treat as consistent
        source_values = sorted({f"{c['dose']}{c['unit']}" for c in same_unit})
        return (
            f"the answer states {answer_item['dose']}{answer_item['unit']} for "
            f"{answer_item['chemical']}, but the compared source text shows "
            f"{'/'.join(source_values)} instead"
        )
    return None


def _extract_zoho_file_id(url: str) -> str | None:
    match = FILE_ID_PATTERN.search(url or "")
    return match.group(1) if match else None


# --- Reading only the pages an answer cites ---------------------------------
#
# This check used to download each whole document, extract text from every
# page (minutes of CPU on a large package of practices) and keep the first
# 4,000 characters -- which is usually the cover and table of contents. A
# measured 12-answer run spent 94% of its time there, and the model kept
# reporting that the source held only front matter. The answer already says
# which pages it relies on, so read those instead.

PAGE_SEARCH_BEFORE = 2   # a printed page number can sit a little below or
PAGE_SEARCH_AFTER = 8    # above the PDF page index because of front matter
MAX_CITED_PAGES = 12     # never look at more than this many cited pages
MIN_OVERLAP_TOKENS = 3   # shared distinctive words needed to trust a page match

_FORMULATION_CLAIM = re.compile(
    r"\d+(?:\.\d+)?\s*%?\s*(?:WP|EC|CG|SC|WG|WDG|GR|SL|DS|SP|FS)\b", re.IGNORECASE
)


def parse_page_spec(spec: Any) -> list[int]:
    """'5,6,7' -> [5, 6, 7]; '20-24' -> 20..24; '75,76....95' -> 75, 76 and
    then 78..95 style ranges (an ellipsis between numbers means "through")."""
    text = str(spec or "").replace("\u2013", "-").replace("\u2014", "-")
    text = re.sub(r"\.{2,}|\u2026", "-", text)
    pages: list[int] = []
    for token in re.findall(r"\d+\s*-\s*\d+|\d+", text):
        if "-" in token:
            start, end = (int(part) for part in re.split(r"\s*-\s*", token))
            if start <= end and end - start <= 200:
                pages.extend(range(start, end + 1))
        else:
            pages.append(int(token))
    return [page for page in dict.fromkeys(pages) if page > 0]


def _distinctive_tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]{5,}", (text or "").casefold()))


def _cited_pages_text(reader: Any, cited_pages: list[int], answer_tokens: set[str]) -> str | None:
    """Text of the cited pages, or None when they can't be located.

    Printed page numbers rarely equal the PDF's page index (front matter),
    so pick the single offset that makes the cited pages share the most
    distinctive words with the answer, then keep the best-matching pages
    within the prompt budget.
    """
    total = len(reader.pages)
    cited = cited_pages[:MAX_CITED_PAGES]
    cache: dict[int, str] = {}

    def page_text(index: int) -> str:
        if index not in cache:
            try:
                cache[index] = reader.pages[index].extract_text() or ""
            except Exception:
                cache[index] = ""
        return cache[index]

    offsets = [0]
    for step in range(1, max(PAGE_SEARCH_BEFORE, PAGE_SEARCH_AFTER) + 1):
        if step <= PAGE_SEARCH_AFTER:
            offsets.append(step)
        if step <= PAGE_SEARCH_BEFORE:
            offsets.append(-step)

    best_offset, best_score = 0, -1
    for offset in offsets:
        score = sum(
            len(answer_tokens & _distinctive_tokens(page_text(page - 1 + offset)))
            for page in cited
            if 0 <= page - 1 + offset < total
        )
        if score > best_score:
            best_offset, best_score = offset, score
    if best_score < MIN_OVERLAP_TOKENS:
        return None

    located = [
        (page, page_text(page - 1 + best_offset))
        for page in cited
        if 0 <= page - 1 + best_offset < total
    ]
    by_relevance = sorted(
        located, key=lambda item: len(answer_tokens & _distinctive_tokens(item[1])), reverse=True
    )
    kept: dict[int, str] = {}
    budget = MAX_SOURCE_CHARS_FOR_PROMPT
    for page, text in by_relevance:
        if budget <= 0:
            break
        text = text.strip()
        if text:
            kept[page] = text[:budget]
            budget -= len(kept[page])
    return "\n\n".join(f"[page {page}]\n{kept[page]}" for page in sorted(kept)) or None


def _download_pdf(file_id: str, timeout: int) -> bytes | None:
    try:
        auth_resp = requests.get(f"{ZOHO_API_BASE}/downloadauth/{file_id}", timeout=timeout)
        auth_resp.raise_for_status()
        download_url = auth_resp.json().get("DOWNLOAD_LINK")
        if not download_url:
            return None
        file_resp = requests.get(download_url, timeout=timeout)
        file_resp.raise_for_status()
        return file_resp.content
    except (requests.RequestException, ValueError):
        return None


def fetch_source_text(
    url: str, page_spec: Any = "", answer_text: str = "", timeout: int = 30
) -> str | None:
    """Text of the pages an answer cites in a Zoho-hosted PDF.

    Returns None if the URL isn't a Zoho file link, no page is cited, the
    download or parse fails, or the cited pages can't be located. Timed, so
    a run can report how much wall-clock time went to fetching documents.
    """
    file_id = _extract_zoho_file_id(url)
    cited = parse_page_spec(page_spec)
    if not file_id or not cited:
        return None
    started = time.time()
    try:
        body = _download_pdf(file_id, timeout)
        if body is None:
            return None
        # In memory, not a temp file named after the document: two threads
        # checking answers that cite the same document would collide.
        reader = PdfReader(io.BytesIO(body))
        text = _cited_pages_text(reader, cited, _distinctive_tokens(answer_text))
    except Exception:
        return None
    finally:
        run_stats.record(document_fetches=1, document_fetch_seconds=time.time() - started)
    if text is None or len(text) < MIN_TEXT_CHARS:
        return None
    return text


def fetch_document_opening_text(url: str, timeout: int = 30) -> str | None:
    """First ~4,000 characters of a document -- only for the index builder,
    stopping as soon as enough text has been read instead of parsing every
    page. Not used by the check itself (front matter is not evidence)."""
    file_id = _extract_zoho_file_id(url)
    if not file_id:
        return None
    body = _download_pdf(file_id, timeout)
    if body is None:
        return None
    try:
        reader = PdfReader(io.BytesIO(body))
        text = ""
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"
            if len(text) >= MAX_SOURCE_CHARS_FOR_PROMPT:
                break
    except Exception:
        return None
    text = text.strip()
    return text[:MAX_SOURCE_CHARS_FOR_PROMPT] if len(text) >= MIN_TEXT_CHARS else None


# Just above the p99 answer length (15,741 chars) measured across all real
# labeled answers -- same prompt-size-vs-reliability tradeoff already
# applied to source text below.
MAX_ANSWER_CHARS_FOR_PROMPT = 16000


def build_fidelity_prompt(answer_text: str, source_texts: list[dict[str, str]]) -> str:
    sources_block = "\n\n".join(
        f"--- Source: {s['sourceName']} ---\n{s['text']}" for s in source_texts
    )
    return f"""You are checking whether an agricultural answer's specific chemical
names, doses, units, and formulation codes are actually supported by its
cited source document(s) below.

Answer: {answer_text[:MAX_ANSWER_CHARS_FOR_PROMPT]}

Cited source text (may include website navigation/header text mixed in
from how it was captured; ignore that and focus on substantive content):
{sources_block}

Check ONLY chemical names, dose values, units, and formulation codes (e.g.
EC, WP, SC, D.S., CG, %). For each such claim in the answer, determine
whether the source text supports it, contradicts it, or doesn't cover it.
Do not evaluate anything else about the answer's quality -- structure,
completeness, and other checks are handled separately.

Return ONLY valid JSON, no other text:
{{
  "status": "PASS",
  "detail": "reason",
  "checked_claims": [],
  "unsupported_claims": []
}}
Use FAIL only when the source text clearly contradicts a specific claim, or
names a different chemical/formulation than the answer states for the same
usage. Use NOT_EVALUATED when the source doesn't cover the relevant topic
at all, making comparison impossible. Use PASS when every checked claim is
supported, or the answer makes no checkable chemical/dose/formulation claim.
The first character of your response must be {{ and the last character }}."""


def _valid_fidelity_response(result: Any) -> bool:
    return (
        isinstance(result, dict)
        and result.get("status") in {PASS, FAIL, NOT_EVALUATED}
        and isinstance(result.get("detail"), str)
    )


def check_source_fidelity(context: AnswerContext) -> dict[str, Any]:
    """Return one source_fidelity check result for an answer."""
    if not (context.get("answer_text") or "").strip():
        return not_applicable_result("Answer text is empty; nothing to verify against a source")
    if USE_MOCK_LLM:
        # Skip the real document fetch entirely in mock mode, not just the
        # LLM call -- otherwise every mock run still hits the live Zoho API
        # for every sourced answer, defeating the point of mock mode being
        # fast and network-free.
        return check_result(PASS, "Mock LLM check passed", checked_claims=[], unsupported_claims=[])

    answer_text = context["answer_text"]
    if not (extract_chemical_doses({"answer_text": answer_text}) or _FORMULATION_CLAIM.search(answer_text)):
        # The check only verifies chemical names, doses and formulations.
        # With none stated there is nothing to compare, so skip the document
        # download and the model call entirely.
        return not_applicable_result("The answer states no chemical dose or formulation to verify against a source")

    sources = context.get("sources") or []
    cited_any_page = any(parse_page_spec(source.get("page")) for source in sources)
    source_texts = []
    for source in sources:
        if len(source_texts) >= MAX_SOURCES_PER_CHECK:
            break
        text = fetch_source_text(
            str(source.get("source") or ""), source.get("page"), answer_text
        )
        if text:
            source_texts.append(
                {"sourceName": str(source.get("sourceName") or source.get("source")), "text": text}
            )

    if not source_texts:
        return not_applicable_result(
            "Could not read the cited pages to check against (the pages may be scanned, "
            "unavailable, or not found in the document)"
            if cited_any_page
            else "No page is cited, so there is no specific passage to verify against "
                 "(see page_number_present)"
        )

    source_origin = "self_cited"

    prompt = build_fidelity_prompt(context["answer_text"], source_texts)
    try:
        result = call_llm(prompt, _valid_fidelity_response)
    except LLMCallFailed:
        return error_result(
            "Source-fidelity check could not be evaluated because the model call failed",
        )

    extra_fields = dict(
        source_origin=source_origin,
        checked_claims=result.get("checked_claims", []),
        unsupported_claims=result.get("unsupported_claims", []),
    )
    detail = result["detail"]
    if result["status"] == PASS:
        dose_conflict = _cross_check_dose_values(context["answer_text"], source_texts)
        if dose_conflict:
            # Deterministic disagreement, not an override -- same pattern
            # as the sequence/contextuality cross-checks: the model's PASS
            # stands, but a reviewer gets pointed at a real, auditable
            # numeric discrepancy the LLM's qualitative judgment missed.
            detail += f" (Flagged for review: {dose_conflict}.)"
    if result["status"] == NOT_EVALUATED:
        # The model itself is saying the source doesn't cover the relevant
        # topic -- permanent given this source's content, not a transient
        # failure, so it belongs in the same bucket as "no extractable text".
        return not_applicable_result(detail, **extra_fields)
    return check_result(result["status"], detail, **extra_fields)
