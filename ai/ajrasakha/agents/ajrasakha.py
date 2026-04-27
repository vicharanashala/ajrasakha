import json
from typing import Annotated

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from typing_extensions import TypedDict

from ajrasakha.agents.config import CLAUDE_MODEL
from ajrasakha.agents.gdb_agent import run_gdb_agent
from ajrasakha.agents.weather_agent import run_weather_agent
from ajrasakha.agents.soil_agent import run_soil_agent
from ajrasakha.agents.market_agent import run_market_agent

load_dotenv()

SYSTEM_PROMPT = """You are AjraSakha, an AI assistant for Indian farmers.

TOOLS:
- Use gdb_tool for any question about crops, diseases, pests, fertilizers, cultivation, or government schemes. Pass the farmer's exact query as-is — do not paraphrase or rewrite it.
- Use weather_tool for weather, rain, or forecast questions.
- Use soil_tool for fertilizer dosage or soil health questions with N, P, K, OC values.
- Use market_tool for crop prices, mandi rates, or market information.
- You may call multiple tools in parallel if the query needs more than one.

RESPONSE RULES:
- Write in plain text only. No markdown. No **, no ##, no bullet dashes, no headers.
- Use simple numbered lists if listing items (1. 2. 3.).
- Keep language simple and practical. Write like you are talking to a farmer directly.
- Reply in the same language the farmer used. If they wrote in Hindi, reply in Hindi. If English, reply in English.

SOURCES (mandatory for every gdb_tool response):
After the answer, always include a sources section. Use this exact format:

Source Information:
Answered by: <authors list from the tool result>
Source: <source_name from each source, or "Not available" if missing>
Link: <source URL from each source, or "Not available" if missing>
Page: <page number if available>

If there are multiple sources, list each one numbered. Never skip this section when gdb_tool was used.

- Always end every response with this disclaimer on a new line:

---
Note: AjraSakha is in testing. Advisories cover selected crops and states. Confirm with your local KVK or agricultural officer before applying. Weather from IMD. Market prices from Agmarknet, eNAM, and state APMC portals.
"""


@tool
async def gdb_tool(query: str) -> str:
    """Search the agricultural knowledge base for answers about crop diseases, pests, fertilizers, crop management, and government schemes."""
    result = await run_gdb_agent({"query": query, "entities": {}})
    answer = result.get("final_answer", "")
    if hasattr(answer, "model_dump"):
        data = answer.model_dump()
        if data.get("found_exact_question"):
            data["instruction"] = "EXACT MATCH FOUND: paste answer_text directly to the farmer without any modification."
        else:
            data["instruction"] = "No exact match. Synthesize a farmer-friendly answer from answer_text."
        return json.dumps(data, indent=2)
    return str(answer)


@tool
async def weather_tool(query: str) -> str:
    """Get real-time weather data, forecasts, and farming advisories for a location."""
    result = await run_weather_agent({"query": query})
    return result.get("final_answer", "")


@tool
async def soil_tool(query: str) -> str:
    """Get fertilizer dosage recommendations based on soil health data (N, P, K, OC values)."""
    result = await run_soil_agent({"query": query})
    return result.get("final_answer", "")


@tool
async def market_tool(query: str) -> str:
    """Get crop market prices from Agmarknet and eNAM for any mandi or APMC."""
    result = await run_market_agent({"query": query})
    return result.get("final_answer", "")


class AjraSakhaState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


TOOLS = [gdb_tool, weather_tool, soil_tool, market_tool]

llm = ChatAnthropic(model=CLAUDE_MODEL).bind_tools(TOOLS)


async def ajrasakha_node(state: AjraSakhaState) -> dict:
    messages = [SystemMessage(content=SYSTEM_PROMPT)] + list(state["messages"])
    response = await llm.ainvoke(messages)
    return {"messages": [response]}


builder = StateGraph(AjraSakhaState)
builder.add_node("ajrasakha", ajrasakha_node)
builder.add_node("tools", ToolNode(TOOLS))

builder.add_edge(START, "ajrasakha")
builder.add_conditional_edges("ajrasakha", tools_condition)
builder.add_edge("tools", "ajrasakha")

graph = builder.compile()
