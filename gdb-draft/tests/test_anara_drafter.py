"""Offline tests for the drafter: how the model is called, and how its answer becomes citations."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIRECTORY))

import anara_drafter  # noqa: E402

PASSAGES = [
    {"documentName": "A.pdf", "documentId": "a", "pageNumber": None, "sourcePages": [3], "passageId": "p1", "text": "t1"},
    {"documentName": "B.pdf", "documentId": "b", "pageNumber": 7, "sourcePages": [], "passageId": "p2", "text": "t2"},
]


class DraftAnswer(unittest.TestCase):
    def test_the_model_gets_room_to_reason_and_a_bounded_wait(self):
        with patch.object(anara_drafter, "call_llm", return_value={"answer": "x [P1]", "used_passages": [1]}) as call:
            anara_drafter.draft_answer("q", PASSAGES)
        kwargs = call.call_args.kwargs
        self.assertGreaterEqual(kwargs["max_completion_tokens"], 6000)
        self.assertEqual(kwargs["max_retries"], anara_drafter.DRAFT_ATTEMPTS - 1)
        self.assertEqual(kwargs["timeout"], anara_drafter.DRAFT_ATTEMPT_TIMEOUT_SECONDS)

    def test_citations_follow_the_passages_the_answer_used(self):
        reply = {"answer": "a [P2][P1]", "used_passages": [2, 1, 9, "x"], "note": ""}
        with patch.object(anara_drafter, "call_llm", return_value=reply):
            result = anara_drafter.draft_answer("q", PASSAGES)
        self.assertEqual([c["documentId"] for c in result["citations"]], ["b", "a"])
        self.assertEqual(result["citations"][1]["sourcePages"], [3])  # a passage number out of range is ignored

    def test_the_crop_is_stated_in_the_prompt_and_no_other_crop_may_be_named(self):
        with patch.object(anara_drafter, "call_llm", return_value={"answer": "", "used_passages": []}) as call:
            anara_drafter.draft_answer("q", PASSAGES, "Wheat")
        prompt = call.call_args.args[0]
        self.assertIn("The question is about the crop: Wheat", prompt)
        self.assertIn("Do not name a crop, variety", prompt)

    def test_no_passages_for_a_crop_says_the_library_has_no_documents_for_it(self):
        with patch.object(anara_drafter, "call_llm") as call:
            result = anara_drafter.draft_answer("q", [], "Wheat")
        call.assert_not_called()
        self.assertEqual(result["note"], "The library has no documents for Wheat")

    def test_no_passages_means_no_model_call(self):
        with patch.object(anara_drafter, "call_llm") as call:
            result = anara_drafter.draft_answer("q", [])
        call.assert_not_called()
        self.assertEqual(result["answer"], "")

    def test_a_passage_without_a_pdf_page_shows_its_source_page_to_the_model(self):
        text = anara_drafter._format_passages(PASSAGES)
        self.assertIn("A.pdf, source page 3", text)
        self.assertIn("B.pdf, PDF page 7", text)


if __name__ == "__main__":
    unittest.main()
