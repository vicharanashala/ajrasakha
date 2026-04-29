from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.constants import START
from langgraph.graph import StateGraph
from pydantic import BaseModel

from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.prompts import GDB_SYSTEM_PROMPT


gdb_mcp = MultiServerMCPClient(
    {
        "gdb": {
            "url": MCP_URLS["gdb"],
            "transport": "streamable_http",
        }
    }
)

llm = ChatAnthropic(model=CLAUDE_MODEL)

_gdb_agent_graph = None  # lazy init

async def _get_gdb_agent():
    global _gdb_agent_graph
    if _gdb_agent_graph is None:
        tools = await gdb_mcp.get_tools()
        _gdb_agent_graph = create_agent(
            name="gdb_agent",
            model=llm,
            tools=tools,
            system_prompt=GDB_SYSTEM_PROMPT,
            checkpointer=True,
        )
    return _gdb_agent_graph


class GDBInput(BaseModel):
    query: str
    latitude: float
    longitude: float
    address: str

@tool(args_schema=GDBInput)
async def gdb(query: str, latitude: float, longitude: float, address: str, config: RunnableConfig) -> str:
    """
    Query the golden database agent.
    Use when the task needs location-aware data lookup.
    Always pass the user's latitude, longitude, address, and a focused query.
    """
    context = f"""
Location Context:
- Address  : {address}
- Latitude : {latitude}
- Longitude: {longitude}

Query: {query}
    """.strip()

    agent = await _get_gdb_agent()
    result = await agent.ainvoke(
        {"messages": [
            HumanMessage(content=context)
        ]},
        config=config
    )
    return result["messages"][-1].content