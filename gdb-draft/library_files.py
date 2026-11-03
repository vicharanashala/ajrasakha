"""Where the library's uploaded files are kept, and how to find one by its Anara document id.

The upload step saves each PDF here and records it in a manifest. The draft service reads
the same folder to let a reviewer open a cited document. GDB_LIBRARY_DATA_DIR moves both
to another folder, for example a volume in a container.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

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
    try:
        response = requests.get(f"{host}/api/v1/download/{entry['zohoFileId']}", timeout=60)
    except requests.RequestException:
        return None
    if response.status_code != 200 or not response.content.startswith(b"%PDF"):
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".part")
    temporary.write_bytes(response.content)
    temporary.replace(path)
    return path
