"""Offline tests for the Anara agent research: the prompt, the cited passages, and the [P#] numbering."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIRECTORY))

import anara_agent  # noqa: E402


def tag(passage_id: str) -> str:
    return f'<source type="passage">{passage_id}</source>'


class ThePrompt(unittest.TestCase):
    def test_it_carries_the_question_the_crop_the_state_and_the_record_files(self):
        prompt = anara_agent.build_prompt("seed rate?", "Mustard", "Rajasthan", "Agronomy", ["src-1__POP.pdf"])
        for part in ("seed rate?", "Crop: Mustard", "State of the record: Rajasthan", "Topic area: Agronomy", "src-1__POP.pdf"):
            self.assertIn(part, prompt)
        self.assertIn("If no document covers Rajasthan, say so plainly", prompt)
        self.assertIn("Use only my library", prompt)

    def test_a_bare_question_still_makes_a_prompt(self):
        prompt = anara_agent.build_prompt("how to sow?", None, None, None)
        self.assertIn("how to sow?", prompt)
        self.assertNotIn("State of the record", prompt)


class TheCitedPassages(unittest.TestCase):
    def result(self):
        return {
            "text": f"Sow in October {tag('b')}. Use 1.5 kg {tag('a')}{tag('b')}.",
            "citations": [
                {"passageId": "a", "documentId": "d1", "resolved": True},
                {"passageId": "b", "documentId": "d2", "resolved": True},
                {"passageId": "c", "documentId": "d3", "resolved": True},
                {"passageId": "x", "documentId": "d4", "resolved": False},
            ],
        }

    def test_each_passage_once_in_the_order_the_agent_cited_it_and_unresolved_ones_dropped(self):
        self.assertEqual([c["passageId"] for c in anara_agent._cited(self.result())], ["b", "a", "c"])

    def test_no_more_than_the_limit(self):
        many = {"text": "", "citations": [{"passageId": str(n), "documentId": "d"} for n in range(30)]}
        self.assertEqual(len(anara_agent._cited(many)), anara_agent.MAX_PASSAGES)


class TheNotes(unittest.TestCase):
    NOTES = "Sow in October {b}. Use 1.5 kg {a} {z}."

    def test_tags_become_the_numbers_of_the_final_passage_list(self):
        passages = [{"passageId": "b"}, {"passageId": "a"}]
        self.assertEqual(anara_agent.number_notes(self.NOTES, passages), "Sow in October [P1]. Use 1.5 kg [P2].")

    def test_a_tag_for_a_passage_that_is_not_listed_is_dropped(self):
        self.assertEqual(anara_agent.number_notes(self.NOTES, [{"passageId": "a"}]), "Sow in October. Use 1.5 kg [P1].")

    def test_plain_notes_have_no_tags(self):
        self.assertEqual(anara_agent.plain_notes(self.NOTES), "Sow in October. Use 1.5 kg.")


if __name__ == "__main__":
    unittest.main()
