"""Search the Anara workspace library over MCP and return passages with page numbers.

Used by the GDB cleaning pipeline to find the POP passages a draft should cite.
The first call needs a browser sign-in; after that the token is reused from
%USERPROFILE%\\.anara_mcp\\tokens.json. Nothing is written to Anara.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx2
from mcp import ClientSession
from mcp.client.auth.oauth2 import OAuthClientProvider
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.auth import (
    AuthorizationCodeResult,
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthToken,
)

logger = logging.getLogger(__name__)

SERVER_URL = "https://anara.com/api/mcp"
CALLBACK_PORT = 8765
REDIRECT_URI = f"http://localhost:{CALLBACK_PORT}/callback"
TOKEN_FILE = Path.home() / ".anara_mcp" / "tokens.json"
# more candidates than the model reads, because the crop filter drops the passages of other crops
SEARCH_LIMIT = 40
SEARCH_TOP_K = 20
# passages are about 450 characters at the median and 5% run past 1500, so a longer cut loses little
PASSAGE_CHARS = 2500
# the passages whose source page is worked out; each one costs up to two pages of the sandbox's 20-page budget
SOURCE_PAGE_HITS = 8
# a hit that is only a page marker line has nothing to cite
MIN_PASSAGE_CHARS = 60
# words that say what is asked, not what to look for
_STOP_WORDS = frozenset(
    "a an and are as at be by can do does for from how i in is it its of on or should the to "
    "what when where which who why with would".split()
)


class _FileStorage:
    """Keeps OAuth tokens and the client registration in one private JSON file."""

    def _load(self) -> dict:
        if TOKEN_FILE.exists():
            return json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
        return {}

    def _save(self, data: dict) -> None:
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")

    async def get_tokens(self):
        raw = self._load().get("tokens")
        return OAuthToken(**raw) if raw else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        data = self._load()
        data["tokens"] = tokens.model_dump(mode="json", exclude_none=True)
        self._save(data)

    async def get_client_info(self):
        raw = self._load().get("client_info")
        return OAuthClientInformationFull(**raw) if raw else None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        data = self._load()
        data["client_info"] = client_info.model_dump(mode="json", exclude_none=True)
        self._save(data)


async def _open_browser(auth_url: str) -> None:
    if os.getenv("ANARA_NO_BROWSER"):
        # a server cannot sign in; fail at once instead of waiting for a person who is not there
        raise RuntimeError("The Anara sign-in has expired: sign in again on a machine with a browser")
    logger.info("Opening the Anara sign-in page in the browser")
    webbrowser.open(auth_url)


async def _wait_for_callback() -> AuthorizationCodeResult:
    """Serve localhost until Anara redirects back with a code."""
    result: dict[str, Any] = {}
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            query = parse_qs(urlparse(self.path).query)
            if "code" not in query:
                self.send_response(404)
                self.end_headers()
                return
            result["code"] = query["code"][0]
            result["state"] = query.get("state", [None])[0]
            result["iss"] = query.get("iss", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Anara sign-in received. You can close this tab.")
            done.set()

        def log_message(self, *args):
            pass

    server = HTTPServer(("localhost", CALLBACK_PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    await asyncio.to_thread(done.wait, 300)
    server.shutdown()
    if not result.get("code"):
        raise RuntimeError("No authorization code received from Anara")
    return AuthorizationCodeResult(code=result["code"], state=result["state"], iss=result["iss"])


def _provider() -> OAuthClientProvider:
    metadata = OAuthClientMetadata(
        redirect_uris=[REDIRECT_URI],
        token_endpoint_auth_method="none",
        grant_types=["authorization_code", "refresh_token"],
        response_types=["code"],
        scope="anara:read anara:chat anara:write",
        client_name="GDB cleaning pipeline",
    )
    return OAuthClientProvider(
        server_url=SERVER_URL,
        client_metadata=metadata,
        storage=_FileStorage(),
        redirect_handler=_open_browser,
        callback_handler=_wait_for_callback,
    )


def _phrasings(question: str) -> list[str]:
    """Extra ways to ask the same thing: the question reduced to its content words."""
    words = [w for w in re.findall(r"[\w'-]+", question.lower()) if w not in _STOP_WORDS and len(w) > 2]
    keywords = " ".join(words)
    return [keywords] if keywords and keywords != question.lower() else []


# JavaScript run inside Anara's sandbox, so one call does the search and the page lookup.
# The POP pipeline starts every source page with a line like "<document> - page_004", so the
# last marker before a passage tells which source page it belongs to. A passage that carries
# markers of its own spans more than one source page.
_SOURCE_PAGE_JS = """
function markers(text) {
  const found = [];
  const pattern = /page_(\\d+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) found.push({ page: Number(match[1]), at: match.index });
  return found;
}
const top = hits.slice(0, %(top)d);
const wanted = {};
top.forEach(function (h) {
  if (h.pageNumber == null) return;
  const pages = wanted[h.documentId] || (wanted[h.documentId] = {});
  pages[h.pageNumber] = true;
  if (h.pageNumber > 1) pages[h.pageNumber - 1] = true;
});
const request = Object.keys(wanted).map(function (id) {
  return { documentId: id, pages: Object.keys(wanted[id]).map(Number) };
});
const fetched = request.length ? anara.documents.getPages(request) : [];
const ordered = {};
fetched.forEach(function (doc) {
  ordered[doc.documentId] = doc.passages
    .map(function (p, i) { return { p: p, i: i }; })
    .sort(function (a, b) { return (a.p.pageNumber - b.p.pageNumber) || (a.i - b.i); })
    .map(function (x) { return x.p; });
});
function sourcePagesFor(h) {
  const passages = ordered[h.documentId] || [];
  const index = passages.findIndex(function (p) { return p.passageId === h.passageId; });
  if (index < 0) return [];
  let before = null;
  for (let i = index - 1; i >= 0 && before === null; i--) {
    const found = markers(passages[i].text);
    if (found.length) before = found[found.length - 1].page;
  }
  const own = markers(passages[index].text);
  const pages = [];
  if (before !== null && (own.length === 0 || own[0].at > 60)) pages.push(before);
  own.forEach(function (m) { if (pages.indexOf(m.page) < 0) pages.push(m.page); });
  return pages;
}
"""


def _search_code(query: str, document_ids: list[str] | None = None) -> str:
    """JavaScript run inside Anara's sandbox: a library search with each passage's source pages."""
    arguments: dict[str, Any] = {"query": query, "limit": SEARCH_LIMIT, "topK": SEARCH_TOP_K}
    if document_ids:  # only these documents are searched
        arguments["documentIds"] = document_ids
    extra = _phrasings(query)
    if extra:
        arguments["queries"] = extra
    return (
        f"const hits = anara.retrieval.search({json.dumps(arguments)});\n"
        + _SOURCE_PAGE_JS % {"top": SOURCE_PAGE_HITS}
        + "return hits.map(function (h, n) {\n"
        "  return {\n"
        "    documentName: h.documentName,\n"
        "    documentId: h.documentId,\n"
        "    pageNumber: h.pageNumber,\n"
        "    displayPageNumber: h.displayPageNumber,\n"
        "    passageId: h.passageId,\n"
        f"    sourcePages: n < {SOURCE_PAGE_HITS} ? sourcePagesFor(h) : [],\n"
        f"    text: h.text.slice(0, {PASSAGE_CHARS})\n"
        "  };\n"
        "});\n"
    )


def _parse_hits(result) -> list[dict[str, Any]]:
    """Pull the hit list out of an anara_execute result."""
    if result.is_error:
        raise RuntimeError(f"Anara search failed: {result.content[0].text if result.content else 'unknown error'}")
    payload = result.structured_content or {}
    returned = payload.get("returnValue")
    if returned is None and result.content:
        returned = json.loads(result.content[0].text).get("returnValue")
    return returned or []


async def _call_async(tool: str, arguments: dict[str, Any]):
    async with httpx2.AsyncClient(auth=_provider(), timeout=120) as http_client:
        async with streamable_http_client(SERVER_URL, http_client=http_client) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await session.call_tool(tool, arguments)


async def _execute_async(code: str):
    return _parse_hits(await _call_async("anara_execute", {"code": code}))


async def _search_async(query: str, document_ids: list[str] | None = None) -> list[dict[str, Any]]:
    return await _execute_async(_search_code(query, document_ids))


def execute(code: str) -> Any:
    """Run a script in Anara's sandbox and return what it returns."""
    return asyncio.run(_execute_async(code))


