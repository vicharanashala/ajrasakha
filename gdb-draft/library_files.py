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


def load_manifest() -> dict[str, Any]:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {}


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
            return path if path.is_file() else None
    return None
