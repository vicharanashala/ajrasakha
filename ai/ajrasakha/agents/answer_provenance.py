"""Answer provenance metadata — where an answer came from and its verification status.

This module derives a small, additive metadata object from data the pipeline
already computes (GDB match flags, expert-queue routing). It never invents a
verification status: a value is only ever "verified" or "reviewed" when the
Golden Dataset match data actually says so, and "pending_review" only when the
plan actually took the expert-queue path.

Deliberately NOT included:
- "package_of_practices" as a `source` value — grep of ai/ajrasakha/agents/config.py
  MCP_URLS confirms no PoP tool is wired into the live graph today, so a PoP source
  can never actually be produced. Add it the day pop_v2 is wired into tool_registry.py.
- an "ai_generated" source value — assemble_answer_body_node() never invokes a raw
  LLM to freely generate crop-advisory content; the only non-GDB answer body is
  deterministic specialist-tool output (weather/mandi/soil/schemes), which is real
  live data, not "AI generated" text. Labeling it that way would misrepresent it, so
  provenance is simply omitted for that path (see F: missing provenance is a valid,
  expected state, not an error).
- "reviewedAt" — no timestamp field exists anywhere in the Golden API match payload
  (checked mcp/mcp_containers/golden_dataset/models.py and gdb_agent.py's
  normalization). Omitted rather than fabricated.
"""

from __future__ import annotations

from typing import Any, Optional

from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.state import TRANSLATE_PATH_EMPTY_GDB

SOURCE_GOLDEN_DATASET = "golden_dataset"

STATUS_VERIFIED = "verified"
STATUS_REVIEWED = "reviewed"
STATUS_PENDING_REVIEW = "pending_review"


def _chosen_gdb_pair(gdb_data: dict) -> dict:
    """Return the matched Q&A pair GDB actually chose to answer with."""
    if gdb_data.get("is_exact"):
        return gdb_data.get("exact_match") or {}
    if gdb_data.get("is_similar"):
        return gdb_data.get("similar_pair1") or {}
    return {}


def build_answer_provenance(
    gdb_data: Optional[dict],
    plan: Optional[dict[str, Any]],
) -> Optional[dict]:
    """Build provenance metadata for the current turn's answer, or None.

    Returns None when there is nothing honest to say about provenance (e.g. a
    specialist-tool-only answer, or a greeting) — callers must treat a missing
    provenance object as a normal, expected case, not an error.
    """
    plan = plan or {}

    # Expert-queue path: there is no answer body yet — the farmer is told a
    # human will respond. This is real, not fabricated: it's the exact branch
    # assemble_answer_body_node()/translate_answer_node() take when GDB and
    # specialist tools both come up empty.
    if plan.get("translate_path") == TRANSLATE_PATH_EMPTY_GDB:
        return {
            "source": None,
            "verificationStatus": STATUS_PENDING_REVIEW,
            "sourceId": None,
            "sourceTitle": None,
        }

    if not gdb_data or not gdb_has_usable_answers(gdb_data):
        # Specialist-tool-only answer or greeting — not a Golden Dataset
        # answer, and not a fabricated "AI generated" label either.
        return None

    pair = _chosen_gdb_pair(gdb_data)
    source_id = gdb_data.get("chosen_question_id") or pair.get("question_id") or None
    source_title = (pair.get("question") or "").strip() or None

    verification_status = STATUS_VERIFIED if gdb_data.get("is_exact") else STATUS_REVIEWED

    return {
        "source": SOURCE_GOLDEN_DATASET,
        "verificationStatus": verification_status,
        "sourceId": source_id,
        "sourceTitle": source_title,
    }
