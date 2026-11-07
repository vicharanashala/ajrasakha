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
        self.assertIn("never present another state's advice as Rajasthan's", prompt)
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


class TheAgentRun(unittest.TestCase):
    def test_narration_before_the_first_heading_is_dropped(self):
        self.assertEqual(anara_agent._drop_narration("Let me check.## Findings\nA"), "## Findings\nA")
        self.assertEqual(anara_agent._drop_narration("No heading here"), "No heading here")

    def test_the_prompt_asks_for_farmer_words_and_other_states(self):
        prompt = anara_agent.build_prompt("ground worms?", "Paddy", "Punjab", None)
        self.assertIn("white grubs, termites", prompt)
        self.assertIn("name its state", prompt)

    def test_a_quick_failure_is_tried_once_more(self):
        from unittest.mock import patch

        import anara_search

        calls = []

        def run(prompt):
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError("connection reset")
            return {"text": "## Findings\nx", "citations": []}

        async def fake_run(prompt):
            return run(prompt)

        with patch.object(anara_search, "prepare"), patch.object(anara_agent, "_run", fake_run), patch.object(
            anara_search, "within", lambda seconds, fn: fn()
        ), patch.object(anara_search, "finish_hits", lambda hits, keep_unopenable=False: hits):
            result = anara_agent.research("q?")
        self.assertEqual(len(calls), 2)
        self.assertEqual(result["notes"], "## Findings\nx")


class TheWriterLaysOutTheFindings(unittest.TestCase):
    PASSAGES = [{"passageId": f"p{n}", "documentId": "d", "documentName": "Doc", "pageNumber": n, "text": "t"} for n in range(1, 6)]
    NOTES = "A [P1]. B [P2]. C [P3]. D [P4]. E [P5]."

    def run_draft(self, replies):
        from unittest.mock import patch

        import anara_drafter

        with patch.object(anara_drafter, "call_llm", side_effect=replies) as llm:
            result = anara_drafter.draft_answer("q?", self.PASSAGES, "Paddy", None, notes=self.NOTES)
        return result, llm

    def test_the_findings_go_to_the_writer_as_a_layout_job(self):
        _, llm = self.run_draft([{"answer": "x", "used_passages": [1, 2, 3, 4, 5], "note": ""}])
        prompt = llm.call_args.args[0]
        self.assertIn("Research write-up", prompt)
        self.assertIn("Do not summarise, shorten or drop anything", prompt)
        self.assertIn("A [P1]. B [P2]", prompt)

    def test_a_thin_answer_is_written_again_and_the_fullest_one_is_kept(self):
        thin = {"answer": "thin", "used_passages": [1], "note": ""}
        fuller = {"answer": "fuller", "used_passages": [1, 2, 3, 4], "note": ""}
        result, llm = self.run_draft([thin, fuller])
        self.assertEqual(result["answer"], "fuller")
        self.assertEqual(llm.call_count, 2)
        self.assertEqual(len(result["citations"]), 4)

    def test_an_empty_reply_is_asked_again_when_the_findings_hold_guidance(self):
        empty = {"answer": "", "used_passages": [], "note": "nothing answers it"}
        full = {"answer": "The document does not specify X. Use Y.", "used_passages": [1, 2], "note": ""}
        result, llm = self.run_draft([empty, full, full, full])
        self.assertIn("Use Y", result["answer"])
        self.assertIn("Do not return an empty answer", llm.call_args_list[1].args[0])

    def test_an_empty_reply_stays_empty_when_the_findings_cite_nothing(self):
        from unittest.mock import patch

        import anara_drafter

        empty = {"answer": "", "used_passages": [], "note": "nothing"}
        with patch.object(anara_drafter, "call_llm", return_value=empty) as llm:
            result = anara_drafter.draft_answer("q?", self.PASSAGES, "Paddy", None, notes="No document covers it.")
        self.assertEqual(result["answer"], "")
        self.assertEqual(llm.call_count, 1)

    def test_a_full_answer_is_not_written_again(self):
        _, llm = self.run_draft([{"answer": "full", "used_passages": [1, 2, 3, 4], "note": ""}])
        self.assertEqual(llm.call_count, 1)

    def test_it_gives_up_after_two_more_tries(self):
        thin = {"answer": "thin", "used_passages": [1], "note": ""}
        _, llm = self.run_draft([thin, thin, thin, thin])
        self.assertEqual(llm.call_count, 3)


if __name__ == "__main__":
    unittest.main()
