"""Offline tests for the library sync: naming PDFs and removing copies the server no longer lists."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIRECTORY))

import sync_library  # noqa: E402


def touch(path: Path, data: bytes = b"x") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


class SyncLibrary(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "downloads"
        self.pdfs = Path(self.tmp.name) / "pdfs"

    def tearDown(self):
        self.tmp.cleanup()

    def test_pdf_name_carries_state_and_crop(self):
        docx = self.root / "Odisha" / "Banana" / "doc" / "a.docx"
        self.assertEqual(sync_library.pdf_name(docx, self.root), "Odisha__Banana__a.pdf")

    def test_prune_removes_only_unlisted_copies_and_their_pdfs_in_the_given_states(self):
        keep_docx = touch(self.root / "Odisha" / "Banana" / "doc" / "a.docx")
        old_docx = touch(self.root / "Odisha" / "Banana" / "old name" / "old.docx")
        other_state = touch(self.root / "Karnataka" / "Coconut" / "doc" / "k.docx")
        touch(self.pdfs / "Odisha__Banana__old.pdf")
        touch(self.pdfs / "Odisha__Banana__a.pdf")

        removed = sync_library.prune(self.root, {keep_docx}, ["Odisha"], self.pdfs)

        self.assertEqual(removed, [old_docx])
        self.assertTrue(keep_docx.exists())
        self.assertTrue(other_state.exists())  # not in the states of this pass
        self.assertFalse((self.pdfs / "Odisha__Banana__old.pdf").exists())
        self.assertTrue((self.pdfs / "Odisha__Banana__a.pdf").exists())
        self.assertFalse(old_docx.parent.exists())  # the empty folder is gone

    def test_pdfs_are_made_only_for_documents_without_a_current_one(self):
        has_pdf = touch(self.root / "Odisha" / "Banana" / "d1" / "a.docx")
        needs_pdf = touch(self.root / "Odisha" / "Banana" / "d2" / "b.docx")
        touch(self.pdfs / "Odisha__Banana__a.pdf")
        made_for = []

        def fake_convert(docx: Path, pdf: Path) -> None:
            made_for.append(docx.name)
            touch(pdf)

        made, failures = sync_library.make_pdfs(self.root, self.pdfs, (fake_convert, lambda: None))

        self.assertEqual((made, failures), (1, []))
        self.assertEqual(made_for, ["b.docx"])
        self.assertTrue(has_pdf.exists() and needs_pdf.exists())

    def test_one_failing_conversion_does_not_stop_the_others(self):
        touch(self.root / "Odisha" / "Banana" / "d1" / "bad.docx")
        touch(self.root / "Odisha" / "Banana" / "d2" / "good.docx")

        def fake_convert(docx: Path, pdf: Path) -> None:
            if docx.name == "bad.docx":
                raise RuntimeError("corrupt")
            touch(pdf)

        made, failures = sync_library.make_pdfs(self.root, self.pdfs, (fake_convert, lambda: None))
        self.assertEqual(made, 1)
        self.assertEqual(len(failures), 1)
        self.assertIn("bad.docx", failures[0])


if __name__ == "__main__":
    unittest.main()
