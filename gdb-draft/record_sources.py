"""Search the documents attached to a GDB record as its sources.

A record's source is often a shared Zoho WorkDrive link (https://workdrive.zoho.in/file/<id>).
The link's page needs no login to download from, so the service fetches the PDF, keeps a copy
next to the library, reads its text page by page, and ranks the pieces against the question
with the same BM25 as the library search. A passage's pageNumber is the real PDF page.
"""

from __future__ import annotations

import math
import os
import re
import threading
from collections import Counter
from pathlib import Path
from typing import Any

import requests

import local_index
from library_files import DATA_DIRECTORY

SOURCE_DIRECTORY = DATA_DIRECTORY / "source_pdfs"
MAX_SOURCES = 3
MAX_PDF_BYTES = 60 * 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 60
TOP_K = 6

_LINK = re.compile(r"^https://workdrive\.zoho\.(in|com|eu|com\.au|jp)/file/([A-Za-z0-9]+)/?(?:[?#].*)?$")
_DOCUMENT_ID = re.compile(r"^src-([A-Za-z0-9]+)$")

_lock = threading.Lock()
_pages_cache: dict[tuple[str, int], list[str]] = {}


class SourceUnavailable(Exception):
    """The source could not be fetched or read; the message is shown to the reviewer."""


def parse_link(url: str) -> tuple[str, str] | None:
    """(zoho domain suffix, file id) of a WorkDrive file link, else None."""
    found = _LINK.match((url or "").strip())
    return (found.group(1), found.group(2)) if found else None


def document_id_for(file_id: str) -> str:
    return f"src-{file_id}"


def pdf_path_for_document(document_id: str) -> Path | None:
    """The saved PDF of a record source. The name comes from the id, which must be src-<letters/digits>."""
    found = _DOCUMENT_ID.match(document_id or "")
    if not found:
        return None
    path = SOURCE_DIRECTORY / f"{found.group(1)}.pdf"
    return path if path.is_file() else None


def fetch_pdf(url: str) -> Path:
    """Download the shared file once; a saved copy is reused. Raises SourceUnavailable."""
    parsed = parse_link(url)
    if parsed is None:
        raise SourceUnavailable("the source is not a Zoho WorkDrive file link")
    domain, file_id = parsed
    path = SOURCE_DIRECTORY / f"{file_id}.pdf"
    if path.is_file():
        return path
    try:
        response = requests.get(
            f"https://workdrive.zoho.{domain}/api/v1/download/{file_id}",
            timeout=DOWNLOAD_TIMEOUT_SECONDS,
            stream=True,
        )
        content = b""
        if response.status_code == 200:
            for block in response.iter_content(1024 * 1024):
                content += block
                if len(content) > MAX_PDF_BYTES:
                    raise SourceUnavailable("the source file is too large")
    except requests.RequestException as error:
        raise SourceUnavailable(f"the source could not be downloaded ({error.__class__.__name__})") from error
    if response.status_code != 200 or not content.startswith(b"%PDF"):
        raise SourceUnavailable("the source is not a shared PDF (it may need a login or be another file type)")
    SOURCE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f".{os.getpid()}.part")
    temporary.write_bytes(content)
    temporary.replace(path)
    return path


def pages_of_pdf(path: Path) -> list[str]:
    """The text of each PDF page, in order (empty string for a page with no text)."""
    key = (str(path), path.stat().st_mtime_ns)
    with _lock:
        if key in _pages_cache:
            return _pages_cache[key]
    from pypdf import PdfReader

    try:
        reader = PdfReader(str(path))
        # the text comes out with tabs and runs of spaces between words
        pages = [re.sub(r"[ 	 ]+", " ", page.extract_text() or "").strip() for page in reader.pages]
    except Exception as error:  # a damaged or protected PDF
        raise SourceUnavailable(f"the source PDF could not be read ({error.__class__.__name__})") from error
    with _lock:
        _pages_cache[key] = pages
    return pages


def _rank(question: str, pieces: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    terms = list(dict.fromkeys(local_index.tokens(question)))
    counts = [Counter(local_index.tokens(piece["text"])) for piece in pieces]
    lengths = [sum(c.values()) for c in counts]
    if not terms or not pieces or not any(lengths):
        return []
    total = len(pieces)
    average = sum(lengths) / total
    document_frequency: Counter = Counter()
    for c in counts:
        document_frequency.update(c.keys())
    scored: list[tuple[float, int]] = []
    for index, c in enumerate(counts):
        score = 0.0
        for term in terms:
            frequency = c.get(term, 0)
            if not frequency:
                continue
            df = document_frequency[term]
            idf = math.log(1 + (total - df + 0.5) / (df + 0.5))
            norm = frequency + local_index.BM25_K1 * (
                1 - local_index.BM25_B + local_index.BM25_B * lengths[index] / average
            )
            score += idf * frequency * (local_index.BM25_K1 + 1) / norm
        if score > 0:
            scored.append((score, index))
    scored.sort(reverse=True)
    return [pieces[i] for _, i in scored[:top_k]]


def search_sources(
    question: str, sources: list[dict[str, str]]
) -> tuple[list[dict[str, Any]], list[str]]:
    """Passages from the record's own source files, and a message for each source that failed.

    `sources` are {"url": ..., "name": ...}; links that are not shared Zoho files are skipped
    silently, since they are web pages or other things this search cannot read.
    """
    pieces: list[dict[str, Any]] = []
    problems: list[str] = []
    seen: set[str] = set()
    for source in sources:
        url = (source.get("url") or "").strip()
        parsed = parse_link(url)
        if parsed is None or parsed[1] in seen:
            continue
        seen.add(parsed[1])
        if len(seen) > MAX_SOURCES:
            break
        name = (source.get("name") or "").strip() or f"Source {parsed[1][:8]}"
        try:
            pages = pages_of_pdf(fetch_pdf(url))
        except SourceUnavailable as error:
            problems.append(f"{name}: {error}")
            continue
        if not any(pages):
            problems.append(f"{name}: the PDF has no readable text (it may be scanned)")
            continue
        for number, text in enumerate(pages, start=1):
            for part, chunk in enumerate(local_index.chunks_of([ln for ln in text.splitlines() if ln.strip()])):
                pieces.append({
                    "documentName": name,
                    "documentId": document_id_for(parsed[1]),
                    "pageNumber": number,
                    "sourcePages": [],
                    "passageId": f"{parsed[1][:8]}-{number}-{part}",
                    "text": chunk,
                })
    return _rank(question, pieces, TOP_K), problems
