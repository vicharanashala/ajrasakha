"""Read the translated POP files through the POP API instead of Zoho.

The POP server already lists and serves its Zoho files, so no Zoho credentials are needed here:
  GET <base>/output/tree         the Workdir folder tree
  GET <base>/download/<path>     one file, by its path (does not mark anything in POP)

This class has the same four calls as the Zoho client that fetch_translated_docx uses, so the
selection logic is shared. A folder or file is identified by its path.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import requests

TREE_TIMEOUT_SECONDS = 120
DOWNLOAD_TIMEOUT_SECONDS = 300


class PopApiClient:
    def __init__(self, base_url: str, session: Any = None):
        self.base_url = base_url.rstrip("/")
        self.session = session or requests
        self._nodes: dict[str, dict[str, Any]] | None = None

    def _tree(self) -> dict[str, dict[str, Any]]:
        """Every folder and file of Workdir, by path. Read once per client."""
        if self._nodes is None:
            response = self.session.get(f"{self.base_url}/output/tree", timeout=TREE_TIMEOUT_SECONDS)
            response.raise_for_status()
            nodes: dict[str, dict[str, Any]] = {}

            def walk(node: dict[str, Any]) -> None:
                nodes[node["path"]] = node
                for child in node.get("children", []):
                    walk(child)

            walk(response.json())
            self._nodes = nodes
        return self._nodes

    @staticmethod
    def _item(node: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": node["path"],
            "name": node["name"],
            "type": "folder" if node.get("type") == "directory" else "file",
            "size": node.get("size", 0),
        }

    def states(self) -> list[str]:
        """Names of the state folders under Workdir."""
        return sorted(i["name"] for i in self.list_folder("Workdir") if i["type"] == "folder")

    def size_of(self, file_id: str) -> int | None:
        node = self._tree().get(file_id)
        return node.get("size") if node else None

    def resolve_path(self, path: str) -> tuple[str, str] | None:
        node = self._tree().get(path)
        if node is None:
            return None
        return node["path"], "folder" if node.get("type") == "directory" else "file"

    def list_folder(self, folder_id: str) -> list[dict[str, Any]]:
        node = self._tree().get(folder_id)
        return [self._item(child) for child in (node or {}).get("children", [])]

    def find_child(self, parent_id: str, name: str) -> dict[str, Any] | None:
        return next((item for item in self.list_folder(parent_id) if item["name"] == name), None)

    def download_file(self, file_id: str) -> bytes:
        response = self.session.get(
            f"{self.base_url}/download/{quote(file_id, safe='/')}", timeout=DOWNLOAD_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        return response.content
