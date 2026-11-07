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
            patch.dict(os.environ, {"GDB_DRAFT_TOKEN": TOKEN, "DRAFT_ENGINE": "search"}),
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
        drafter.assert_called_once_with("spacing?", [{"text": "t"}], None, None, notes=None, max_passages=None)

    def agent_result(self, passages, notes):
        return {"passages": passages, "notes": notes}

    def test_the_anara_agent_does_the_research_and_the_drafter_gets_its_findings(self):
        passage = {"passageId": "p9", "documentId": "d", "documentName": "Punjab POP", "pageNumber": 5, "text": "dose"}
        draft = {"answer": "a", "citations": [], "note": ""}
        with patch.dict(os.environ, {"DRAFT_ENGINE": "agent"}), patch.object(
            draft_api.anara_search, "enabled", return_value=True
        ), patch.object(
            draft_api.anara_agent, "research", return_value=self.agent_result([passage], "Sow in October. {p9}")
        ), patch.object(draft_api, "search_library") as plain, patch.object(
            draft_api, "draft_answer", return_value=draft
        ) as drafter:
            self.client.post("/draft", json={"question": "sowing?", "crop": "Mustard"}, headers=HEADERS)
        plain.assert_not_called()  # our own search is not used when the agent answered
        self.assertEqual(drafter.call_args.args[1], [passage])
        self.assertEqual(drafter.call_args.kwargs["notes"], "Sow in October. [P1]")

    def test_when_the_agent_finds_nothing_its_explanation_is_the_note(self):
        with patch.dict(os.environ, {"DRAFT_ENGINE": "agent"}), patch.object(
            draft_api.anara_search, "enabled", return_value=True
        ), patch.object(
            draft_api.anara_agent, "research", return_value=self.agent_result([], "No document in your library covers Rajasthan.")
        ), patch.object(draft_api, "draft_answer") as drafter:
            body = self.client.post("/draft", json={"question": "q", "state": "Rajasthan"}, headers=HEADERS).json()
        drafter.assert_not_called()
        self.assertEqual(body["answer"], "")
        self.assertIn("covers Rajasthan", body["note"])

    def test_when_the_model_writes_nothing_the_agents_explanation_replaces_its_generic_note(self):
        passage = {"passageId": "p1", "documentId": "d", "documentName": "Punjab POP", "pageNumber": 5, "text": "urea"}
        empty = {"answer": "", "citations": [], "note": "The provided passages do not contain it."}
        findings = "No document mentions polysulphate. The library has Punjab's paddy schedule {p1}."
        with patch.dict(os.environ, {"DRAFT_ENGINE": "agent"}), patch.object(
            draft_api.anara_search, "enabled", return_value=True
        ), patch.object(
            draft_api.anara_agent, "research", return_value=self.agent_result([passage], findings)
        ), patch.object(draft_api, "draft_answer", return_value=empty):
            body = self.client.post("/draft", json={"question": "q"}, headers=HEADERS).json()
        self.assertEqual(body["note"], "No document mentions polysulphate. The library has Punjab's paddy schedule.")

    def test_if_the_agent_cannot_be_used_the_plain_library_search_is_the_fallback(self):
        draft = {"answer": "a", "citations": [], "note": ""}
        with patch.dict(os.environ, {"DRAFT_ENGINE": "agent"}), patch.object(
            draft_api.anara_search, "enabled", return_value=True
        ), patch.object(draft_api.anara_agent, "research", return_value=None), patch.object(
            draft_api, "search_library", return_value=[{"text": "t"}]
        ) as plain, patch.object(draft_api, "draft_answer", return_value=draft) as drafter:
            self.client.post("/draft", json={"question": "q"}, headers=HEADERS)
        plain.assert_called_once()
        self.assertIsNone(drafter.call_args.kwargs["notes"])

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

    def test_a_document_is_openable_when_its_file_is_saved_or_downloadable(self):
        entries = {"Banana.pdf": {"documentId": "doc-1"}, "Gone.pdf": {"documentId": "doc-2"},
                   "Zoho.pdf": {"documentId": "doc-3", "zohoFileId": "abc"}}
        (Path(self.scratch.name) / "anara_uploads.json").write_text(json.dumps(entries), encoding="utf-8")
        openable = library_files.openable_document_ids()
        self.assertTrue({"doc-1", "doc-3"} <= openable)
        self.assertNotIn("doc-2", openable)

    def test_a_record_source_is_fetched_again_when_its_saved_copy_is_gone(self):
        import record_sources

        with patch.object(record_sources, "SOURCE_DIRECTORY", Path(self.scratch.name) / "none"), patch.object(
            record_sources, "fetch_pdf", return_value=Path("x.pdf")
        ) as fetch:
            self.assertEqual(record_sources.pdf_path_for_document("src-abc123"), Path("x.pdf"))
        fetch.assert_called_once_with("https://workdrive.zoho.in/file/abc123")

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
