"""Search the translated POP documents without Anara.

Reads the translated DOCX files under data/pop_downloads/<state>/<crop>/<document>/, splits each
at its "... - page_NNN" marker lines (one per source page), and ranks the pieces against a
question with BM25. Nothing leaves this machine and there is no usage limit.

search_library() returns passages in the same shape as anara_client.search_library, so the
drafter and the draft service use either. A passage's pageNumber is None here: the converted
PDF has no page map, so a citation carries the source page (sourcePages) from the markers.
"""

from __future__ import annotations

import hashlib
import math
import re
import threading
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterator
from xml.etree import ElementTree

from library_files import DATA_DIRECTORY, PDF_DIRECTORY

DOCX_ROOT = DATA_DIRECTORY / "pop_downloads"
CHUNK_CHARS = 900
MAX_PARAGRAPH_CHARS = 1200
MIN_CHUNK_CHARS = 60
TOP_K = 12
BM25_K1 = 1.5
BM25_B = 0.75

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_MARKER = re.compile(r"\S*\s*-?\s*page_(\d+)")
_WORD = re.compile(r"[a-z0-9]+")
_STOP_WORDS = frozenset(
    "a an and are as at be by can do does for from has have how i in into is it its of on or "
    "should that the their there these this to was what when where which who why will with you your "
    "me my we our us about per use used using need needs".split()
)


def _text_of(element: ElementTree.Element) -> str:
    parts: list[str] = []
    for node in element.iter():
        if node.tag == _W + "t":
            parts.append(node.text or "")
        elif node.tag == _W + "tab":
            parts.append(" ")
        elif node.tag == _W + "br":
            parts.append(" ")
    return "".join(parts).strip()


def docx_lines(path: Path) -> Iterator[str]:
    """The text lines of a DOCX in reading order. A table row is one line, cells joined by ' | '."""
    with zipfile.ZipFile(path) as archive:
        root = ElementTree.fromstring(archive.read("word/document.xml"))
    body = root.find(_W + "body")
    if body is None:
        return
    for child in body:
        if child.tag == _W + "p":
            line = _text_of(child)
            if line:
                yield line
        elif child.tag == _W + "tbl":
            for row in child.iter(_W + "tr"):
                cells = [_text_of(cell) for cell in row.findall(_W + "tc")]
                line = " | ".join(c for c in cells if c)
                if line:
                    yield line


def pages_of(lines: Iterator[str]) -> list[tuple[int | None, list[str]]]:
    """Group lines by source page. A line holding 'page_NNN' starts page NNN and is not kept."""
    pages: list[tuple[int | None, list[str]]] = [(None, [])]
    for line in lines:
        marker = _MARKER.search(line)
        if marker:
            pages.append((int(marker.group(1)), []))
            line = _MARKER.sub("", line).strip(" -")
        if line:
            pages[-1][1].append(line)
    return [page for page in pages if page[1]]


def chunks_of(page_lines: list[str]) -> list[str]:
    """Pieces of about CHUNK_CHARS from one page's lines; a piece never crosses a page."""
    pieces: list[str] = []
    current = ""
    for line in page_lines:
        while len(line) > MAX_PARAGRAPH_CHARS:
            cut = line.rfind(" ", 0, MAX_PARAGRAPH_CHARS)
            cut = cut if cut > 0 else MAX_PARAGRAPH_CHARS
            pieces.append(line[:cut])
            line = line[cut:].strip()
        if current and len(current) + len(line) + 1 > CHUNK_CHARS:
            pieces.append(current)
            current = ""
        current = f"{current}\n{line}" if current else line
    if current:
        pieces.append(current)
    return [p for p in pieces if len(p.strip()) >= MIN_CHUNK_CHARS]


def _stem(word: str) -> str:
    for suffix in ("ing", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def tokens(text: str) -> list[str]:
    return [_stem(w) for w in _WORD.findall(text.lower()) if w not in _STOP_WORDS and len(w) > 1]


def document_id_for(relative_path: str) -> str:
    return hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:24]


