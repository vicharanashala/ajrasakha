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

SEARCH_RULES = """- Search the library thoroughly, with several phrasings of the question, and open the pages that matter.
- Read tables row by row (crop, pest or disease, product, dose, waiting period or interval) and take each product's dose and waiting period from its own row. Never mix the figures of different rows.
- Report every relevant fact with its figures: doses, timings, intervals, waiting periods, conditions.
- Cite every fact with the library passage it comes from.
- The library can hold several editions of one package of practices (for example Rabi 2022-23 and Rabi 2025-26). Take the figures from the newest edition; use an older edition only for a point the newest does not cover, and name its year. Never mix doses or products of different editions.
- Questions come in a farmer's words, the documents in technical ones. Before concluding that the library has nothing, search the technical names too: "ground worms" or "soil pests" also means white grubs, termites, cutworms, root weevils, root-feeding larvae and nematodes, and pests that pupate in the soil; "birds" also means parrots, sparrows and scaring or netting methods.
- When the state's own package of practices gives no control measure for the pest or problem asked about (for example it only describes the pest), do not stop there. Search the national and other documents in the library (NIPHM or DPPQS integrated pest management packages, ICAR and other all-India documents; never another state's document) for what they recommend, and report it with the name of its document.
- Use only my library. Do not use the web or papers, and add nothing from general knowledge.
"""

PROMPT = """A reviewer is drafting an answer for a farmer-facing agricultural database. Research the question in my library of Package of Practices and other agricultural documents, and report what the documents say.

Question: {question}
{context}
How to work:
{rules}- Give clear findings; do not write a final farmer-facing answer. Start directly with the findings, with no remarks on how you searched.
- If the library has nothing for this crop in this state, say so plainly and say what it does have.
"""


# DRAFT_ANSWER_BY=agent: the agent writes the finished answer itself, in the domain's layout, as it does in Anara's
# web chat; the default (writer) has it report findings that a second model then lays out.
ANSWER_BY_AGENT = os.getenv("DRAFT_ANSWER_BY", "agent").strip().lower() == "agent"
# no second model runs after the agent, so it may use most of the backend's 420 seconds (the longest seen: 171)
ANSWER_TIMEOUT_SECONDS = float(os.getenv("ANARA_ANSWER_TIMEOUT", "270"))

ANSWER_PROMPT = """You are helping write an agricultural answer for a farmer-facing database in India.

Question: {question}
{context}
How to work:
{rules}- Never name an individual person (officer, staff member, scientist or author), and give no personal phone number or e-mail; name the office or post instead.
- After every sentence, cite the library passage it comes from.
- If the documents do not answer the question, say so in one line and stop. Do not guess.

{shape}
Write the answer itself, with no remarks on how you searched and no mention of "the passages". Start directly with the first section.
"""

SHAPE = """Write the answer in sections, each with a short title on its own line and then its text.
The usual sections of an answer in the domain "{domain}" are listed below. Use the Narrow list for a question about one specific thing (a dose, a timing, one fix), otherwise the Broad list. Keep their order, but give each section a plain title that fits this question; a title that names a particular crop, disease or chemical is only an example, so rename it for this question. Leave a section out completely when the documents have nothing for it: never write that something is not given, and never repeat a fact in a second section. Put the direct answer first and end with a short conclusion that points the farmer to the local KVK if their case differs. The lists only give the sections: every fact comes from the documents.

Broad: {broad}
Narrow: {narrow}
"""

PLAIN_SHAPE = (
    "Write the answer in sections, each with a short title on its own line and then its text: the direct answer to the "
    "question first, then the steps or reasons, then a short conclusion that points the farmer to the local KVK if their "
    "case differs. Leave out anything the documents do not cover.\n"
)


def _shape(domain: str | None) -> str:
    import anara_drafter

    entry = anara_drafter.structure_for(domain)
    if entry is None:
        return PLAIN_SHAPE
    return SHAPE.format(
        domain=entry["domain"], broad=anara_drafter._outline(entry["broad"]), narrow=anara_drafter._outline(entry["narrow"])
    )


