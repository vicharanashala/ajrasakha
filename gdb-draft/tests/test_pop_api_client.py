"""Offline tests for the POP API client: the tree is read once, files are fetched by path."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIRECTORY))

from fetch_translated_docx import crops_in_state, list_batch  # noqa: E402
from pop_api_client import PopApiClient  # noqa: E402

TREE = {
    "name": "Workdir",
    "path": "Workdir",
    "type": "directory",
    "children": [
        {
            "name": "Odisha",
            "path": "Workdir/Odisha",
            "type": "directory",
            "children": [
                {
                    "name": "Banana",
                    "path": "Workdir/Odisha/Banana",
                    "type": "directory",
                    "children": [
                        {
                            "name": "guide",
                            "path": "Workdir/Odisha/Banana/guide",
                            "type": "directory",
                            "children": [
                                {
                                    "name": "final_output",
                                    "path": "Workdir/Odisha/Banana/guide/final_output",
                                    "type": "directory",
                                    "children": [
                                        {
                                            "name": "guide_translated.docx",
                                            "path": "Workdir/Odisha/Banana/guide/final_output/guide_translated.docx",
                                            "type": "file",
                                            "size": 4,
                                        },
                                        {
                                            "name": "audit_guide_translated.docx",
                                            "path": "Workdir/Odisha/Banana/guide/final_output/audit_guide_translated.docx",
                                            "type": "file",
                                            "size": 4,
                                        },
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ],
        }
    ],
}


class FakeResponse:
    def __init__(self, payload=None, content=b""):
        self._payload = payload
        self.content = content

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self):
        self.calls = []

    def get(self, url, timeout=None):
        self.calls.append(url)
        if url.endswith("/output/tree"):
            return FakeResponse(payload=TREE)
        return FakeResponse(content=b"DOCX")


class PopApiClientTests(unittest.TestCase):
    def setUp(self):
        self.session = FakeSession()
        self.client = PopApiClient("https://pop.example/api/pop/", self.session)

    def test_reads_the_tree_once(self):
        self.client.resolve_path("Workdir/Odisha")
        self.client.list_folder("Workdir/Odisha")
        self.assertEqual(self.session.calls, ["https://pop.example/api/pop/output/tree"])

    def test_the_shared_selection_works_on_it(self):
        self.assertEqual(crops_in_state(self.client, "Odisha"), ["Banana"])
        listed = list_batch(self.client, "Odisha", "Banana")
        self.assertEqual(
            listed,
            [("guide", "guide_translated.docx", "Workdir/Odisha/Banana/guide/final_output/guide_translated.docx")],
        )

    def test_unknown_path_is_none(self):
        self.assertIsNone(self.client.resolve_path("Workdir/Kerala"))

    def test_downloads_by_path_with_spaces_encoded(self):
        data = self.client.download_file("Workdir/Andhra Pradesh/a.docx")
        self.assertEqual(data, b"DOCX")
        self.assertEqual(self.session.calls[-1], "https://pop.example/api/pop/download/Workdir/Andhra%20Pradesh/a.docx")


if __name__ == "__main__":
    unittest.main()
