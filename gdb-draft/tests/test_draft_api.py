"""Offline tests for the draft service: the token, the draft route, and opening a cited PDF."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIRECTORY))

from fastapi.testclient import TestClient  # noqa: E402

import draft_api  # noqa: E402
import library_files  # noqa: E402

TOKEN = "test-token"
HEADERS = {"x-draft-token": TOKEN}


class DraftApi(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(draft_api.app)
        self.scratch = tempfile.TemporaryDirectory()
        data = Path(self.scratch.name)
        (data / "anara_pdfs").mkdir()
        (data / "anara_pdfs" / "Banana.pdf").write_bytes(b"%PDF-1.4 fake")
        (data / "anara_uploads.json").write_text(
            json.dumps({"Banana.pdf": {"documentId": "doc-1", "size": 1}, "Gone.pdf": {"documentId": "doc-2"}}),
            encoding="utf-8",
        )
        self.patches = [
            patch.object(library_files, "MANIFEST_PATH", data / "anara_uploads.json"),
            patch.object(library_files, "PDF_DIRECTORY", data / "anara_pdfs"),
            patch.dict(os.environ, {"GDB_DRAFT_TOKEN": TOKEN}),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.scratch.cleanup()

    def test_draft_needs_the_token(self):
        response = self.client.post("/draft", json={"question": "q"})
        self.assertEqual(response.status_code, 401)

    def test_draft_returns_the_draft(self):
        draft = {"answer": "a", "citations": [], "note": ""}
        with patch.object(draft_api, "search_library", return_value=[{"text": "t"}]), patch.object(
            draft_api, "draft_answer", return_value=draft
        ) as drafter:
            response = self.client.post("/draft", json={"question": "spacing?"}, headers=HEADERS)
        self.assertEqual(response.json(), draft)
        drafter.assert_called_once_with("spacing?", [{"text": "t"}])

    def test_draft_failure_is_a_502(self):
        with patch.object(draft_api, "search_library", side_effect=RuntimeError("anara down")):
            response = self.client.post("/draft", json={"question": "q"}, headers=HEADERS)
        self.assertEqual(response.status_code, 502)
        self.assertIn("anara down", response.json()["detail"])

    def test_empty_question_is_refused(self):
        self.assertEqual(self.client.post("/draft", json={"question": ""}, headers=HEADERS).status_code, 422)

    def test_pdf_of_a_known_document_is_served_inline(self):
        response = self.client.get("/documents/doc-1/pdf", headers=HEADERS)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.headers["content-disposition"].startswith("inline"))
        self.assertEqual(response.content, b"%PDF-1.4 fake")

    def test_pdf_needs_the_token(self):
        self.assertEqual(self.client.get("/documents/doc-1/pdf").status_code, 401)

    def test_unknown_document_or_missing_file_is_404(self):
        self.assertEqual(self.client.get("/documents/nope/pdf", headers=HEADERS).status_code, 404)
        self.assertEqual(self.client.get("/documents/doc-2/pdf", headers=HEADERS).status_code, 404)

    def test_an_id_cannot_name_another_file(self):
        self.assertEqual(self.client.get("/documents/..%2Fanara_uploads.json/pdf", headers=HEADERS).status_code, 404)


class BackgroundSync(unittest.TestCase):
    def test_the_sync_starts_with_the_service_when_it_is_configured(self):
        started = []
        env = {"POP_API_URL": "https://pop.example/api/pop", "DRAFT_SYNC_MINUTES": "30"}
        with patch.dict(os.environ, env), patch("sync_library.sync_forever", lambda url, minutes: started.append((url, minutes))):
            with TestClient(draft_api.app):
                pass
            import time

            time.sleep(0.2)  # the sync runs in its own thread
        self.assertEqual(started, [("https://pop.example/api/pop", 30)])

    def test_nothing_starts_without_the_settings(self):
        started = []
        with patch.dict(os.environ, {"POP_API_URL": "", "DRAFT_SYNC_MINUTES": ""}), patch(
            "sync_library.sync_forever", lambda url, minutes: started.append(url)
        ):
            with TestClient(draft_api.app):
                pass
        self.assertEqual(started, [])


if __name__ == "__main__":
    unittest.main()