def build_prompt(
    question: str, crop: str | None, state: str | None, domain: str | None, source_names: list[str] | None = None,
    write_answer: bool = False,
) -> str:
    lines = []
    if crop:
        lines.append(f"Crop: {crop}. A document about another crop does not answer this.")
    if state:
        lines.append(
            f"State of the record: {state}. Use only documents of {state} and national (central government or "
            f"all-India) documents. Never use a document of another state, even when it covers the point."
        )
    if domain and not write_answer:
        lines.append(f"Topic area: {domain}.")
    if source_names:
        lines.append("The record's own source files, which came with the question (search these first): "
                     + "; ".join(source_names) + ".")
    context = ("\n".join(lines) + "\n") if lines else ""
    if write_answer:
        return ANSWER_PROMPT.format(question=question, context=context, rules=SEARCH_RULES, shape=_shape(domain))
    return PROMPT.format(question=question, context=context, rules=SEARCH_RULES)


def _server_text(result) -> dict[str, Any]:
    if result.is_error:
        raise RuntimeError(f"Anara agent call failed: {result.content[0].text if result.content else 'unknown'}")
    return result.structured_content or {}


async def _run(prompt: str, timeout: float = AGENT_TIMEOUT_SECONDS) -> dict[str, Any]:
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
                deadline = time.time() + timeout
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
                        raise TimeoutError(f"the Anara agent took longer than {timeout:.0f} seconds")
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
    source_names: list[str] | None = None, write_answer: bool = False,
) -> dict[str, Any] | None:
    """{"passages": [...], "notes": text with {passageId} tags} from Anara's agent, or None when it cannot be used.

    A passage has documentName, documentId, pageNumber, sourcePages, passageId and text. `notes` is the agent's
    own findings; number_notes() turns its tags into the [P#] numbers of the final passage list.
    """
    import anara_client
    import anara_search

    prompt = build_prompt(question, crop, state, domain, source_names, write_answer)
    result = passages = None
    for attempt in (1, 2):
        started = time.time()
        try:
            anara_search.prepare()
            limit = ANSWER_TIMEOUT_SECONDS if write_answer else AGENT_TIMEOUT_SECONDS
            result = anara_search.within(limit + 20, lambda: asyncio.run(_run(prompt, limit)))
            cited = _cited(result)
            hits = anara_client.passages_for(cited) if cited else []
            passages = anara_search.finish_hits(hits, keep_unopenable=True)
            passages = _as_record_sources(passages)
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
    notes = notes.strip() if write_answer else _drop_narration(notes.strip())
    return {"passages": passages, "notes": notes, "other_states": other_states, "writes_answer": write_answer}


_SOURCE_NAME = re.compile(r"^src-([A-Za-z0-9]+)__(.+?)(?:\.pdf)?$")


def _as_record_sources(passages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    import anara_client
    import library_files
    import record_sources

    unknown = sorted({p["documentId"] for p in passages if p.get("documentId") and not library_files.name_for_document(p["documentId"])})
    if not unknown:
        return passages
    try:
        names = anara_client.execute(
            f"RESULT = {{i: (anara('entities.get', {{'id': i}}) or {{}}).get('name') for i in {anara_client.literal(unknown)}}}"
        ) or {}
    except Exception as error:
        logger.warning("could not look up the names of cited documents: %s", error)
        return passages
    renamed = []
    for passage in passages:
        found = _SOURCE_NAME.match(str(names.get(passage.get("documentId")) or ""))
        if found:
            passage = {**passage, "documentId": record_sources.document_id_for(found.group(1)), "documentName": found.group(2)}
        renamed.append(passage)
    return renamed


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


def finished_answer(notes: str, passages: list[dict[str, Any]]) -> dict[str, Any]:
    """The agent's own answer as a draft: [P#] numbers for its citations, plain text, the passages it cites."""
    answer = re.sub(r"(?m)^#{1,6}\s*", "", number_notes(notes, passages)).replace("**", "").strip()
    citations = []
    for number in sorted({int(n) for n in re.findall(r"\[P(\d+)\]", answer)}):
        if 1 <= number <= len(passages):
            passage = passages[number - 1]
            citations.append({
                "passageNumber": number,
                "documentName": passage.get("documentName"),
                "documentId": passage.get("documentId"),
                "pageNumber": passage.get("pageNumber"),
                "sourcePages": passage.get("sourcePages") or [],
                "passageId": passage.get("passageId"),
            })
    return {"answer": answer, "citations": citations, "note": ""}


def plain_notes(notes: str) -> str:
    """The findings with the passage tags removed, for showing to the reviewer."""
    text = re.sub(r" \{[^}]+\}", "", notes)
    text = re.sub(r"(?m)^#{1,6}\s*", "", text).replace("**", "")  # the toast shows plain text, not markdown
    return text.strip()
