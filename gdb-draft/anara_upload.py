"""Upload translated POP files into the Anara library, so the draft search can find them.

Usage:
  python anara_upload.py <file or folder> [<file or folder> ...]

Anara accepts only PDF, so each DOCX is first saved as PDF with Microsoft Word (into
data/anara_pdfs/). Anara's page numbers are the pages of that PDF. A folder is searched
for .docx files. A file inside <state>/<crop>/<stem>/ is stored under the name
"<state>__<crop>__<file>.pdf" so a citation shows where it came from.

Needs the Anara sign-in with write access (see anara_client.py). It asks Anara for a
temporary upload key (24 hours) and keeps it in memory only. Uploaded files are
recorded in data/anara_uploads.json, and a file already recorded with the same size
is skipped, so a rerun does not upload twice.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx2
import requests
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from anara_client import SERVER_URL, _provider
from library_files import PDF_DIRECTORY, load_manifest, save_manifest

INGEST_WAIT_SECONDS = 1800
INGEST_POLL_SECONDS = 60
UPLOAD_TIMEOUT_SECONDS = 300


async def _mcp_call(tool: str, arguments: dict[str, Any]) -> Any:
    async with httpx2.AsyncClient(auth=_provider(), timeout=120) as http_client:
        async with streamable_http_client(SERVER_URL, http_client=http_client) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool, arguments)
                if result.is_error:
                    raise RuntimeError(f"{tool} failed: {result.content[0].text if result.content else 'unknown'}")
                return json.loads(result.content[0].text)


def get_upload_session() -> dict[str, Any]:
    """A temporary write key for the workspace. Held in memory, never printed or saved."""
    session = asyncio.run(_mcp_call("anara_local_bootstrap", {"scopes": ["anara:write"]}))
    if "anara:write" not in session.get("scopes", []):
        raise RuntimeError(
            "Anara did not grant write access. Reconnect Anara with write access "
            "(sign in again, see anara_client.py) and retry."
        )
    return session


def _api(session: dict[str, Any], method: str, body: dict[str, Any]) -> dict[str, Any]:
    response = requests.post(
        f"{session['baseUrl']}/api/v1/sdk/{method}",
        headers={
            "x-api-key": session["apiKey"],
            "x-anara-organization-id": session["organizationId"],
            "content-type": "application/json",
        },
        json=body,
        timeout=60,
    )
    if not response.ok:
        raise RuntimeError(f"Anara {method} failed: {response.status_code} {response.text[:200]}")
    return response.json()


def upload_file(session: dict[str, Any], path: Path, anara_name: str) -> str:
    """Upload one file and return its Anara document id."""
    data = path.read_bytes()
    created = _api(session, "documents.createUpload", {"filename": anara_name, "contentLength": len(data)})
    put = requests.put(
        created["uploadUrl"], data=data, headers=created["headers"], timeout=UPLOAD_TIMEOUT_SECONDS
    )
    if not put.ok:
        raise RuntimeError(f"Upload of {anara_name} failed: {put.status_code} {put.text[:200]}")
    return created["documentId"]


def ingestion_statuses(document_ids: list[str]) -> dict[str, str]:
    """Anara's reading status of each document, from one call however many there are."""
    code = (
        f"const ids = {json.dumps(document_ids)};\n"
        "return JSON.stringify(ids.map(id => {\n"
        "  const e = anara.entities.get(id, { withIngestion: true });\n"
        "  return e && e.ingestion ? e.ingestion.status : 'unknown';\n"
        "}));\n"
    )
    payload = asyncio.run(_mcp_call("anara_execute", {"code": code}))
    returned = payload.get("returnValue", "[]")
    statuses = json.loads(returned) if isinstance(returned, str) else returned
    return dict(zip(document_ids, statuses))


def wait_until_ready(document_ids: list[str]) -> dict[str, str]:
    """Check all documents together until each is ready or failed; returns the last status of each.

    Every check is a call that counts against Anara's daily usage allowance, so one call covers
    all the documents and the next one is only made after a long pause.
    """
    statuses = ingestion_statuses(document_ids)
    deadline = time.time() + INGEST_WAIT_SECONDS
    while time.time() < deadline and any(s not in ("ready", "failed") for s in statuses.values()):
        time.sleep(INGEST_POLL_SECONDS)
        statuses = ingestion_statuses(document_ids)
    return statuses


