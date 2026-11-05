"""Offline tests for what keeps drafts and Open working: the English preload, the Anara retry, the fallback note."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIRECTORY))

from fastapi.testclient import TestClient  # noqa: E402

import anara_search  # noqa: E402
import anara_sources  # noqa: E402
import draft_api  # noqa: E402
import library_files  # noqa: E402
import record_sources  # noqa: E402

try:
    import anara_client
except ImportError:  # the Anara client needs the mcp packages
    anara_client = None


class EnglishPreload(unittest.TestCase):
    def test_only_the_english_documents_that_are_not_saved_are_downloaded(self):
        manifest = {
            "A.pdf": {"documentId": "a", "zohoFileId": "x"},
            "B.pdf": {"documentId": "b", "zohoFileId": "y"},
            "T.pdf": {"documentId": "t"},  # a translated document has no Zoho file to download
        }
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "B.pdf").write_bytes(b"%PDF")
            with patch.object(library_files, "PDF_DIRECTORY", Path(folder)), patch.object(
                library_files, "load_manifest", return_value=manifest
            ), patch.object(library_files, "_download_english", return_value=Path("saved.pdf")) as download:
                library_files.prefetch_english(workers=1)
        self.assertEqual([call.args[0]["zohoFileId"] for call in download.call_args_list], ["x"])
        self.assertEqual(library_files.PREFETCH_STATE, {"total": 1, "done": 1, "failed": 0})


@unittest.skipIf(anara_client is None, "the Anara client is not installed")
class AnaraRetry(unittest.TestCase):
    def test_one_failed_search_is_tried_again_before_the_local_search_is_used(self):
        hit = {"documentId": "doc-1", "documentName": "A.pdf", "text": "wheat rate", "pageNumber": 2}
        with patch.dict(os.environ, {"DRAFT_SEARCH": "anara"}), patch.object(
            anara_client, "search_library", side_effect=[RuntimeError("blip"), [hit]]
        ) as search, patch.object(library_files, "openable_document_ids", return_value={"doc-1"}):
            hits = anara_search.search("wheat seed rate", "Wheat")
        self.assertEqual(search.call_count, 2)
        self.assertEqual([h["documentId"] for h in hits], ["doc-1"])


@unittest.skipIf(anara_client is None, "the Anara client is not installed")
class SavedSignIn(unittest.TestCase):
    def tokens_saved(self, seconds_ago):
        folder = tempfile.mkdtemp()
        path = Path(folder) / "tokens.json"
        path.write_text(
            json.dumps({
                "tokens": {"access_token": "a", "refresh_token": "r", "token_type": "Bearer", "expires_in": 86400},
                "saved_at": time.time() - seconds_ago,
            }),
            encoding="utf-8",
        )
        with patch.object(anara_client, "TOKEN_FILE", path):
            return asyncio.run(anara_client._FileStorage().get_tokens())

    def test_a_token_saved_a_day_ago_is_not_treated_as_new(self):
        # otherwise it is sent expired, answered with a 401 and ends in a browser sign-in a server cannot do
        self.assertLessEqual(self.tokens_saved(90000).expires_in, 1)

    def test_a_recent_token_keeps_its_remaining_time(self):
        self.assertTrue(80000 < self.tokens_saved(1000).expires_in < 86000)


@unittest.skipIf(anara_client is None, "the Anara client is not installed")
class UploadedRecordFilesInTheLibrary(unittest.TestCase):
    def test_a_file_uploaded_for_a_record_is_kept_and_opens_through_its_zoho_id(self):
        hit = {"documentId": "X9", "documentName": "src-abc123__GOI-Fungicide.pdf", "text": "wheat", "pageNumber": 4}
        with patch.dict(os.environ, {"DRAFT_SEARCH": "anara"}), patch.object(
            anara_client, "search_library", return_value=[hit]
        ), patch.object(library_files, "openable_document_ids", return_value=set()):
            hits = anara_search.search("wheat", "Wheat")
        self.assertEqual((hits[0]["documentId"], hits[0]["documentName"]), ("src-abc123", "GOI-Fungicide"))


class RecordSourcesThroughAnara(unittest.TestCase):
    URL = "https://workdrive.zoho.in/file/abc123"
    SOURCES = [{"url": URL, "name": "GOI"}]
    HIT = {"documentId": "A1", "documentName": "x", "text": "wheat 21 days", "passageId": "p1", "pageNumber": 3}

    def setUp(self):
        anara_sources._pending.clear()

    def run_search(self, client):
        client._phrasings.return_value = []  # one search is enough for these tests
        with patch.object(anara_sources, "_client", return_value=client), patch.object(
            library_files, "load_manifest", return_value={}
        ), patch.object(anara_search, "prepare"):
            return anara_sources.search("q", self.SOURCES, "Wheat")

    def test_a_file_already_in_anara_is_searched_there_without_another_upload(self):
        client = MagicMock()
        client.execute.return_value = [{"id": "abc123", "documentId": "A1", "status": "ready"}]
        client.search_library.return_value = [self.HIT]
        passages, handled, _ = self.run_search(client)
        client.upload_pdf.assert_not_called()
        self.assertEqual(client.search_library.call_args.args[1], ["A1"])  # only that file is searched
        self.assertEqual((passages[0]["documentId"], passages[0]["documentName"]), ("src-abc123", "GOI"))
        self.assertEqual(handled, {"abc123"})

    def test_a_new_file_is_uploaded_once_and_searched_when_anara_has_read_it(self):
        client = MagicMock()
        client.execute.side_effect = [[{"id": "abc123", "documentId": None}], {"A2": "ready"}, True]
        client.upload_pdf.return_value = "A2"
        client.search_library.return_value = [dict(self.HIT, documentId="A2")]
        with patch.object(record_sources, "fetch_pdf", return_value=Path("x.pdf")):
            passages, handled, _ = self.run_search(client)
        self.assertEqual(client.upload_pdf.call_count, 1)
        self.assertTrue(client.upload_pdf.call_args.args[1].startswith("src-abc123__"))
        # Anara renames a document to its title when it has read it, so the name is set back for the next lookup
        self.assertIn("anara.entities.update", client.execute.call_args.args[0])
        self.assertEqual(handled, {"abc123"})

    def test_a_file_anara_has_not_finished_reading_is_left_for_the_caller(self):
        client = MagicMock()
        client.execute.side_effect = [[{"id": "abc123", "documentId": None}], {"A2": "processing"}]
        client.upload_pdf.return_value = "A2"
        with patch.object(record_sources, "fetch_pdf", return_value=Path("x.pdf")), patch.object(
            anara_sources, "READY_WAIT_SECONDS", 0
        ):
            passages, handled, _ = self.run_search(client)
        self.assertEqual((passages, handled), ([], set()))

    def test_the_draft_reads_the_pdf_itself_when_anara_fails_for_the_record_files(self):
        own = [{"passageId": "b", "text": "t", "documentName": "GOI"}]
        draft = {"answer": "a", "citations": [], "note": ""}
        with patch.dict(os.environ, {"GDB_DRAFT_TOKEN": "t"}), patch.object(
            anara_search, "enabled", return_value=True
        ), patch.object(anara_sources, "search", side_effect=RuntimeError("down")), patch.object(
            record_sources, "search_sources", return_value=(own, [])
        ) as read, patch.object(draft_api, "search_library", return_value=[]), patch.object(
            draft_api, "draft_answer", return_value=draft
        ) as drafter:
            response = TestClient(draft_api.app).post(
                "/draft", json={"question": "q", "sources": self.SOURCES}, headers={"x-draft-token": "t"}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(read.call_args.args[1], self.SOURCES)
        self.assertEqual(drafter.call_args.args[1], own)


class AStuckAnaraCallDoesNotHoldUpADraft(unittest.TestCase):
    def test_within_gives_up_on_time_and_does_not_wait_for_the_stuck_call(self):
        started = time.time()
        with self.assertRaises(TimeoutError):
            anara_search.within(0.2, time.sleep, 3)
        self.assertLess(time.time() - started, 1.5)

    def test_the_draft_reads_the_record_files_itself_when_the_anara_step_is_stuck(self):
        own = [{"passageId": "b", "text": "t", "documentName": "GOI"}]
        draft = {"answer": "a", "citations": [], "note": ""}
        sources = [{"url": "https://workdrive.zoho.in/file/abc123", "name": "GOI"}]
        started = time.time()
        with patch.dict(os.environ, {"GDB_DRAFT_TOKEN": "t"}), patch.object(
            anara_search, "enabled", return_value=True
        ), patch.object(draft_api, "ANARA_SOURCES_SECONDS", 0.2), patch.object(
            anara_sources, "search", side_effect=lambda *a: time.sleep(3)
        ), patch.object(record_sources, "search_sources", return_value=(own, [])), patch.object(
            draft_api, "search_library", return_value=[]
        ), patch.object(draft_api, "draft_answer", return_value=draft):
            response = TestClient(draft_api.app).post(
                "/draft", json={"question": "q", "sources": sources}, headers={"x-draft-token": "t"}
            )
        self.assertEqual(response.status_code, 200)
        self.assertLess(time.time() - started, 2.5)

    def test_the_record_file_search_prepares_the_sign_in_before_it_uses_anara(self):
        client = MagicMock()
        client.execute.return_value = [{"id": "abc123", "documentId": "A1", "status": "ready"}]
        client._phrasings.return_value = []
        client.search_library.return_value = []
        with patch.object(anara_sources, "_client", return_value=client), patch.object(
            library_files, "load_manifest", return_value={}
        ), patch.object(anara_search, "prepare") as prepare:
            anara_sources.search("q", [{"url": "https://workdrive.zoho.in/file/abc123", "name": "GOI"}], "Wheat")
        prepare.assert_called_once()


class FallbackNote(unittest.TestCase):
    def test_the_draft_says_when_the_anara_search_was_not_available_even_if_nothing_was_found_instead(self):
        draft = {"answer": "a", "citations": [], "note": ""}
        unavailable = draft_api.Passages()  # the local search found nothing, which is the case on the server
        unavailable.fallback = True
        with patch.dict(os.environ, {"GDB_DRAFT_TOKEN": "t"}), patch.object(
            draft_api, "search_library", return_value=unavailable
        ), patch.object(draft_api, "draft_answer", return_value=draft):
            response = TestClient(draft_api.app).post("/draft", json={"question": "q"}, headers={"x-draft-token": "t"})
        self.assertIn("Anara library search was not available", response.json()["note"])

    def test_no_note_when_the_anara_search_ran(self):
        draft = {"answer": "a", "citations": [], "note": ""}
        with patch.dict(os.environ, {"GDB_DRAFT_TOKEN": "t"}), patch.object(
            draft_api, "search_library", return_value=draft_api.Passages([{"text": "t", "passageId": "p"}])
        ), patch.object(draft_api, "draft_answer", return_value=draft):
            response = TestClient(draft_api.app).post("/draft", json={"question": "q"}, headers={"x-draft-token": "t"})
        self.assertEqual(response.json()["note"], "")


if __name__ == "__main__":
    unittest.main()
