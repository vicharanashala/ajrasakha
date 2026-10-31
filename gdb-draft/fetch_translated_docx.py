"""Download the translated DOCX files for one state and crop through the POP API.

Only the translated DOCX is taken: files in Workdir/<state>/<crop>/<stem>/final_output/
whose names do not start with "audit_". The audited copies are left out on purpose.

Usage (needs POP_API_URL in the environment, see pop_api_client.py):
  python fetch_translated_docx.py <state> <crop> <out dir>

The client is passed in, so the selection logic can be tested offline.
"""

from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path
from typing import Any

AUDIT_PREFIX = "audit_"

# POP document names can be very long (the folder name is repeated inside the file name), and
# Windows cannot write a path over 260 characters, so local names are cut to these lengths
MAX_FOLDER_NAME = 40
MAX_FILE_NAME = 80


def short_name(name: str, limit: int) -> str:
    """The name cut to the limit, with a short hash of the full name so two cuts never collide."""
    if len(name) <= limit:
        return name
    stem, dot, extension = name.rpartition(".")
    if not dot or len(extension) > 5:
        stem, extension = name, ""
    else:
        extension = f".{extension}"
    digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:8]
    return f"{stem[: limit - len(extension) - len(digest) - 1].rstrip()}~{digest}{extension}"


def translated_docx_names(items: list[dict[str, Any]]) -> list[str]:
    """Names of the translated DOCX files in a final_output listing, sorted.

    Skips folders and audited copies. If there are several, the last one is the
    latest, the same rule the POP server uses.
    """
    names = [
        item["name"]
        for item in items
        if item.get("type") == "file"
        and item["name"].lower().endswith(".docx")
        and not item["name"].startswith(AUDIT_PREFIX)
    ]
    return sorted(names)


def crops_in_state(client: Any, state: str) -> list[str]:
    """Names of the crop folders under Workdir/<state>."""
    state_result = client.resolve_path(f"Workdir/{state}")
    if state_result is None:
        raise FileNotFoundError(f"No Zoho folder at Workdir/{state}")
    return sorted(i["name"] for i in client.list_folder(state_result[0]) if i.get("type") == "folder")


def list_batch(client: Any, state: str, crop: str) -> list[tuple[str, str, str]]:
    """(document, file name, file id) for the latest translated DOCX of each document.

    Documents with no translated DOCX are left out.
    """
    crop_path = f"Workdir/{state}/{crop}"
    crop_result = client.resolve_path(crop_path)
    if crop_result is None:
        raise FileNotFoundError(f"No Zoho folder at {crop_path}")

    found: list[tuple[str, str, str]] = []
    for stem_item in client.list_folder(crop_result[0]):
        if stem_item.get("type") != "folder":
            continue
        final_out = client.find_child(stem_item["id"], "final_output")
        if not final_out or final_out.get("type") != "folder":
            continue
        listing = client.list_folder(final_out["id"])
        names = translated_docx_names(listing)
        if not names:
            continue
        latest = names[-1]
        found.append((stem_item["name"], latest, next(i["id"] for i in listing if i["name"] == latest)))
    return found


def fetch_batch(client: Any, state: str, crop: str, out_dir: Path) -> list[Path]:
    """Save the latest translated DOCX of every document in one state and crop.

    Returns the local paths written, as <out_dir>/<state>/<crop>/<document>/<file>.
    """
    written: list[Path] = []
    for stem, name, file_id in list_batch(client, state, crop):
        target = out_dir / state / crop / short_name(stem, MAX_FOLDER_NAME) / short_name(name, MAX_FILE_NAME)
        target.parent.mkdir(parents=True, exist_ok=True)
        # a file already on disk with the size the server reports is not downloaded again
        size_of = getattr(client, "size_of", None)
        if size_of is None or not target.is_file() or target.stat().st_size != size_of(file_id):
            target.write_bytes(client.download_file(file_id))
        written.append(target)
    return written


def _live_client() -> Any:
    """The POP API client. Needs POP_API_URL in the environment."""
    from pop_api_client import PopApiClient

    return PopApiClient(os.environ["POP_API_URL"])


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    state, crop, out = sys.argv[1:]
    if not os.getenv("POP_API_URL"):
        print("Missing environment setting: POP_API_URL")
        sys.exit(1)
    saved = fetch_batch(_live_client(), state, crop, Path(out))
    for path in saved:
        print(path)
    print(f"{len(saved)} translated DOCX saved")
