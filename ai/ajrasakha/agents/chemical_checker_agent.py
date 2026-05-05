from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from pydantic import BaseModel
from typing import List
from langchain.agents import create_agent

from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.prompts import CHEMICAL_SYSTEM_PROMPT

chemical_mcp = MultiServerMCPClient(
    {
        "chemical_checker": {
            "url": MCP_URLS["chemical_checker"],
            "transport": "streamable_http",
        }
    }
)

llm = ChatAnthropic(model=CLAUDE_MODEL)

_chemical_agent_graph = None


async def _get_chemical_agent():
    global _chemical_agent_graph
    if _chemical_agent_graph is None:
        tools = await chemical_mcp.get_tools()
        _chemical_agent_graph = create_agent(
            name="chemical_agent",
            model=llm,
            tools=tools,
            system_prompt=CHEMICAL_SYSTEM_PROMPT,
            checkpointer=True,
        )
    return _chemical_agent_graph


class ChemicalInput(BaseModel):
    query: str                  # e.g., "Is Monocrotophos safe to use on my cotton crop?"
    chemicals: List[str]        # e.g., ["Monocrotophos", "Chlorpyrifos", "Endosulfan"]
    crop: str                   # e.g., "Cotton"
    state: str                  # e.g., "Telangana"


@tool(args_schema=ChemicalInput)
async def chemical_checker(
    query: str,
    chemicals: List[str],
    crop: str,
    state: str,
    config: RunnableConfig,
) -> str:
    """
    Query the chemical ban status agent.
    Use when the user mentions pesticides, herbicides, fertilizers, or any agrochemical by name.
    Always extract all chemical names mentioned by the user and pass them as a list.
    Pass the crop and state for context-aware advice.
    """
    context = f"""
    State    : {state}
    Crop     : {crop}
    Chemicals: {', '.join(chemicals)}

    Query: {query}
    """.strip()

    agent = await _get_chemical_agent()
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=context)]},
        config=config,
    )
    return result["messages"][-1].content