def anara_name_for(path: Path, root: Path | None) -> str:
    """<state>__<crop>__<file>.pdf for files under <root>/<state>/<crop>/<stem>/, else <file>.pdf."""
    name = path.name
    if root is not None:
        try:
            parts = path.relative_to(root).parts
        except ValueError:
            parts = ()
        if len(parts) == 4:
            state, crop, _stem, file_name = parts
            name = f"{state}__{crop}__{file_name}"
    return str(Path(name).with_suffix(".pdf"))


def convert_to_pdf(word: Any, docx_path: Path, pdf_path: Path) -> int:
    """Save a DOCX as PDF with Microsoft Word and return the PDF's page count.

    Anara accepts only PDF. The page numbers it reports are those of this PDF.
    """
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    # Word refuses to open a file that carries a "downloaded from the internet" mark, and
    # a copy does not keep that mark, so convert a copy
    with tempfile.TemporaryDirectory() as scratch:
        copy = Path(scratch) / "source.docx"
        shutil.copyfile(docx_path, copy)
        document = word.Documents.Open(str(copy), ReadOnly=True)
        try:
            document.SaveAs2(str(pdf_path.resolve()), FileFormat=17)  # 17 = PDF
            return int(document.ComputeStatistics(2))  # 2 = pages
        finally:
            document.Close(False)


def upload_all(targets: list[Path], root: Path | None = None) -> list[dict[str, Any]]:
    """Upload every DOCX under the targets that is not already recorded; return one row each."""
    files: list[Path] = []
    for target in targets:
        files += sorted(target.rglob("*.docx")) if target.is_dir() else [target]

    manifest = load_manifest()
    session = get_upload_session()
    rows: list[dict[str, Any]] = []
    word = None
    try:
        for path in files:
            name = anara_name_for(path, root)
            size = path.stat().st_size
            known = manifest.get(name)
            if known and known.get("size") == size and known.get("status") != "failed":
                rows.append({"name": name, "documentId": known["documentId"], "status": "already uploaded"})
                continue
            if path.suffix.lower() == ".docx":
                if word is None:
                    import win32com.client  # Word is only needed when there is a DOCX to convert

                    word = win32com.client.DispatchEx("Word.Application")
                    word.Visible = False
                pdf_path = PDF_DIRECTORY / name
                pages = convert_to_pdf(word, path, pdf_path)
            else:
                # keep a copy next to the converted ones, so a cited document can be opened later
                pdf_path, pages = PDF_DIRECTORY / name, None
                pdf_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, pdf_path)
            document_id = upload_file(session, pdf_path, name)
            manifest[name] = {
                "documentId": document_id,
                "size": size,
                "pdfPages": pages,
                "uploadedAt": datetime.now(timezone.utc).isoformat(),
            }
            save_manifest(manifest)
            rows.append({"name": name, "documentId": document_id, "pages": pages, "status": "uploaded"})
    finally:
        if word is not None:
            word.Quit()

    # one shared check after all uploads, also for earlier uploads whose status was never recorded
    to_check = [r for r in rows if r["status"] == "uploaded" or "status" not in manifest.get(r["name"], {})]
    if to_check:
        statuses = wait_until_ready([r["documentId"] for r in to_check])
        for row in to_check:
            status = statuses[row["documentId"]]
            manifest[row["name"]]["status"] = status
            if row["status"] == "uploaded" or status == "failed":
                row["status"] = status
        save_manifest(manifest)
    return rows


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    given = [Path(arg) for arg in sys.argv[1:]]
    # a single folder argument is treated as the fetch output root: <root>/<state>/<crop>/<stem>/<file>
    root_dir = given[0] if len(given) == 1 and given[0].is_dir() else None
    for row in upload_all(given, root_dir):
        print(f"{row['status']:>16}  {row['name']}  pages={row.get('pages')}  ({row['documentId']})")
