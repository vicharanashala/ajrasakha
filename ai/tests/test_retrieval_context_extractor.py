"""
test_retrieval_context_extractor.py — proves extract_retrieval_context
correctly parses GDB retrieval context out of SSE state snapshots.

WHAT THIS PROVES
----------------
That the extraction logic handles every shape the real LangGraph SSE stream
might deliver, AND that empty/malformed/missing-GDB inputs degrade to []
without raising (so a faulty extractor can never crash a live eval run).

WHAT THIS DOES NOT PROVE
------------------------
That the real /runs/stream endpoint actually emits payloads in these shapes.
A live AI service run is needed to capture a real last_values_payload and
diff it against these synthetic fixtures. Blocked on infra (Docker / AI
service startup).

PAYLOAD SHAPES
--------------
Three families are exercised:
  1. exact_match path      — is_exact=True, answer in exact_match.answer
  2. similar_pair1 path    — is_similar=True, answer in similar_pair1.answer
  3. no GDB / malformed   — missing tool message, bad JSON, empty payload
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_AI_ROOT = Path(__file__).resolve().parents[1]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

from ajrasakha.evaluation.retrieval_context_extractor import (
    extract_retrieval_context,
    _find_gdb_tool_message,
    _extract_answer_text,
)


def _make_state_with_gdb_tool_message(gdb_content_str, shape="langchain"):
    """Build a synthetic SSE state snapshot containing one GDB ToolMessage."""
    if shape == "langchain":
        msg = {
            "type": "tool",
            "name": "gdb",
            "content": gdb_content_str,
        }
    else:
        msg = {
            "role": "tool",
            "name": "gdb",
            "content": gdb_content_str,
        }
    return json.dumps({
        "messages": [
            {"role": "user", "content": "What is the best treatment for tomato blight?"},
            {"role": "assistant", "content": None, "tool_calls": [{"name": "gdb", "args": {}}]},
            msg,
            {"role": "assistant", "content": "Use Metalaxyl + Mancozeb."},
        ]
    })


# Canonical GDB answer text — appears in the assertion for exact_match cases
_GDB_ANSWER = (
    "For tomato blight (Phytophthora infestans) in Karnataka, "
    "apply Metalaxyl+Mancozeb @ 2.5g/L at 10-day intervals."
)

GDB_EXACT_PAYLOAD = json.dumps({
    "rephrased_query": "tomato blight treatment",
    "is_exact": True,
    "is_similar": False,
    "exact_match": {
        "question_id": "6789abcdef",
        "similarity_score": 0.97,
        "answer": _GDB_ANSWER,
        "details": [{"source_name": "KAU Package of Practices"}],
    },
})

GDB_SIMILAR_PAYLOAD = json.dumps({
    "rephrased_query": "tomato late blight",
    "is_exact": False,
    "is_similar": True,
    "similar_pair1": {
        "question_id": "6789abcde0",
        "similarity_score": 0.84,
        "answer": (
            "Tomato late blight is managed with protective fungicide sprays. "
            "Use Mancozeb @ 2.5g/L every 10 days."
        ),
        "details": [{"source_name": "IIHR Technical Bulletin"}],
    },
})


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_exact_match_langchain_shape():
    payload = _make_state_with_gdb_tool_message(GDB_EXACT_PAYLOAD, shape="langchain")
    ctx = extract_retrieval_context(payload)
    assert len(ctx) == 1, f"expected 1 item, got {len(ctx)}: {ctx!r}"
    assert "Metalaxyl+Mancozeb" in ctx[0], f"missing key text: {ctx[0]!r}"
    print(f"  exact_match (langchain shape) → {len(ctx)} item, len={len(ctx[0])}")


def test_exact_match_langgraph_shape():
    payload = _make_state_with_gdb_tool_message(GDB_EXACT_PAYLOAD, shape="langgraph")
    ctx = extract_retrieval_context(payload)
    assert len(ctx) == 1, f"expected 1 item, got {len(ctx)}: {ctx!r}"
    assert "Metalaxyl+Mancozeb" in ctx[0]
    print(f"  exact_match (langgraph shape) → {len(ctx)} item")


def test_similar_pair_path():
    payload = _make_state_with_gdb_tool_message(GDB_SIMILAR_PAYLOAD, shape="langchain")
    ctx = extract_retrieval_context(payload)
    assert len(ctx) == 1, f"expected 1 item, got {len(ctx)}: {ctx!r}"
    assert "Tomato late blight" in ctx[0]
    print(f"  similar_pair1 path → {len(ctx)} item")


def test_no_gdb_tool_message():
    state = {
        "messages": [
            {"role": "user", "content": "What is the weather?"},
            {"role": "assistant", "content": "It will rain."},
        ]
    }
    ctx = extract_retrieval_context(json.dumps(state))
    assert ctx == []
    print("  no GDB tool message → []")


def test_empty_payload():
    assert extract_retrieval_context("") == []
    print("  empty payload → []")


def test_malformed_json():
    assert extract_retrieval_context("not json at all {garbage}") == []
    print("  malformed JSON → []")


def test_no_messages_field():
    assert extract_retrieval_context(json.dumps({"foo": "bar"})) == []
    print("  no messages field → []")


def test_empty_answer():
    empty_answer_payload = json.dumps({
        "is_exact": True,
        "is_similar": False,
        "exact_match": {"answer": ""},
    })
    payload = _make_state_with_gdb_tool_message(empty_answer_payload, shape="langchain")
    ctx = extract_retrieval_context(payload)
    assert ctx == []
    print("  empty exact_match.answer → []")


def test_both_flags_false():
    ambiguous = json.dumps({
        "is_exact": False,
        "is_similar": False,
        "exact_match": {"answer": "should be ignored"},
    })
    payload = _make_state_with_gdb_tool_message(ambiguous, shape="langchain")
    ctx = extract_retrieval_context(payload)
    assert ctx == []
    print("  both flags false → []")


def test_fallback_role_match():
    state = {
        "messages": [
            {
                "role": "tool",
                "type": "tool",
                "content": GDB_EXACT_PAYLOAD,
            },
        ]
    }
    ctx = extract_retrieval_context(json.dumps(state))
    assert len(ctx) == 1, f"expected 1 item, got {len(ctx)}: {ctx!r}"
    assert "Metalaxyl" in ctx[0]
    print(f"  fallback role-match → {len(ctx)} item")


def test_integration_with_evaluate_response_quality():
    """
    End-to-end: a non-empty retrieval_context captured by extract_retrieval_context
    should activate ContextualRelevancyMetric. (Faithfulness also activates but
    will score ~1.0 trivially for GDB — the circularity property documented
    in GDB_STRUCTURE.md §6.)
    """
    os.environ["EVAL_JUDGE"] = "mock"

    # Force fresh judge cache: the module-level cache lives across test runs
    from ajrasakha.evaluation import judge as _judge_mod
    _judge_mod._JUDGE_CACHE = None

    from ajrasakha.evaluation.answer_eval import evaluate_response_quality

    payload = _make_state_with_gdb_tool_message(GDB_EXACT_PAYLOAD, shape="langchain")
    ctx = extract_retrieval_context(payload)
    assert len(ctx) == 1

    agent_synthesised = (
        "For tomato blight, use Metalaxyl+Mancozeb at 2.5g/L on a 10-day "
        "schedule. Apply preventively before monsoon for best results."
    )

    result = evaluate_response_quality(
        {
            "query": "What is the best treatment for tomato blight in Karnataka?",
            "response_text": agent_synthesised,
            "context": ctx,
        },
        enabled=True,
    )

    assert result["contextualrelevancymetric_passed"] != "SKIPPED", (
        f"ContextualRelevancy should run with non-empty context; "
        f"got passed={result['contextualrelevancymetric_passed']!r}"
    )
    assert result["faithfulnessmetric_passed"] != "SKIPPED"
    print(f"  ContextualRelevancy: passed={result['contextualrelevancymetric_passed']!r} "
          f"score={result['contextualrelevancymetric_score']!r}")
    print(f"  Faithfulness       : passed={result['faithfulnessmetric_passed']!r} "
          f"score={result['faithfulnessmetric_score']!r}")
    print(f"  gdb_match_score    : score={result['gdb_match_score_score']!r} "
          f"method={result['gdb_match_score_method']!r}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    print("=" * 75)
    print("retrieval_context_extractor tests")
    print("=" * 75)
    print()
    print("Validates extraction logic against synthetic SSE payload fixtures.")
    print("Live AI service round-trip still needed to capture a real payload.")
    print()

    tests = [
        ("exact_match / LangChain message shape",     test_exact_match_langchain_shape),
        ("exact_match / LangGraph message shape",     test_exact_match_langgraph_shape),
        ("similar_pair1 fallback path",               test_similar_pair_path),
        ("no GDB tool message",                       test_no_gdb_tool_message),
        ("empty payload",                             test_empty_payload),
        ("malformed JSON",                            test_malformed_json),
        ("JSON without 'messages'",                   test_no_messages_field),
        ("GDB response with empty answer",            test_empty_answer),
        ("both is_exact/is_similar false",            test_both_flags_false),
        ("fallback role-match (no 'name' field)",     test_fallback_role_match),
        ("integration with evaluate_response_quality", test_integration_with_evaluate_response_quality),
    ]

    failures = 0
    for name, fn in tests:
        print(f"[{name}]")
        try:
            fn()
            print(f"  PASS\n")
        except AssertionError as e:
            print(f"  FAIL: {e}\n")
            failures += 1
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}\n")
            failures += 1

    print("=" * 75)
    if failures == 0:
        print(f"RESULT: {len(tests)}/{len(tests)} tests passed")
        print()
        print("Confirmed: retrieval_context_extractor handles every shape we")
        print("expect from the LangGraph SSE stream. evaluate_response_quality")
        print("now activates ContextualRelevancy + Faithfulness (the latter")
        print("trivially per GDB_STRUCTURE.md §6) when a non-empty context is")
        print("passed in. Real /runs/stream end-to-end round-trip still needs")
        print("the AI service running.")
        return 0
    print(f"RESULT: {failures} test(s) FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())
