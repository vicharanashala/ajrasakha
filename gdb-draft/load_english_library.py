"""Load the English POP documents into the Anara library.

Usage:
  python load_english_library.py --dry-run          list what would be loaded
  python load_english_library.py                    the verified documents
  python load_english_library.py --all              every English document (thousands)
  python load_english_library.py --limit 20         at most 20 new ones, for a trial
  python load_english_library.py --export-only      only rewrite library_manifest.json

The documents are read from the POP database (pop_dashboard.pop_unique_documents, language
"eng"; MONGO_URI in .env, read access is enough). Each one is a PDF in Zoho WorkDrive whose
shared link downloads without a login. The PDF is saved to the library folder, uploaded to
Anara under "English__<scope>__<name>.pdf", and recorded in the upload manifest with its Zoho
file id, so a reviewer can open it from a citation later. A document already uploaded with the
same size is skipped, so a rerun only loads what is new.

Documents do not have to be verified to be searched, but only verified ones are loaded unless
--all is given, because the agri team has not checked the rest.

At the end library_manifest.json is rewritten: it ships with the draft service so a deployed
service can open the cited documents.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

from library_files import BUNDLED_MANIFEST_PATH, PDF_DIRECTORY, load_manifest, save_manifest

load_dotenv()

MAX_NAME_CHARS = 80
MAX_PDF_BYTES = 100 * 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 180
DATABASE = "pop_dashboard"
COLLECTION = "pop_unique_documents"

_LINK = re.compile(r"^(https://workdrive\.zoho\.[a-z.]+)/file/([A-Za-z0-9]+)/?$")


def short_name(text: str, limit: int = MAX_NAME_CHARS) -> str:
    """A file-name-safe version of the text, cut to the limit."""
    cleaned = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned[:limit].rstrip(" .") or "document"


def library_name(record: dict[str, Any]) -> str:
    """English__<scope>__<name>.pdf, so a citation shows what kind of document it is."""
    scope = short_name(record.get("advisory_scope") or "General", 20)
    stem = short_name(Path(record.get("shareable_name") or "document").stem)
    return f"English__{scope}__{stem}.pdf"


def parse_link(link: str | None) -> tuple[str, str] | None:
    """(host, file id) of a Zoho WorkDrive file link, else None."""
    found = _LINK.match((link or "").strip())
    return (found.group(1), found.group(2)) if found else None


def english_documents(collection: Any, everything: bool = False) -> list[dict[str, Any]]:
    """English documents with a usable link, verified ones only unless everything is asked for."""
    query: dict[str, Any] = {"language": "eng", "shareable_link": {"$ne": None}}
    if not everything:
        query["verification_status"] = "Verified"
    fields = {"shareable_link": 1, "shareable_name": 1, "advisory_scope": 1, "num_pages": 1, "verification_status": 1}
    documents = []
    taken: set[str] = set()
    for record in collection.find(query, fields).sort("display_id", 1):
        link = parse_link(record.get("shareable_link"))
        if link is None:
            continue
        name = library_name(record)
        if name in taken:  # two documents with the same name: keep the first
            continue
        taken.add(name)
        documents.append({"name": name, "host": link[0], "fileId": link[1], "record": record})
    return documents


def download_pdf(host: str, file_id: str) -> bytes | None:
    """The shared PDF, or None when the link needs a login, is another type of file, or is too large."""
    try:
        response = requests.get(f"{host}/api/v1/download/{file_id}", timeout=DOWNLOAD_TIMEOUT_SECONDS)
    except requests.RequestException:
        return None
    if response.status_code != 200 or not response.content.startswith(b"%PDF"):
        return None
    return response.content if len(response.content) <= MAX_PDF_BYTES else None


def has_text(content: bytes, pages: int = 3) -> bool:
    """True when the PDF's first pages have a text layer. A scan has none and Anara needs its OCR
    (a paid plan) to read it, so such a file is left out instead of uploaded to fail."""
    from io import BytesIO

    from pypdf import PdfReader

    try:
        reader = PdfReader(BytesIO(content))
        return any((page.extract_text() or "").strip() for page in reader.pages[:pages])
    except Exception:
        return False


def export_manifest(manifest: dict[str, Any]) -> int:
    """Write the part of the manifest a deployed service needs, and return how many entries it has."""
    shipped = {
        name: {key: entry[key] for key in ("documentId", "zohoFileId", "zohoHost") if key in entry}
        for name, entry in sorted(manifest.items())
        if entry.get("documentId") and entry.get("status") != "failed" and ("__" in name or entry.get("zohoFileId"))
    }
    BUNDLED_MANIFEST_PATH.write_text(json.dumps(shipped, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(shipped)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--all", action="store_true", help="every English document, not only verified ones")
    parser.add_argument("--limit", type=int, default=0, help="stop after this many new documents")
    parser.add_argument("--scans", action="store_true", help="also upload scanned PDFs (Anara needs a plan with OCR)")
    parser.add_argument("--match", default="", help="only documents whose name contains this text")
    parser.add_argument("--dry-run", action="store_true", help="list the documents, change nothing")
    parser.add_argument("--export-only", action="store_true", help="only rewrite library_manifest.json")
    args = parser.parse_args(argv)

    if args.export_only:
        print(f"library_manifest.json: {export_manifest(load_manifest())} documents")
        return 0

    uri = os.getenv("MONGO_URI", "")
    if not uri:
        print("MONGO_URI is not set (see .env)")
        return 2
    from pymongo import MongoClient

    collection = MongoClient(uri, serverSelectionTimeoutMS=15000)[DATABASE][COLLECTION]
    documents = english_documents(collection, args.all)
    if args.match:
        documents = [d for d in documents if args.match.lower() in d["name"].lower()]
    manifest = load_manifest()
    new = [
        d for d in documents
        if not manifest.get(d["name"], {}).get("documentId") or manifest[d["name"]].get("status") == "failed"
    ]
    print(f"{len(documents)} English documents, {len(documents) - len(new)} already in the library, {len(new)} new")
    if args.dry_run:
        for item in new[: args.limit or 50]:
            print(f"  {item['name']}")
        return 0
    if args.limit:
        new = new[: args.limit]
    if not new:
        print(f"library_manifest.json: {export_manifest(manifest)} documents")
        return 0

    import anara_upload

    session = anara_upload.get_upload_session()
    uploaded: list[str] = []
    scans: list[str] = []
    for item in new:
        content = download_pdf(item["host"], item["fileId"])
        if content is None:
            print(f"  skipped (not a shared PDF): {item['name']}")
            continue
        if not args.scans and not has_text(content):
            scans.append(item["name"])
            print(f"  skipped (a scan, needs OCR): {item['name']}")
            continue
        path = PDF_DIRECTORY / item["name"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        try:
            document_id = anara_upload.upload_file(session, path, item["name"])
        except RuntimeError as error:
            print(f"  upload failed: {item['name']}: {error}")
            continue
        manifest[item["name"]] = {
            "documentId": document_id,
            "size": len(content),
            "pdfPages": item["record"].get("num_pages"),
            "uploadedAt": datetime.now(timezone.utc).isoformat(),
            "zohoFileId": item["fileId"],
            "zohoHost": item["host"],
            "source": "english",
            "verification": item["record"].get("verification_status"),
        }
        save_manifest(manifest)
        uploaded.append(item["name"])
        print(f"  uploaded: {item['name']}")

    if scans:
        (PDF_DIRECTORY.parent / "english_needs_ocr.json").write_text(json.dumps(scans, indent=1), encoding="utf-8")
        print(f"{len(scans)} scanned documents left out (listed in english_needs_ocr.json)")
    if uploaded:
        statuses = anara_upload.wait_until_ready([manifest[name]["documentId"] for name in uploaded])
        for name in uploaded:
            manifest[name]["status"] = statuses[manifest[name]["documentId"]]
        save_manifest(manifest)
        failed = [name for name in uploaded if manifest[name]["status"] == "failed"]
        print(f"{len(uploaded)} uploaded, {len(failed)} failed to read in Anara")
    print(f"library_manifest.json: {export_manifest(manifest)} documents")
    return 0


if __name__ == "__main__":
    sys.exit(main())
