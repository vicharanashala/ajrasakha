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
import time
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

import anara_tokens

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

    def _renew_if_due(self) -> dict:
        """The saved sign-in, renewed first when its access token is about to run out. The renewed pair is
        kept in the file and, when ANARA_TOKEN_SECRET is set, in Secret Manager, because the old refresh
        token stops working once it has been used."""
        with anara_tokens.lock:
            data = self._load()
            fallback = TOKEN_FILE.stat().st_mtime if TOKEN_FILE.exists() else None
            left = anara_tokens.seconds_left(data, fallback)
            if left is not None and left < anara_tokens.RENEW_WITHIN_SECONDS:
                renewed = anara_tokens.renew(data)
                if renewed:
                    self._save(renewed)
                    anara_tokens.remote_save(renewed)
                    return renewed
            return data

    async def get_tokens(self):
        data = self._renew_if_due()
        raw = data.get("tokens")
        if not raw:
            return None
        token = OAuthToken(**raw)
        # The client reads expires_in as the time left from now, so a token saved a day ago would be
        # sent as if it were new, answered with a 401, and end in a browser sign-in. Take off the time
        # since it was saved, and the client refreshes it in time instead.
        saved_at = data.get("saved_at") or (TOKEN_FILE.stat().st_mtime if TOKEN_FILE.exists() else None)
        if saved_at and token.expires_in:
            token.expires_in = max(1, int(token.expires_in - (time.time() - saved_at)))
        return token

    async def set_tokens(self, tokens: OAuthToken) -> None:
        data = self._load()
        data["tokens"] = tokens.model_dump(mode="json", exclude_none=True)
        data["saved_at"] = time.time()
        self._save(data)
        anara_tokens.remote_save(data)

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


# Python run inside Anara's sandbox through anara_shell, so one call does the search and the page
# lookup. (Anara removed the old anara_execute tool, which ran JavaScript.) The POP pipeline starts
# every source page with a line like "<document> - page_004", so the last marker before a passage
# tells which source page it belongs to. A passage that carries markers of its own spans more than
# one source page.
_PRELUDE = """import json, re, subprocess
def anara(method, args=None):
    p = subprocess.run(["anara", method, json.dumps(args or {})], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError("anara %s failed: %s" % (method, (p.stderr or p.stdout)[:400]))
    return json.loads(p.stdout)
"""
_MARK = "@@RESULT@@"


def literal(value: Any) -> str:
    """A Python expression for a JSON-compatible value, to place inside a sandbox script."""
    return "json.loads(%r)" % json.dumps(value)


_SOURCE_PAGES_PY = r"""
from concurrent.futures import ThreadPoolExecutor
top = hits[:TOP]
wanted = {}
for h in top:
    if h.get("pageNumber") is None:
        continue
    pages = wanted.setdefault(h["documentId"], set())
    pages.add(h["pageNumber"])
    if h["pageNumber"] > 1:
        pages.add(h["pageNumber"] - 1)
def fetch(item):
    document, pages = item
    try:
        return document, anara("documents.getPages", {"documentId": document, "pages": sorted(pages)})
    except RuntimeError:
        return document, {"passages": []}
ordered = {}
with ThreadPoolExecutor(6) as pool:
    for document, result in pool.map(fetch, wanted.items()):
        numbered = sorted(enumerate(result.get("passages") or []), key=lambda x: ((x[1].get("pageNumber") or 0), x[0]))
        ordered[document] = [p for _, p in numbered]
def markers(text):
    return [(int(m.group(1)), m.start()) for m in re.finditer(r"page_(\d+)", text or "")]
def source_pages(h):
    passages = ordered.get(h["documentId"], [])
    index = next((i for i, p in enumerate(passages) if p.get("passageId") == h["passageId"]), -1)
    if index < 0:
        return []
    before = None
    i = index - 1
    while i >= 0 and before is None:
        found = markers(passages[i].get("text"))
        if found:
            before = found[-1][0]
        i -= 1
    own = markers(passages[index].get("text"))
    pages = []
    if before is not None and (not own or own[0][1] > 60):
        pages.append(before)
    for page, _ in own:
        if page not in pages:
            pages.append(page)
    return pages
RESULT = [
    {
        "documentName": h.get("documentName"), "documentId": h["documentId"], "pageNumber": h.get("pageNumber"),
        "displayPageNumber": h.get("displayPageNumber"), "passageId": h["passageId"],
        "sourcePages": source_pages(h) if n < TOP else [], "text": (h.get("text") or "")[:CHARS],
    }
    for n, h in enumerate(hits)
]
"""


_COUNT_DOCUMENTS_PY = """RESULT = 0
while True:
    page = anara("entities.query", {"type": "DOCUMENT", "limit": 200, "offset": RESULT})
    RESULT += len(page)
    if len(page) < 200:
        break
"""


def _search_code(query: str, document_ids: list[str] | None = None) -> str:
    """Python run inside Anara's sandbox: a library search with each passage's source pages."""
    arguments: dict[str, Any] = {"query": query, "limit": SEARCH_LIMIT, "topK": SEARCH_TOP_K}
    if document_ids:  # only these documents are searched
        arguments["documentIds"] = document_ids
    extra = _phrasings(query)
    if extra:
        arguments["queries"] = extra
    return (
        f"hits = anara('retrieval.search', {literal(arguments)})\n"
        f"TOP = {SOURCE_PAGE_HITS}\nCHARS = {PASSAGE_CHARS}\n" + _SOURCE_PAGES_PY
    )


def _parse_result(result) -> Any:
    """The value a sandbox script left in RESULT."""
    text = ""
    if result.is_error:
        raise RuntimeError(f"Anara failed: {result.content[0].text if result.content else 'unknown error'}")
    payload = result.structured_content or {}
    if payload:
        if payload.get("exitCode") not in (0, None):
            raise RuntimeError(f"Anara script failed: {(payload.get('stderr') or payload.get('stdout') or '')[-400:]}")
        text = payload.get("stdout") or ""
    elif result.content:
        text = result.content[0].text or ""
    marker = text.rfind(_MARK)
    if marker < 0:
        raise RuntimeError(f"Anara script returned no result: {text[-200:]}")
    return json.loads(text[marker + len(_MARK):])


async def _call_async(tool: str, arguments: dict[str, Any]):
    async with httpx2.AsyncClient(auth=_provider(), timeout=120) as http_client:
        async with streamable_http_client(SERVER_URL, http_client=http_client) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await session.call_tool(tool, arguments)


async def _execute_async(script: str):
    command = (
        "python3 - <<'ANARA_PY'\n" + _PRELUDE + script + f"\nprint({_MARK!r} + json.dumps(RESULT))\nANARA_PY"
    )
    return _parse_result(await _call_async("anara_shell", {"command": command, "timeoutSec": 45}))


async def _search_async(query: str, document_ids: list[str] | None = None) -> list[dict[str, Any]]:
    return await _execute_async(_search_code(query, document_ids))


def execute(script: str) -> Any:
    """Run a Python script in Anara's sandbox (it has anara(method, args)) and return its RESULT."""
    return asyncio.run(_execute_async(script))


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
    count = asyncio.run(_execute_async(_COUNT_DOCUMENTS_PY))
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