def upload_pdf(path: Path, anara_name: str) -> str:
    """Upload a PDF to the library under this name and return its Anara document id.

    Needs the sign-in to have write access. Anara reads the file afterwards; a lookup by name
    shows when it is ready.
    """
    import requests

    result = asyncio.run(_call_async("anara_local_bootstrap", {"scopes": ["anara:write"]}))
    if result.is_error:
        raise RuntimeError(f"Anara upload key failed: {result.content[0].text if result.content else 'unknown'}")
    session = json.loads(result.content[0].text)
    if "anara:write" not in session.get("scopes", []):
        raise RuntimeError("Anara did not grant write access: sign in again with write access")
    data = path.read_bytes()
    created = requests.post(
        f"{session['baseUrl']}/api/v1/sdk/documents.createUpload",
        headers={"x-api-key": session["apiKey"], "x-anara-organization-id": session["organizationId"]},
        json={"filename": anara_name, "contentLength": len(data)},
        timeout=60,
    )
    if not created.ok:
        raise RuntimeError(f"Anara upload of {anara_name} failed: {created.status_code} {created.text[:200]}")
    created = created.json()
    put = requests.put(created["uploadUrl"], data=data, headers=created["headers"], timeout=120)
    if not put.ok:
        raise RuntimeError(f"Upload of {anara_name} failed: {put.status_code} {put.text[:200]}")
    return created["documentId"]


def library_size() -> int:
    """How many documents the library holds; a cheap way to see that the sign-in works."""
    count = asyncio.run(_execute_async("return anara.entities.query({ type: 'DOCUMENT', limit: 500 }).length;"))
    return count if isinstance(count, int) else 0


def search_library(query: str, document_ids: list[str] | None = None) -> list[dict[str, Any]]:
    """Return passages from the Anara library that match the query (only from document_ids, when given).

    Each passage has documentName, documentId, pageNumber (the PDF page index),
    displayPageNumber (the printed page), passageId, and text.
    """
    return [hit for hit in asyncio.run(_search_async(query, document_ids)) if _has_content(hit)]


def _has_content(hit: dict[str, Any]) -> bool:
    """False for a hit that is only a page marker line."""
    text = re.sub(r"\S*\s*-?\s*page_\d+", "", hit.get("text") or "")
    return len(text.strip()) >= MIN_PASSAGE_CHARS
