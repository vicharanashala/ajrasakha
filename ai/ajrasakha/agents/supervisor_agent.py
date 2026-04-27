import logging
from typing import Dict, Any, List

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent

from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.prompts import SUPERVISOR_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

llm = ChatAnthropic(model=CLAUDE_MODEL)

mcp_client = MultiServerMCPClient({
    "faq_video_server": {"url": MCP_URLS["faq_video"], "transport": "http"},
})

DISCLAIMER = """
---
> **Notice (Testing Phase)**
>
> AjraSakha is currently in testing. Advisories cover selected crops and states and are being validated by agri experts.
> Always confirm recommendations with your local agricultural officer before applying.
>
> **Data sources:** Crop advisories from verified agri specialists from annam.ai | Weather from Indian Meteorological Department (IMD) | Market prices from Agmarknet, eNAM, and state APMC portals.
"""


def _render_sources_table(sources: List[dict]) -> str:
    if not sources:
        return ""

    has_pop = any(s.get("source_type") == "package_of_practices" for s in sources)

    if has_pop:
        rows = ["| Source / PDF | Page |", "|---|---|"]
        for s in sources:
            link = s.get("link") or s.get("source_name") or "N/A"
            page = str(s.get("page_number")) if s.get("page_number") else "N/A"
            rows.append(f"| {link} | {page} |")
    else:
        rows = ["| Agri Specialist | Source Document | Link | Match Score |", "|---|---|---|---|"]
        for s in sources:
            expert = s.get("agri_expert") or "N/A"
            name = s.get("source_name") or "N/A"
            raw_link = s.get("link")
            link = f"[View]({raw_link})" if raw_link else "N/A"
            score = f"{s['similarity_score']:.2f}" if s.get("similarity_score") is not None else "N/A"
            rows.append(f"| {expert} | {name} | {link} | {score} |")

    return "\n".join(rows)


def _render_gdb_answer(gdb_dict: dict, mode: str = "short") -> str:
    sources = gdb_dict.get("sources", [])
    sources_table = _render_sources_table(sources)

    if mode == "short":
        short_answer = gdb_dict.get("short_answer", gdb_dict.get("answer", ""))
        full_answer = gdb_dict.get("answer", "")

        parts = [short_answer]
        parts.append(
            f"\n<details>\n<summary>View detailed answer</summary>\n\n{full_answer}\n\n</details>"
        )
    else:
        parts = [gdb_dict.get("answer", "")]

    if sources_table:
        parts.append(f"\n### Sources\n\n{sources_table}")

    parts.append(DISCLAIMER)
    return "\n\n".join(parts)


def _extract_gdb_result(results: list) -> dict | None:
    for result in results:
        if isinstance(result, dict) and "answer" in result and "sources" in result:
            return result
    return None


def _format_non_gdb_results(results: list) -> str:
    parts = []
    for result in results:
        if isinstance(result, dict) and "answer" in result and "sources" in result:
            continue
        if result:
            parts.append(str(result))
    return "\n\n---\n\n".join(parts)


async def run_supervisor_agent(state: Dict[str, Any]) -> Dict[str, Any]:
    original_query = state.get("original_query", "")
    sub_agent_results = state.get("final_answer", [])
    response_mode = state.get("response_mode", "short")

    gdb_result = _extract_gdb_result(sub_agent_results)
    other_results = _format_non_gdb_results(sub_agent_results)

    if gdb_result and not other_results:
        final_text = _render_gdb_answer(gdb_result, mode=response_mode)
        return {"messages": [AIMessage(content=final_text)]}

    synthesis_input = []
    if gdb_result:
        answer_key = "short_answer" if response_mode == "short" else "answer"
        synthesis_input.append(f"Knowledge Base Answer:\n{gdb_result.get(answer_key, gdb_result.get('answer', ''))}")
    if other_results:
        synthesis_input.append(other_results)

    synthesis_prompt = (
        f"Farmer's original query (answer MUST be in this exact language): {original_query}\n\n"
        f"Data from specialist agents:\n\n" + "\n\n---\n\n".join(synthesis_input)
        if synthesis_input
        else original_query
    )

    tools = await mcp_client.get_tools()
    agent = create_agent(llm, tools=tools, system_prompt=SUPERVISOR_SYSTEM_PROMPT)
    response = await agent.ainvoke({"messages": [HumanMessage(content=synthesis_prompt)]})
    final_text = response["messages"][-1].content

    if gdb_result:
        sources_table = _render_sources_table(gdb_result.get("sources", []))
        if sources_table:
            final_text += f"\n\n### Sources\n\n{sources_table}"

    final_text += DISCLAIMER
    return {"messages": [AIMessage(content=final_text)]}
