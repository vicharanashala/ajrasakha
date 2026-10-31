"""Offline tests for fetch_translated_docx: only translated DOCX, never audit copies.

A fake Zoho client stands in for helpers/zoho_workdrive.py, so no network or
credentials are needed.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIRECTORY))

from fetch_translated_docx import (  # noqa: E402
    crops_in_state,
    fetch_batch,
    list_batch,
    short_name,
    translated_docx_names,
)


def f(name, file_id):
    return {"id": file_id, "name": name, "type": "file", "size": 1}


def d(name, folder_id):
    return {"id": folder_id, "name": name, "type": "folder", "size": 0}


class FakeZoho:
    """Only the calls fetch_batch makes, backed by a small in-memory tree."""

    def __init__(self, tree):
        # tree: folder id -> list of items; file id -> bytes
        self.tree = tree["folders"]
        self.files = tree["files"]
        self.paths = tree["paths"]

    def resolve_path(self, path):
        return self.paths.get(path)

    def list_folder(self, folder_id):
        return self.tree.get(folder_id, [])

    def find_child(self, parent_id, name):
        return next((i for i in self.list_folder(parent_id) if i["name"] == name), None)

    def download_file(self, file_id):
        return self.files[file_id]


def sample_tree():
    folders = {
        "crop": [d("doc1", "s1"), d("doc2", "s2"), d("doc3", "s3")],
        # doc1: translated plus audited copy -> only the translated one is taken
        "s1": [d("final_output", "fo1")],
        "fo1": [
            f("doc1_translated_pages_001_to_005.docx", "t1"),
            f("audit_doc1_translated_pages_001_to_005.docx", "a1"),
        ],
        # doc2: two translated runs -> the later name wins
        "s2": [d("final_output", "fo2")],
        "fo2": [
            f("doc2_translated_pages_001_to_003.docx", "t2a"),
            f("doc2_translated_pages_001_to_009.docx", "t2b"),
        ],
        # doc3: only an audited copy -> nothing is fetched
        "s3": [d("final_output", "fo3")],
        "fo3": [f("audit_doc3_translated_pages_001_to_004.docx", "a3")],
    }
    files = {"t1": b"doc1", "t2a": b"old", "t2b": b"doc2-new"}
    folders["state"] = [d("Ginger", "crop"), d("Maize", "crop2"), f("notes.txt", "n")]
    paths = {
        "Workdir/Karnataka": ("state", "folder"),
        "Workdir/Karnataka/Ginger": ("crop", "folder"),
    }
    return {"folders": folders, "files": files, "paths": paths}


class TranslatedDocxNames(unittest.TestCase):
    def test_skips_audit_copies_folders_and_other_files(self):
        items = [
            f("audit_x.docx", "1"),
            f("x_translated_pages_001_to_002.docx", "2"),
            f("notes.pdf", "3"),
            d("page_docx", "4"),
        ]
        self.assertEqual(translated_docx_names(items), ["x_translated_pages_001_to_002.docx"])

    def test_sorted_so_the_last_is_the_latest(self):
        items = [f("b_002.docx", "1"), f("a_001.docx", "2")]
        self.assertEqual(translated_docx_names(items), ["a_001.docx", "b_002.docx"])


class ShortName(unittest.TestCase):
    def test_short_names_are_kept(self):
        self.assertEqual(short_name("doc1.docx", 80), "doc1.docx")

    def test_long_names_are_cut_keep_the_extension_and_differ(self):
        a = short_name("A" * 200 + "_pages_001_to_005.docx", 80)
        b = short_name("A" * 200 + "_pages_001_to_009.docx", 80)
        self.assertLessEqual(len(a), 80)
        self.assertTrue(a.endswith(".docx"))
        self.assertNotEqual(a, b)

    def test_a_long_name_without_an_extension_is_cut_too(self):
        self.assertLessEqual(len(short_name("B" * 200, 40)), 40)


class ListBatch(unittest.TestCase):
    def test_crops_are_the_folders_of_the_state(self):
        self.assertEqual(crops_in_state(FakeZoho(sample_tree()), "Karnataka"), ["Ginger", "Maize"])

    def test_unknown_state_raises(self):
        with self.assertRaises(FileNotFoundError):
            crops_in_state(FakeZoho(sample_tree()), "Kerala")

    def test_lists_the_latest_translated_file_per_document_without_downloading(self):
        listed = list_batch(FakeZoho(sample_tree()), "Karnataka", "Ginger")
        self.assertEqual(
            listed,
            [
                ("doc1", "doc1_translated_pages_001_to_005.docx", "t1"),
                ("doc2", "doc2_translated_pages_001_to_009.docx", "t2b"),
            ],
        )


class FetchBatch(unittest.TestCase):
    def test_fetches_only_translated_latest_per_document(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            written = fetch_batch(FakeZoho(sample_tree()), "Karnataka", "Ginger", out)
            names = sorted(p.relative_to(out).as_posix() for p in written)
            self.assertEqual(
                names,
                [
                    "Karnataka/Ginger/doc1/doc1_translated_pages_001_to_005.docx",
                    "Karnataka/Ginger/doc2/doc2_translated_pages_001_to_009.docx",
                ],
            )
            self.assertEqual(
                (out / names[0]).read_bytes(), b"doc1",
            )
            self.assertEqual((out / names[1]).read_bytes(), b"doc2-new")
            self.assertFalse(any("audit_" in n for n in names))

    def test_missing_crop_folder_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                fetch_batch(FakeZoho(sample_tree()), "Karnataka", "Maize", Path(tmp))


if __name__ == "__main__":
    unittest.main()
