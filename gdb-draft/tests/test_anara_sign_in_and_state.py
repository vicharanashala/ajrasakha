"""Offline tests for the Anara sign-in renewal, the state-aware search and the anara_shell port."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIRECTORY))

import anara_search  # noqa: E402
import anara_tokens  # noqa: E402
import library_files  # noqa: E402

try:
    import anara_client
except ImportError:  # the Anara client needs the mcp packages
    anara_client = None


def sign_in(seconds_ago: float, refresh: str = "r1") -> dict:
    return {
        "client_info": {"client_id": "cid"},
        "tokens": {"access_token": "a1", "refresh_token": refresh, "token_type": "Bearer", "expires_in": 86400},
        "saved_at": time.time() - seconds_ago,
    }


class RenewingTheSignIn(unittest.TestCase):
    def test_a_renewed_sign_in_has_the_new_pair_and_a_new_save_time(self):
        reply = MagicMock(ok=True)
        reply.json.return_value = {"access_token": "a2", "refresh_token": "r2", "expires_in": 86400}
        with patch.object(anara_tokens.requests, "post", return_value=reply) as post:
            renewed = anara_tokens.renew(sign_in(80000))
        self.assertEqual(post.call_args.kwargs["data"]["grant_type"], "refresh_token")
        self.assertEqual(post.call_args.kwargs["data"]["refresh_token"], "r1")
        self.assertEqual((renewed["tokens"]["access_token"], renewed["tokens"]["refresh_token"]), ("a2", "r2"))
        self.assertLess(time.time() - renewed["saved_at"], 5)

    def test_a_refused_renewal_returns_nothing_instead_of_raising(self):
        reply = MagicMock(ok=False, status_code=400)
        reply.json.return_value = {"error": "invalid_grant"}
        with patch.object(anara_tokens.requests, "post", return_value=reply):
            self.assertIsNone(anara_tokens.renew(sign_in(80000)))

    def test_nothing_is_sent_without_a_refresh_token(self):
        data = sign_in(80000)
        del data["tokens"]["refresh_token"]
        with patch.object(anara_tokens.requests, "post") as post:
            self.assertIsNone(anara_tokens.renew(data))
        post.assert_not_called()

    def test_the_renewed_sign_in_is_kept_in_secret_manager_as_a_new_version(self):
        reply = MagicMock(ok=True)
        with patch.dict(os.environ, {"ANARA_TOKEN_SECRET": "projects/p/secrets/s"}), patch.object(
            anara_tokens, "_remote_headers", return_value={"Authorization": "Bearer x"}
        ), patch.object(anara_tokens.requests, "post", return_value=reply) as post:
            self.assertTrue(anara_tokens.remote_save(sign_in(0)))
        self.assertTrue(post.call_args.args[0].endswith("/v1/projects/p/secrets/s:addVersion"))
        saved = json.loads(base64.b64decode(post.call_args.kwargs["json"]["payload"]["data"]))
        self.assertEqual(saved["tokens"]["refresh_token"], "r1")

    def test_the_none_placeholder_means_no_secret(self):
        with patch.dict(os.environ, {"ANARA_TOKEN_SECRET": "none"}):
            self.assertIsNone(anara_tokens.remote_name())


@unittest.skipIf(anara_client is None, "the Anara client is not installed")
class TheClientRenewsBeforeUsing(unittest.TestCase):
    def storage(self, data):
        folder = tempfile.mkdtemp()
        path = Path(folder) / "tokens.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_a_sign_in_near_its_end_is_renewed_saved_and_used(self):
        path = self.storage(sign_in(85000))
        renewed = sign_in(0, refresh="r2")
        renewed["tokens"]["access_token"] = "a2"
        with patch.object(anara_client, "TOKEN_FILE", path), patch.object(
            anara_tokens, "renew", return_value=renewed
        ) as renew, patch.object(anara_tokens, "remote_save") as keep:
            token = asyncio.run(anara_client._FileStorage().get_tokens())
        renew.assert_called_once()
        keep.assert_called_once()
        self.assertEqual(token.access_token, "a2")
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["tokens"]["refresh_token"], "r2")

    def test_a_fresh_sign_in_is_not_renewed(self):
        path = self.storage(sign_in(1000))
        with patch.object(anara_client, "TOKEN_FILE", path), patch.object(anara_tokens, "renew") as renew:
            asyncio.run(anara_client._FileStorage().get_tokens())
        renew.assert_not_called()


@unittest.skipIf(anara_client is None, "the Anara client is not installed")
class AfterARestart(unittest.TestCase):
    def test_the_newer_of_the_setting_and_secret_manager_is_installed(self):
        old, new = sign_in(90000, refresh="old"), sign_in(100, refresh="new")
        encoded = base64.b64encode(json.dumps(old).encode()).decode()
        path = Path(tempfile.mkdtemp()) / "tokens.json"
        with patch.object(anara_client, "TOKEN_FILE", path), patch.dict(os.environ, {"ANARA_TOKENS_B64": encoded}), patch.object(
            anara_tokens, "remote_load", return_value=new
        ):
            self.assertTrue(anara_search.install_tokens())
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["tokens"]["refresh_token"], "new")

    def test_the_setting_alone_is_still_installed(self):
        encoded = base64.b64encode(json.dumps(sign_in(10)).encode()).decode()
        path = Path(tempfile.mkdtemp()) / "tokens.json"
        with patch.object(anara_client, "TOKEN_FILE", path), patch.dict(os.environ, {"ANARA_TOKENS_B64": encoded}), patch.object(
            anara_tokens, "remote_load", return_value=None
        ):
            self.assertTrue(anara_search.install_tokens())
        self.assertTrue(path.exists())


class StateAwareSearch(unittest.TestCase):
    MANIFEST = {
        "English__State__Package of Practices for Crops of Punjab~aa.pdf": {"documentId": "pb"},
        "English__General__PAU Farm Operations~bb.pdf": {"documentId": "pau"},
        "English__General__Wheat Pocket Guide~cc.pdf": {"documentId": "nat"},
        "Odisha__Paddy__Paddy POP~dd.pdf": {"documentId": "od"},
        "English__State__Dharmapuri DAP Report~ee.pdf": {"documentId": "tn"},
    }

    def test_a_name_gives_its_state_only_when_it_names_exactly_one(self):
        self.assertEqual(anara_search.canonical_state("Package of Practices for Crops of Punjab"), "Punjab")
        self.assertEqual(anara_search.canonical_state("PAU Farm Operations"), "Punjab")
        self.assertEqual(anara_search.canonical_state("Odisha__Paddy__x"), "Odisha")
        self.assertIsNone(anara_search.canonical_state("Wheat Pocket Guide"))
        self.assertIsNone(anara_search.canonical_state("Punjab and Haryana wheat"))

    def test_a_record_searches_its_own_state_and_the_national_documents(self):
        with patch.object(library_files, "load_manifest", return_value=self.MANIFEST):
            self.assertEqual(sorted(anara_search.state_scope_ids("Punjab")), ["nat", "pau", "pb"])
            self.assertIsNone(anara_search.state_scope_ids("Atlantis"))

    def hit(self, passage, document):
        return {"passageId": passage, "documentId": document, "documentName": f"{document}.pdf", "text": f"wheat {passage}"}

    def run_search(self, scoped, unscoped):
        def fake(query, document_ids=None):
            return scoped if document_ids else unscoped

        with patch.dict(os.environ, {"DRAFT_SEARCH": "anara"}), patch.object(anara_search, "prepare"), patch.object(
            anara_client, "search_library", side_effect=fake
        ) as search, patch.object(library_files, "load_manifest", return_value=self.MANIFEST), patch.object(
            library_files, "openable_document_ids", return_value={"pb", "pau", "nat", "od", "tn"}
        ), patch.object(library_files, "name_for_document", return_value=None):
            return anara_search.search("wheat rate", "Wheat", "Punjab"), search

    @unittest.skipIf(anara_client is None, "the Anara client is not installed")
    def test_enough_passages_from_its_own_state_mean_the_rest_of_the_library_is_not_searched(self):
        scoped = [self.hit(f"p{i}", "pb") for i in range(7)]
        hits, search = self.run_search(scoped, [self.hit("x", "od")])
        self.assertEqual(search.call_count, 1)
        self.assertEqual(len(hits), 7)

    @unittest.skipIf(anara_client is None, "the Anara client is not installed")
    def test_too_few_passages_add_the_rest_of_the_library_after_them(self):
        hits, search = self.run_search([self.hit("a", "pb")], [self.hit("a", "pb"), self.hit("x", "od")])
        self.assertEqual(search.call_count, 2)
        self.assertEqual([h["passageId"] for h in hits], ["a", "x"])

    def test_the_reviewer_is_warned_when_no_cited_document_is_from_the_records_state(self):
        cited = [{"documentName": "English__General__PAU RABI POP 2022-23~x.pdf"}]
        notice = anara_search.other_state_notice(cited, "Rajasthan")
        self.assertIn("No cited document is specific to Rajasthan", notice)
        self.assertIn("Punjab", notice)

    def test_a_mix_of_own_and_other_state_documents_gets_a_milder_warning(self):
        cited = [{"documentName": "Odisha__Paddy__POP~a.pdf"}, {"documentName": "English__State__Dharmapuri DAP~b.pdf"}]
        notice = anara_search.other_state_notice(cited, "Odisha")
        self.assertIn("other states (Tamil Nadu)", notice)
        self.assertNotIn("No cited document", notice)

    def test_no_warning_for_own_state_national_or_unknown_state(self):
        own = [{"documentName": "Package of Practices for Crops of Punjab~a.pdf"}, {"documentName": "Wheat Pocket Guide~b.pdf"}]
        self.assertEqual(anara_search.other_state_notice(own, "Punjab"), "")
        self.assertEqual(anara_search.other_state_notice(own, None), "")
        self.assertEqual(anara_search.other_state_notice(own, "Atlantis"), "")

    def test_the_same_page_from_two_copies_of_a_document_is_read_once(self):
        hits = [
            {"text": "Table 1: Herbicides   recommended", "documentId": "a"},
            {"text": "table 1 herbicides recommended", "documentId": "b"},
            {"text": "something else", "documentId": "c"},
        ]
        self.assertEqual([h["documentId"] for h in anara_search.without_repeats(hits)], ["a", "c"])


@unittest.skipIf(anara_client is None, "the Anara client is not installed")
class TheAnaraShellPort(unittest.TestCase):
    def reply(self, stdout, exit_code=0, stderr=""):
        return SimpleNamespace(
            is_error=False, content=[], structured_content={"exitCode": exit_code, "stdout": stdout, "stderr": stderr}
        )

    def test_the_value_after_the_marker_is_the_result(self):
        out = "noise\n" + anara_client._MARK + json.dumps([{"documentId": "d"}])
        self.assertEqual(anara_client._parse_result(self.reply(out)), [{"documentId": "d"}])

    def test_a_failed_script_is_an_error_not_an_empty_result(self):
        with self.assertRaises(RuntimeError):
            anara_client._parse_result(self.reply("", exit_code=1, stderr="boom"))
        with self.assertRaises(RuntimeError):
            anara_client._parse_result(self.reply("no marker here"))

    def test_the_script_runs_through_anara_shell_and_searches_only_the_given_documents(self):
        calls = []

        async def fake_call(tool, arguments):
            calls.append((tool, arguments))
            return self.reply(anara_client._MARK + "[]")

        with patch.object(anara_client, "_call_async", fake_call):
            asyncio.run(anara_client._search_async("wheat", ["d1", "d2"]))
        tool, arguments = calls[0]
        self.assertEqual(tool, "anara_shell")
        self.assertIn("retrieval.search", arguments["command"])
        self.assertIn('"documentIds": ["d1", "d2"]', arguments["command"])
        self.assertLessEqual(arguments["timeoutSec"], 45)

    def test_the_page_lookup_gives_the_printed_page_of_a_passage(self):
        import re

        hits = [{"documentId": "D", "documentName": "Doc", "passageId": "p2", "pageNumber": 5, "text": "dose"}]
        passages = [
            {"passageId": "p1", "pageNumber": 4, "text": "Doc - page_006\nintro"},
            {"passageId": "p2", "pageNumber": 5, "text": "dose"},
        ]
        scope = {
            "anara": lambda method, args=None: {"documentId": "D", "passages": passages},
            "hits": hits, "TOP": 5, "CHARS": 2500, "re": re, "json": json,
        }
        exec(anara_client._SOURCE_PAGES_PY, scope)
        self.assertEqual(scope["RESULT"][0]["sourcePages"], [6])


class ASourceThatIsNotAPdf(unittest.TestCase):
    def test_an_image_is_named_so_the_reviewer_knows_why_it_was_not_used(self):
        import record_sources

        self.assertEqual(record_sources._file_kind(b"\xff\xd8\xff\xe1Exif"), "an image (JPEG)")
        self.assertEqual(record_sources._file_kind(b"\x89PNG\r\n"), "an image (PNG)")
        self.assertIn("Office", record_sources._file_kind(b"PK\x03\x04rest"))
        self.assertIsNone(record_sources._file_kind(b"<html>login</html>"))


if __name__ == "__main__":
    unittest.main()
