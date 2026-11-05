"""Anara's own agent does the research; the drafter only writes the answer.

Anara's web chat does not just run one search. Its agent searches the library with several phrasings, opens
the pages, reads the tables and answers with citations. The MCP server offers that same agent
(anara_spawn_agent), so a draft asks it the question, gets back its findings with the passages they come
from, and the drafter writes the reviewer's answer in the domain's outline from those findings.

research() returns None when the agent cannot be used; the caller then falls back to the plain library search.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from typing import Any

logger = logging.getLogger(__name__)

# the agent finishes a plain question in about 10 seconds; a draft gives it this long (the backend waits 240)
AGENT_TIMEOUT_SECONDS = float(os.getenv("ANARA_AGENT_TIMEOUT", "100"))
POLL_SECONDS = 3
# empty means Anara's own default ("Auto"), the model its web interface uses
AGENT_MODEL = os.getenv("ANARA_AGENT_MODEL", "").strip()
MAX_PASSAGES = 10
_TAG = re.compile(r"\s*<source\b[^>]*>\s*([^<\s]+)\s*</source>")

PROMPT = """A reviewer is drafting an answer for a farmer-facing agricultural database. Research the question in my library of Package of Practices and other agricultural documents, and report what the documents say.

Question: {question}
{context}
How to work:
- Search the library thoroughly, with several phrasings of the question, and open the pages that matter.
- Read tables row by row (crop, pest or disease, product, dose, waiting period or interval) and take each product's dose and waiting period from its own row. Never mix the figures of different rows.
- Report every relevant fact with its figures: doses, timings, intervals, waiting periods, conditions.
- Cite every fact with the library passage it comes from.
- Use only my library. Do not use the web or papers, and add nothing from general knowledge.
- Give clear findings; do not write a final farmer-facing answer.
- If the library has nothing for this crop in this state, say so plainly and say what it does have.
"""


def build_prompt(
    question: str, crop: str | None, state: str | None, domain: str | None, source_names: list[str] | None = None
) -> str:
    lines = []
    if crop:
        lines.append(f"Crop: {crop}. A document about another crop does not answer this.")
    if state:
        lines.append(
            f"State of the record: {state}. Prefer documents of this state and national documents. If no document "
            f"covers {state}, say so plainly: do not present another state's advice as {state}'s."
        )
    if domain:
        lines.append(f"Topic area: {domain}.")
    if source_names:
        lines.append("The record's own source files, which came with the question (search these first): "
                     + "; ".join(source_names) + ".")
    context = ("\n".join(lines) + "\n") if lines else ""
    return PROMPT.format(question=question, context=context)


def _server_text(result) -> dict[str, Any]:
    if result.is_error:
        raise RuntimeError(f"Anara agent call failed: {result.content[0].text if result.content else 'unknown'}")
    return result.structured_content or {}


async def _run(prompt: str) -> dict[str, Any]:
    """Start the agent, wait for it, and return its result ({text, citations})."""
    import httpx2
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client

    import anara_client

    arguments: dict[str, Any] = {"requestId": str(uuid.uuid4()), "prompt": prompt}
    if AGENT_MODEL:
        arguments["modelName"] = AGENT_MODEL
    async with httpx2.AsyncClient(auth=anara_client._provider(), timeout=120) as http_client:
        async with streamable_http_client(anara_client.SERVER_URL, http_client=http_client) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                started = _server_text(await session.call_tool("anara_spawn_agent", arguments))
                run_id = started.get("runId")
                if not run_id:
                    raise RuntimeError(f"Anara did not start the agent: {json.dumps(started)[:300]}")
                deadline = time.time() + AGENT_TIMEOUT_SECONDS
                while True:
                    status = _server_text(await session.call_tool("anara_check_agent", {"runId": run_id})).get("status")
                    if status == "completed":
                        break
                    if status in ("failed", "cancelled"):
                        raise RuntimeError(f"the Anara agent {status}")
                    if time.time() > deadline:
                        await session.call_tool("anara_cancel_agent", {"runId": run_id})
                        raise TimeoutError(f"the Anara agent took longer than {AGENT_TIMEOUT_SECONDS:.0f} seconds")
                    await asyncio.sleep(POLL_SECONDS)
                result = _server_text(await session.call_tool("anara_get_agent_result", {"runId": run_id}))
                text, offset = result.get("text") or "", len(result.get("text") or "")
                while offset < (result.get("totalLength") or 0):  # a long answer comes in pieces
                    more = _server_text(await session.call_tool("anara_get_agent_result", {"runId": run_id, "offset": offset}))
                    if not more.get("text"):
                        break
                    text += more["text"]
                    offset += len(more["text"])
                result["text"] = text
                return result


def _cited(result: dict[str, Any]) -> list[dict[str, Any]]:
    """The passages the agent cited, each once, in the order it cited them in its text."""
    by_id = {c["passageId"]: c for c in result.get("citations") or [] if c.get("passageId") and c.get("resolved", True)}
    ordered = []
    for passage_id in _TAG.findall(result.get("text") or ""):
        if passage_id in by_id and by_id[passage_id] not in ordered:
            ordered.append(by_id[passage_id])
    ordered += [c for c in by_id.values() if c not in ordered]
    return ordered[:MAX_PASSAGES]


def research(
    question: str, crop: str | None = None, state: str | None = None, domain: str | None = None,
    source_names: list[str] | None = None,
) -> dict[str, Any] | None:
    """{"passages": [...], "notes": text with {passageId} tags} from Anara's agent, or None when it cannot be used.

    A passage has documentName, documentId, pageNumber, sourcePages, passageId and text. `notes` is the agent's
    own findings; number_notes() turns its tags into the [P#] numbers of the final passage list.
    """
    import anara_client
    import anara_search

    try:
        anara_search.prepare()
        result = anara_search.within(AGENT_TIMEOUT_SECONDS + 20, lambda: asyncio.run(_run(build_prompt(question, crop, state, domain, source_names))))
        cited = _cited(result)
        hits = anara_client.passages_for(cited) if cited else []
        passages = anara_search.finish_hits(hits)
    except Exception as error:
        logger.warning("the Anara agent could not be used, using the plain library search: %s", error)
        return None
    keep = {passage.get("passageId") for passage in passages}
    notes = _TAG.sub(lambda m: " {%s}" % m.group(1) if m.group(1) in keep else "", result.get("text") or "")
    return {"passages": passages, "notes": notes.strip()}


def number_notes(notes: str, passages: list[dict[str, Any]]) -> str:
    """The findings with each {passageId} replaced by the [P#] number it has in this passage list;
    a tag for a passage that is not in the list is dropped."""
    numbers = {passage.get("passageId"): number for number, passage in enumerate(passages, start=1)}
    return re.sub(r" \{([^}]+)\}", lambda m: f" [P{numbers[m.group(1)]}]" if m.group(1) in numbers else "", notes)


def plain_notes(notes: str) -> str:
    """The findings with the passage tags removed, for showing to the reviewer."""
    return re.sub(r" \{[^}]+\}", "", notes).strip()
