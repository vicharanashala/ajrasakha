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

# a plain question takes the agent about 10 seconds, a broad one over 100; past this it is cancelled and the weaker
# plain search is used. The backend waits 240 seconds, and the writer needs about 30 after the agent.
AGENT_TIMEOUT_SECONDS = float(os.getenv("ANARA_AGENT_TIMEOUT", "190"))
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
- The library can hold several editions of one package of practices (for example Rabi 2022-23 and Rabi 2025-26). Take the figures from the newest edition; use an older edition only for a point the newest does not cover, and name its year. Never mix doses or products of different editions.
- Questions come in a farmer's words, the documents in technical ones. Before concluding that the library has nothing, search the technical names too: "ground worms" or "soil pests" also means white grubs, termites, cutworms, root weevils, root-feeding larvae and nematodes, and pests that pupate in the soil; "birds" also means parrots, sparrows and scaring or netting methods.
- When the state's own package of practices gives no control measure for the pest or problem asked about (for example it only describes the pest), do not stop there. Search the national and other documents in the library (NIPHM or DPPQS integrated pest management packages, ICAR and other all-India documents; never another state's document) for what they recommend, and report it with the name of its document.
- Use only my library. Do not use the web or papers, and add nothing from general knowledge.
- Give clear findings; do not write a final farmer-facing answer. Start directly with the findings, with no remarks on how you searched.
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
            f"State of the record: {state}. Use only documents of {state} and national (central government or "
            f"all-India) documents. Never use a document of another state, even when it covers the point."
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
                last_length = -1
                while True:
                    status = _server_text(await session.call_tool("anara_check_agent", {"runId": run_id})).get("status")
                    if status == "completed":
                        break
                    if status in ("failed", "cancelled"):
                        raise RuntimeError(f"the Anara agent {status}")
                    # the status can stay "running" for a minute or more after the findings are written (seen: a
                    # 75-second wait for an answer that was ready), so the result is looked at too: findings that
                    # have stopped growing are final
                    snapshot = _server_text(await session.call_tool("anara_get_agent_result", {"runId": run_id}))
                    length = snapshot.get("totalLength") or 0
                    if length and length == last_length:
                        break
                    last_length = length
                    if time.time() > deadline:
                        if length:  # better the findings so far than the weaker plain search
                            break
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
                if status != "completed":
                    await session.call_tool("anara_cancel_agent", {"runId": run_id})
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

    prompt = build_prompt(question, crop, state, domain, source_names)
    result = passages = None
    for attempt in (1, 2):
        started = time.time()
        try:
            anara_search.prepare()
            result = anara_search.within(AGENT_TIMEOUT_SECONDS + 20, lambda: asyncio.run(_run(prompt)))
            cited = _cited(result)
            hits = anara_client.passages_for(cited) if cited else []
            passages = anara_search.finish_hits(hits, keep_unopenable=True)
            break
        except Exception as error:
            # the MCP client wraps the real error in an ExceptionGroup ("unhandled errors in a TaskGroup")
            logger.warning("the Anara agent failed (attempt %d): %s", attempt, _leaf_errors(error))
            # a quick failure is a connection hiccup and worth one more try; a slow one would only use up the draft's time
            if attempt == 2 or time.time() - started > RETRY_ONLY_IF_FAILED_WITHIN:
                logger.warning("using the plain library search instead")
                return None
    passages, other_states, dropped = _keep_state(passages, state)
    keep = {passage.get("passageId") for passage in passages}
    text = _drop_lines_of(result.get("text") or "", dropped)
    notes = _TAG.sub(lambda m: " {%s}" % m.group(1) if m.group(1) in keep else "", text)
    return {"passages": passages, "notes": _drop_narration(notes.strip()), "other_states": other_states}


def _keep_state(passages: list[dict[str, Any]], state: str | None) -> tuple[list[dict[str, Any]], list[str], set[str]]:
    """The passages of the record's own state and of documents that name no state. The prompt asks the agent to
    keep to these, but it does not always, so the rule is enforced here too: (kept, states left out, ids left out)."""
    import anara_search

    wanted = anara_search.canonical_state(state)
    if not wanted:
        return passages, [], set()
    kept, other_states, dropped = [], set(), set()
    for passage in passages:
        found = anara_search.canonical_state(str(passage.get("documentName") or "").split("~")[0])
        if found and found != wanted:
            other_states.add(found)
            dropped.add(passage.get("passageId"))
        else:
            kept.append(passage)
    return kept, sorted(other_states), dropped


NL = chr(10)


def _drop_lines_of(text: str, dropped: set[str]) -> str:
    """The text without the lines whose only sources are passages that were left out."""
    if not dropped:
        return text
    lines = []
    for line in text.split(NL):
        ids = _TAG.findall(line)
        if ids and all(i in dropped for i in ids):
            continue
        lines.append(line)
    return NL.join(lines)


RETRY_ONLY_IF_FAILED_WITHIN = 30


def _leaf_errors(error: BaseException) -> str:
    """The real errors inside nested ExceptionGroups."""
    inner_errors = getattr(error, "exceptions", None)  # an ExceptionGroup (also the backport on Python 3.10)
    if inner_errors:
        return "; ".join(_leaf_errors(inner) for inner in inner_errors)
    return f"{type(error).__name__}: {error}"


def _drop_narration(text: str) -> str:
    """The agent narrates while it searches ("Let me check ...") before its findings, which start at the first heading."""
    # the narration runs straight into the first heading ("...rice chapter.## Findings")
    heading = re.search(r"(?m)(?:^|(?<=[.!?:]))#{1,4} ", text)
    return text[heading.start():] if heading and heading.start() > 0 else text


def number_notes(notes: str, passages: list[dict[str, Any]]) -> str:
    """The findings with each {passageId} replaced by the [P#] number it has in this passage list;
    a tag for a passage that is not in the list is dropped."""
    numbers = {passage.get("passageId"): number for number, passage in enumerate(passages, start=1)}
    return re.sub(r" \{([^}]+)\}", lambda m: f" [P{numbers[m.group(1)]}]" if m.group(1) in numbers else "", notes)


def plain_notes(notes: str) -> str:
    """The findings with the passage tags removed, for showing to the reviewer."""
    text = re.sub(r" \{[^}]+\}", "", notes)
    text = re.sub(r"(?m)^#{1,6}\s*", "", text).replace("**", "")  # the toast shows plain text, not markdown
    return text.strip()
