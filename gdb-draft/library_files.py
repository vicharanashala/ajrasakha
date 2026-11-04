"""Where the library's uploaded files are kept, and how to find one by its Anara document id.

The upload step saves each PDF here and records it in a manifest. The draft service reads
the same folder to let a reviewer open a cited document. GDB_LIBRARY_DATA_DIR moves both
to another folder, for example a volume in a container.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# how far the preload of the English documents has got, for the /status route
PREFETCH_STATE = {"total": 0, "done": 0, "failed": 0}
_prefetch_lock = threading.Lock()

DATA_DIRECTORY = Path(os.getenv("GDB_LIBRARY_DATA_DIR") or Path(__file__).resolve().parent / "data")
MANIFEST_PATH = DATA_DIRECTORY / "anara_uploads.json"
PDF_DIRECTORY = DATA_DIRECTORY / "anara_pdfs"


# the documents in the Anara library, kept in the repo so a deployed service can tell which file
# a cited Anara document is; the manifest on disk (made by the upload) wins where both have a name
BUNDLED_MANIFEST_PATH = Path(__file__).resolve().parent / "library_manifest.json"


def load_manifest() -> dict[str, Any]:
    manifest: dict[str, Any] = {}
    for path in (BUNDLED_MANIFEST_PATH, MANIFEST_PATH):
        if path.exists():
            manifest.update(json.loads(path.read_text(encoding="utf-8")))
    return manifest


def save_manifest(manifest: dict[str, Any]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def pdf_path_for_document(document_id: str) -> Path | None:
    """The saved PDF of an uploaded document, or None if the id is not one we uploaded.

    Only ids recorded in the manifest resolve, and the file name comes from the manifest,
    so a request cannot name any other file.
    """
    for name, entry in load_manifest().items():
        if entry.get("documentId") == document_id:
            path = PDF_DIRECTORY / name
            if path.is_file():
                return path
            return _download_english(entry, path) if entry.get("zohoFileId") else None
    return None


def openable_document_ids() -> set[str]:
    """Ids of the documents a reviewer can open now, without fetching anything.

    An English document downloads from Zoho when it is opened; the others need their PDF saved here.
    """
    return {
        entry["documentId"]
        for name, entry in load_manifest().items()
        if entry.get("documentId") and (entry.get("zohoFileId") or (PDF_DIRECTORY / name).is_file())
    }


def name_for_document(document_id: str) -> str | None:
    """The full library name of an Anara document (Anara shortens long names in its hits)."""
    for name, entry in load_manifest().items():
        if entry.get("documentId") == document_id:
            return name
    return None


def _download_english(entry: dict[str, Any], path: Path) -> Path | None:
    """An English document is kept in Zoho WorkDrive; its shared link downloads without a login."""
    import requests

    host = entry.get("zohoHost") or "https://workdrive.zoho.in"
    for _attempt in range(3):  # a large file or a busy moment can fail once and work the next time
        try:
            response = requests.get(f"{host}/api/v1/download/{entry['zohoFileId']}", timeout=(15, 120))
        except requests.RequestException:
            continue
        if response.status_code == 200 and response.content.startswith(b"%PDF"):
            path.parent.mkdir(parents=True, exist_ok=True)
            # one name per thread, so the preload and a reviewer opening the same file do not clash
            temporary = path.with_suffix(f".{threading.get_ident()}.part")
            temporary.write_bytes(response.content)
            temporary.replace(path)
            return path
        if response.status_code in (403, 404):  # the link is gone or private; trying again will not help
            break
    return None


def prefetch_english(workers: int = 4) -> None:
    """Save every English document that is not saved yet, so opening one never waits on Zoho."""
    wanted = [
        (name, entry)
        for name, entry in load_manifest().items()
        if entry.get("zohoFileId") and not (PDF_DIRECTORY / name).is_file()
    ]
    with _prefetch_lock:
        PREFETCH_STATE.update(total=len(wanted), done=0, failed=0)

    def fetch(item: tuple[str, dict[str, Any]]) -> None:
        name, entry = item
        saved = _download_english(entry, PDF_DIRECTORY / name) is not None
        with _prefetch_lock:
            PREFETCH_STATE["done" if saved else "failed"] += 1

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(fetch, wanted))
    logger.info("English library preload: %s", PREFETCH_STATE)