class Index:
    """All chunks of all documents under a folder, ready for BM25."""

    def __init__(self, root: Path):
        self.root = root
        self.documents: dict[str, dict[str, Any]] = {}
        self.chunks: list[dict[str, Any]] = []
        self._frequencies: list[Counter] = []
        self._lengths: list[int] = []
        self._document_frequency: Counter = Counter()
        self.signature = signature_of(root)
        for path in sorted(root.rglob("*.docx")) if root.is_dir() else []:
            self._add_document(path)
        self._average_length = (sum(self._lengths) / len(self._lengths)) if self._lengths else 0.0

    def _add_document(self, path: Path) -> None:
        relative = path.relative_to(self.root).as_posix()
        parts = relative.split("/")
        state, crop = (parts[0], parts[1]) if len(parts) >= 4 else ("", "")
        document_id = document_id_for(relative)
        try:
            pages = pages_of(docx_lines(path))
        except (zipfile.BadZipFile, KeyError, ElementTree.ParseError):
            return  # a file that is not a readable DOCX is left out of the library
        self.documents[document_id] = {"relative": relative, "state": state, "crop": crop, "name": path.name}
        for page, page_lines in pages:
            for number, text in enumerate(chunks_of(page_lines)):
                counts = Counter(tokens(f"{crop} {state} {text}"))
                self.chunks.append({
                    "documentId": document_id,
                    "sourcePage": page,
                    "passageId": f"{document_id[:8]}-{page or 0}-{number}",
                    "text": text,
                })
                self._frequencies.append(counts)
                self._lengths.append(sum(counts.values()))
                self._document_frequency.update(counts.keys())

    def crops_for(self, question: str, crop: str | None) -> set[str]:
        """Crop folders the search is limited to: the given crop, else crops the question names.

        A crop matches when all words of its folder name appear in the hint. Empty means no
        limit, so a question about no known crop still searches everything.
        """
        hint = set(tokens(crop if crop else question))
        names = {document["crop"] for document in self.documents.values() if document["crop"]}
        return {name for name in names if (words := set(tokens(name))) and words <= hint}

    def search(
        self, question: str, crop: str | None = None, top_k: int = TOP_K
    ) -> list[dict[str, Any]]:
        terms = list(dict.fromkeys(tokens(question)))
        if not terms or not self.chunks:
            return []
        total = len(self.chunks)
        allowed = self.crops_for(question, crop)
        if crop and crop.strip() and not allowed:
            return []  # the record's crop has no documents: say so, rather than answer from another crop
        scored: list[tuple[float, int]] = []
        for index, counts in enumerate(self._frequencies):
            if allowed and self.documents[self.chunks[index]["documentId"]]["crop"] not in allowed:
                continue
            score = 0.0
            for term in terms:
                frequency = counts.get(term, 0)
                if not frequency:
                    continue
                df = self._document_frequency[term]
                idf = math.log(1 + (total - df + 0.5) / (df + 0.5))
                norm = frequency + BM25_K1 * (1 - BM25_B + BM25_B * self._lengths[index] / self._average_length)
                score += idf * frequency * (BM25_K1 + 1) / norm
            if score > 0:
                scored.append((score, index))
        scored.sort(reverse=True)
        return [self._passage(self.chunks[i]) for _, i in scored[:top_k]]

    def _passage(self, chunk: dict[str, Any]) -> dict[str, Any]:
        document = self.documents[chunk["documentId"]]
        return {
            "documentName": library_name(document),
            "documentId": chunk["documentId"],
            "pageNumber": None,
            "sourcePages": [chunk["sourcePage"]] if chunk["sourcePage"] else [],
            "passageId": chunk["passageId"],
            "text": chunk["text"],
        }


def library_name(document: dict[str, Any]) -> str:
    """The name a citation shows, the same <state>__<crop>__<file>.pdf the Anara upload uses."""
    if document["state"]:
        return f"{document['state']}__{document['crop']}__{Path(document['name']).with_suffix('.pdf')}"
    return str(Path(document["name"]).with_suffix(".pdf"))


def signature_of(root: Path) -> tuple:
    if not root.is_dir():
        return ()
    return tuple((p.relative_to(root).as_posix(), p.stat().st_size, p.stat().st_mtime_ns) for p in sorted(root.rglob("*.docx")))


_lock = threading.Lock()
_index: Index | None = None


def current_index(root: Path | None = None) -> Index:
    """The index of the library folder, rebuilt when a file is added, changed or removed."""
    global _index
    folder = root or DOCX_ROOT
    with _lock:
        if _index is None or _index.root != folder or _index.signature != signature_of(folder):
            _index = Index(folder)
        return _index


def search_library(question: str, crop: str | None = None) -> list[dict[str, Any]]:
    return current_index().search(question, crop)


def pdf_path_for_document(document_id: str) -> Path | None:
    """The converted PDF a citation opens, if the id is a library document and the file exists.

    The file name comes from the index, never from the request, so a request cannot name any
    other file.
    """
    document = current_index().documents.get(document_id)
    if document is None:
        return None
    path = PDF_DIRECTORY / library_name(document)
    return path if path.is_file() else None
