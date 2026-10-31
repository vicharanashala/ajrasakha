"""Offline tests for the local library search: reading a DOCX, source pages, crops, ranking."""

from __future__ import annotations

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIRECTORY))

import local_index  # noqa: E402

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def paragraph(text: str) -> str:
    return f'<w:p><w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p>'


def table(rows: list[list[str]]) -> str:
    body = "".join(
        "<w:tr>" + "".join(f"<w:tc>{paragraph(cell)}</w:tc>" for cell in row) + "</w:tr>" for row in rows
    )
    return f"<w:tbl>{body}</w:tbl>"


def write_docx(path: Path, blocks: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    xml = f'<?xml version="1.0"?><w:document xmlns:w="{W}"><w:body>{"".join(blocks)}</w:body></w:document>'
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("word/document.xml", xml)


LONG = " The field must be well drained and ploughed twice before planting."


class ReadingADocx(unittest.TestCase):
    def test_pages_start_at_their_marker_and_the_marker_is_not_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.docx"
            write_docx(path, [
                paragraph("Banana guide - page_001"),
                paragraph("Plant suckers 2 m apart." + LONG),
                paragraph("Banana guide - page_002"),
                paragraph("Apply 200 g urea per plant." + LONG),
            ])
            pages = local_index.pages_of(local_index.docx_lines(path))
        self.assertEqual([p for p, _ in pages], [1, 2])
        self.assertTrue(all("page_" not in line for _, lines in pages for line in lines))

    def test_a_table_row_is_one_line_with_cells_joined(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.docx"
            write_docx(path, [table([["Spacing", "15 cm"], ["Seed rate", "3 kg"]])])
            self.assertEqual(list(local_index.docx_lines(path)), ["Spacing | 15 cm", "Seed rate | 3 kg"])

    def test_chunks_never_cross_a_page_and_stay_near_the_size(self):
        text = [("Sentence number %d about irrigation of banana plants and more words." % i) for i in range(60)]
        pieces = local_index.chunks_of(text)
        self.assertGreater(len(pieces), 1)
        self.assertTrue(all(len(p) <= local_index.CHUNK_CHARS + 100 for p in pieces))


class Searching(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        write_docx(self.root / "Odisha" / "Banana" / "doc1" / "banana.docx", [
            paragraph("Banana - page_001"),
            paragraph("Plant banana suckers at 1.8 m spacing in pits." + LONG),
            paragraph("Banana - page_002"),
            paragraph("Control sigatoka leaf spot with propiconazole spray." + LONG),
        ])
        write_docx(self.root / "Odisha" / "Onion" / "doc2" / "onion.docx", [
            paragraph("Onion - page_001"),
            paragraph("Onion seed rate is 3 kg per acre and spacing is 15 cm." + LONG),
        ])
        self.index = local_index.Index(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_finds_the_passage_with_its_source_page(self):
        hits = self.index.search("What spacing for banana suckers?")
        self.assertEqual(hits[0]["sourcePages"], [1])
        self.assertIn("1.8 m", hits[0]["text"])
        self.assertEqual(hits[0]["documentName"], "Odisha__Banana__banana.pdf")
        self.assertIsNone(hits[0]["pageNumber"])

    def test_the_second_page_is_found_for_the_second_topic(self):
        hits = self.index.search("sigatoka spray")
        self.assertEqual(hits[0]["sourcePages"], [2])

    def test_a_crop_named_in_the_question_limits_the_search(self):
        hits = self.index.search("spacing seed rate onion")
        self.assertTrue(all("Onion" in h["documentName"] for h in hits))

    def test_a_given_crop_limits_the_search_even_when_the_question_does_not_name_it(self):
        hits = self.index.search("what spacing", crop="Onion")
        self.assertTrue(hits)
        self.assertTrue(all("Onion" in h["documentName"] for h in hits))

    def test_a_question_that_matches_nothing_returns_no_passages(self):
        self.assertEqual(self.index.search("quantum entanglement"), [])

    def test_only_library_documents_resolve_to_a_pdf(self):
        pdfs = self.root / "pdfs"
        pdfs.mkdir()
        (pdfs / "Odisha__Banana__banana.pdf").write_bytes(b"%PDF")
        document_id = next(iter(self.index.documents))
        with patch.object(local_index, "PDF_DIRECTORY", pdfs), patch.object(
            local_index, "current_index", return_value=self.index
        ):
            found = local_index.pdf_path_for_document(
                next(i for i, d in self.index.documents.items() if d["crop"] == "Banana")
            )
            self.assertEqual(found, pdfs / "Odisha__Banana__banana.pdf")
            self.assertIsNone(local_index.pdf_path_for_document("../etc/passwd"))
            self.assertIsNone(local_index.pdf_path_for_document(document_id[::-1]))

    def test_the_index_is_rebuilt_when_a_file_is_added(self):
        first = local_index.current_index(self.root)
        write_docx(self.root / "Odisha" / "Mango" / "doc3" / "mango.docx", [
            paragraph("Mango - page_001"), paragraph("Spray mango at flowering." + LONG),
        ])
        second = local_index.current_index(self.root)
        self.assertIsNot(first, second)
        self.assertEqual(len(second.documents), 3)


if __name__ == "__main__":
    unittest.main()
