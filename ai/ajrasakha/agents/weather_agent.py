from typing import Dict, Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient

from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS

mcp_client = MultiServerMCPClient({
    "weather_server": {"url": MCP_URLS["weather"], "transport": "http"},
})


async def run_weather_agent(state: Dict[str, Any]) -> Dict[str, Any]:
    query = state.get("query", "")
    tools = await mcp_client.get_tools()
    llm = ChatAnthropic(model=CLAUDE_MODEL).bind_tools(tools)
    response = await llm.ainvoke([HumanMessage(content=query)])
    return {"final_answer": response.content}
