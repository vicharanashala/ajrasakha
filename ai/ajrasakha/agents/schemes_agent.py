from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from pydantic import BaseModel
from typing import Optional

from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.prompts import SCHEMES_SYSTEM_PROMPT
from langchain.agents import create_agent

schemes_mcp = MultiServerMCPClient(
    {
        "schemes": {
            "url": MCP_URLS["schemes"],
            "transport": "streamable_http",
        }
    }
)

llm = ChatAnthropic(model=CLAUDE_MODEL)

_schemes_agent_graph = None  # lazy init


async def _get_schemes_agent():
    global _schemes_agent_graph
    if _schemes_agent_graph is None:
        tools = await schemes_mcp.get_tools()
        _schemes_agent_graph = create_agent(
            name="schemes_agent",
            model=llm,
            tools=tools,
            system_prompt=SCHEMES_SYSTEM_PROMPT,
            checkpointer=True,
        )
    return _schemes_agent_graph


class SchemesInput(BaseModel):
    query: str                                      # e.g., "What subsidies are available for drip irrigation?"
    state: Optional[str] = None                                      # e.g., "Telangana"
    gender: Optional[str] = None                    # e.g., "Male", "Female"
    age: Optional[int] = None                       # e.g., 45
    caste: Optional[str] = None                     # e.g., "SC", "OBC"
    residence: Optional[str] = None                 # e.g., "Rural", "Urban"
    occupation: Optional[str] = None                # e.g., "Farmer"
    benefit_type: Optional[str] = None              # e.g., "Financial Assistance", "Subsidy"
    is_bpl: bool = False
    is_minority: bool = False
    is_differently_abled: bool = False


@tool(args_schema=SchemesInput)
async def schemes(
    query: str,
    state: Optional[str],
    gender: Optional[str],
    age: Optional[int],
    caste: Optional[str],
    residence: Optional[str],
    occupation: Optional[str],
    benefit_type: Optional[str],
    is_bpl: bool,
    is_minority: bool,
    is_differently_abled: bool,
    config: RunnableConfig,
) -> str:
    injected: dict = (config.get("configurable") or {}).get("location") or {}
    state = state or injected.get("state") or "unknown"
    """
    Query the government schemes agent.
    Use when the user asks about subsidies, government benefits, welfare schemes, or financial assistance.
    Pass all known farmer demographics (state, age, caste, etc.) for more targeted results.
    The agent will first search for matching schemes, then fetch details for the most relevant ones.
    """
    context = f"""
    State             : {state}
    Gender            : {gender or 'Not specified'}
    Age               : {age or 'Not specified'}
    Caste             : {caste or 'Not specified'}
    Residence         : {residence or 'Not specified'}
    Occupation        : {occupation or 'Farmer'}
    Benefit Type      : {benefit_type or 'Not specified'}
    BPL               : {'Yes' if is_bpl else 'No'}
    Minority          : {'Yes' if is_minority else 'No'}
    Differently Abled : {'Yes' if is_differently_abled else 'No'}

    Query: {query}
    """.strip()

    import asyncio
    agent = await _get_schemes_agent()
    try:
        coro = agent.ainvoke(
            {"messages": [HumanMessage(content=context)]},
            config=config,
        )
        result = await asyncio.wait_for(asyncio.shield(coro), timeout=45.0)
        return result["messages"][-1].content
    except asyncio.CancelledError:
        task = asyncio.current_task()
        if task and hasattr(task, "uncancel"):
            task.uncancel()
        return "⚠️ The request was cancelled."
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("schemes sub-agent failed: %s", exc)
        return f"⚠️ The government schemes service is temporarily unavailable. Error: {type(exc).__name__}"