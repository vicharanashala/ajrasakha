import json
import logging
from typing import Dict, Any, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel

from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS

logger = logging.getLogger(__name__)

HIGH_SIMILARITY_THRESHOLD = 0.95
NOT_FOUND = "Relevant answer not found in GDB."


class Source(BaseModel):
    source: str
    page: Optional[int] = None
    source_name: Optional[str] = None


class AgriQnA(BaseModel):
    question_id: str
    question_text: str
    answer_text: str
    author: str
    sources: list[Source]
    similarity_score: float


class GDBResult(BaseModel):
    question_id: str
    question_text: str
    answer_text: str
    authors: list[str]
    sources: list[Source]
    similarity_score: float
    found_exact_question: bool


REACT_SYSTEM_PROMPT = """You are a knowledge retrieval specialist for AjraSakha.

Your job is to find the most relevant answer from the knowledge base for the farmer's query.

You have access to golden_retriever_tool. Use it as many times as needed:
1. First call with the exact farmer query.
2. If results are not relevant, try a paraphrased or simplified version of the query.
3. If still not relevant, try with filters: crop, state, season, or domain if they can be inferred from the query.
4. Use get_available_states, get_available_crops, get_available_domains to discover valid filter values if needed.
5. Stop when you have found relevant results or have exhausted reasonable attempts.

Return all retrieved results as-is. Do not summarize or answer — just retrieve.
"""

EXTRACTION_SYSTEM_PROMPT = """You are extracting a structured answer from retrieved knowledge base documents.

Given the farmer's query and a list of retrieved QuestionAnswerPair documents, produce a GDBResult:
- question_id: from the most relevant document
- question_text: the farmer's original query
- answer_text: the answer from the most relevant document (do not modify or summarize)
- authors: list of all unique author names from all retrieved documents
- sources: sources from the most relevant document
- similarity_score: from the most relevant document
- found_exact_question: false (this is set by the retrieval logic, not by you)

Pick the document with the highest similarity_score as the most relevant.
"""

PARAPHRASE_PROMPT = """Paraphrase the following farmer query into a clear, standard agricultural English question for searching a knowledge base. Return only the paraphrased question, nothing else."""

mcp_client = MultiServerMCPClient({
    "golden_db": {"url": MCP_URLS["gdb"], "transport": "http"},
})


def _coerce_sources(raw: Any) -> list[Source]:
    if not isinstance(raw, list):
        return []
    result = []
    for s in raw:
        if isinstance(s, str):
            result.append(Source(source=s))
        elif isinstance(s, dict):
            url = s.get("url") or s.get("source") or s.get("link") or ""
            result.append(Source(
                source=url,
                page=s.get("page"),
                source_name=s.get("name") or s.get("source_name") or s.get("title"),
            ))
    return result


def _to_dict(item: Any) -> dict | None:
    if isinstance(item, dict):
        if item.get("type") == "text" and isinstance(item.get("text"), str):
            try:
                return json.loads(item["text"])
            except Exception:
                return None
        return item
    if hasattr(item, "model_dump"):
        return item.model_dump()
    if hasattr(item, "__dict__"):
        return item.__dict__
    return None


def _parse(raw: Any) -> list[AgriQnA]:
    if not isinstance(raw, list):
        return []
    results = []
    for item in raw:
        d = _to_dict(item)
        if d is None:
            continue
        try:
            d["sources"] = _coerce_sources(d.get("sources", []))
            results.append(AgriQnA.model_validate(d))
        except Exception as e:
            logger.warning("Failed to parse GDB item: %s | item=%s", e, str(d)[:200])
    return results


def _merge(a: list[AgriQnA], b: list[AgriQnA]) -> list[AgriQnA]:
    seen = {r.question_id: r for r in a}
    for r in b:
        if r.question_id not in seen:
            seen[r.question_id] = r
    return sorted(seen.values(), key=lambda r: r.similarity_score, reverse=True)


def _find_exact(results: list[AgriQnA], query: str) -> AgriQnA | None:
    q = query.strip().lower()
    return next((r for r in results if r.question_text.strip().lower() == q), None)


def _to_result(match: AgriQnA, all_results: list[AgriQnA], found_exact: bool) -> GDBResult:
    authors = list(dict.fromkeys(r.author for r in all_results if r.author))
    return GDBResult(
        question_id=match.question_id,
        question_text=match.question_text,
        answer_text=match.answer_text,
        authors=authors,
        sources=match.sources,
        similarity_score=match.similarity_score,
        found_exact_question=found_exact,
    )


def _collect_results_from_messages(messages: list) -> list[AgriQnA]:
    all_results = []
    for msg in messages:
        if hasattr(msg, "content") and isinstance(msg.content, list):
            for block in msg.content:
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    parsed = _parse(block.get("content", []))
                    all_results = _merge(all_results, parsed)
        elif hasattr(msg, "content") and isinstance(msg.content, str):
            try:
                raw = json.loads(msg.content)
                if isinstance(raw, list):
                    all_results = _merge(all_results, _parse(raw))
            except Exception:
                pass
    return all_results


async def run_gdb_agent(state: Dict[str, Any]) -> Dict[str, Any]:
    query = state.get("query", "")

    tools = await mcp_client.get_tools()
    llm = ChatAnthropic(model=CLAUDE_MODEL)
    structured_llm = llm.with_structured_output(GDBResult)

    golden_tool = next((t for t in tools if t.name == "golden_retriever_tool"), None)

    exact_raw = await golden_tool.ainvoke({"query": query})
    initial_results = _parse(exact_raw)

    exact_match = _find_exact(initial_results, query)
    if exact_match:
        logger.info("Exact question match found for: %s", query)
        return {"final_answer": _to_result(exact_match, initial_results, found_exact=True)}

    if initial_results and initial_results[0].similarity_score >= HIGH_SIMILARITY_THRESHOLD:
        logger.info("High similarity match (%.3f) found", initial_results[0].similarity_score)
        return {"final_answer": _to_result(initial_results[0], initial_results, found_exact=False)}

    react_agent = create_react_agent(model=llm, tools=tools, prompt=REACT_SYSTEM_PROMPT)
    react_response = await react_agent.ainvoke({
        "messages": [HumanMessage(content=query)]
    })

    all_results = _collect_results_from_messages(react_response["messages"])
    all_results = _merge(initial_results, all_results)

    if not all_results:
        return {"final_answer": NOT_FOUND}

    exact_match = _find_exact(all_results, query)
    if exact_match:
        return {"final_answer": _to_result(exact_match, all_results, found_exact=True)}

    result: GDBResult = await structured_llm.ainvoke([
        SystemMessage(content=EXTRACTION_SYSTEM_PROMPT),
        HumanMessage(content=f"Farmer query: {query}\n\nRetrieved documents:\n{[r.model_dump() for r in all_results]}"),
    ])
    result.found_exact_question = False
    return {"final_answer": result}
