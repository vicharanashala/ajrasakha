"""Tests for build_answer_provenance — no fabricated verification claims."""

from __future__ import annotations

from ajrasakha.agents.answer_provenance import (
    STATUS_PENDING_REVIEW,
    STATUS_REVIEWED,
    STATUS_VERIFIED,
    build_answer_provenance,
)
from ajrasakha.agents.state import TRANSLATE_PATH_EMPTY_GDB


def _exact_gdb() -> dict:
    return {
        "is_exact": True,
        "is_similar": False,
        "chosen_question_id": "q-123",
        "exact_match": {
            "question": "How to control blast in paddy?",
            "answer": "Use tricyclazole as per label dosage.",
            "question_id": "q-123",
        },
    }


def _similar_gdb() -> dict:
    return {
        "is_exact": False,
        "is_similar": True,
        "chosen_question_id": "q-456",
        "similar_pair1": {
            "question": "How to manage blast disease in rice?",
            "answer": "Apply recommended fungicide.",
            "question_id": "q-456",
        },
    }


def test_exact_gdb_match_is_verified_golden_dataset():
    provenance = build_answer_provenance(_exact_gdb(), plan={})
    assert provenance == {
        "source": "golden_dataset",
        "verificationStatus": STATUS_VERIFIED,
        "sourceId": "q-123",
        "sourceTitle": "How to control blast in paddy?",
    }


def test_similar_gdb_match_is_reviewed_golden_dataset():
    provenance = build_answer_provenance(_similar_gdb(), plan={})
    assert provenance["source"] == "golden_dataset"
    assert provenance["verificationStatus"] == STATUS_REVIEWED
    assert provenance["sourceId"] == "q-456"
    assert provenance["sourceTitle"] == "How to manage blast disease in rice?"


def test_expert_queue_path_is_pending_review_with_no_source():
    plan = {"translate_path": TRANSLATE_PATH_EMPTY_GDB}
    provenance = build_answer_provenance(gdb_data=None, plan=plan)
    assert provenance == {
        "source": None,
        "verificationStatus": STATUS_PENDING_REVIEW,
        "sourceId": None,
        "sourceTitle": None,
    }


def test_specialist_tool_only_answer_has_no_provenance():
    """Weather/mandi/soil/schemes answers are real-time data, not GDB — omit rather than mislabel."""
    provenance = build_answer_provenance(gdb_data=None, plan={"weather": True})
    assert provenance is None


def test_empty_gdb_data_dict_has_no_provenance():
    """gdb tool ran but returned nothing usable — not the empty_gdb expert-queue path either."""
    provenance = build_answer_provenance(
        gdb_data={"is_exact": False, "is_similar": False, "exact_match": {}},
        plan={},
    )
    assert provenance is None


def test_greeting_has_no_provenance():
    provenance = build_answer_provenance(gdb_data=None, plan={"is_greeting": True})
    assert provenance is None
