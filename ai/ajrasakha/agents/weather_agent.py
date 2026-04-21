import os
import logging
from typing import Dict, Any
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("WeatherAgent")

REMOTE_IP = "100.100.108.44"

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")

mcp_client = MultiServerMCPClient({
    "weather_server": {
        "url": f"http://{REMOTE_IP}:9003/sse",
        "transport": "sse"
    }
})

async def run_weather_agent(state: Dict[str, Any]) -> Dict[str, Any]:
    query = state.get("query", "")
    logger.info(f"Received query: '{query}'")
    logger.info(f"Connecting to remote Weather MCP Server at {REMOTE_IP}:9003...")
    
    try:
        tools = await mcp_client.get_tools()
        tool_names = [t.name for t in tools]
        logger.info(f"Successfully loaded {len(tools)} tools: {tool_names}")
    except Exception as e:
        logger.error(f"FATAL: Failed to connect to Weather MCP server at {REMOTE_IP}:9003. Error: {e}")
        return {"final_answer": "System Error: Weather data server is currently unreachable. Please check the remote connection."}
    
    sys_msg = (
        "You are an expert agricultural weather assistant for AjraSakha. "
        "Your job is to provide accurate weather forecasts, rainfall predictions, and IMD alerts for farmers. "
        "ALWAYS use the provided weather MCP tools to fetch real-time data before answering. "
        "Never hallucinate weather data. If the user asks for a specific district or state, use the tools to find the exact forecast for that location."
    )
    
    agent = create_react_agent(
        model=llm,
        tools=tools,
        state_modifier=sys_msg
    )
    
    logger.info("Executing ReAct agent logic for Weather...")
    try:
        response = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
        final_message = response["messages"][-1].content
        
        logger.info("Successfully generated weather data using MCP Tools.")
        return {"final_answer": final_message}
        
    except Exception as e:
        logger.error(f"Agent execution failed during LLM/Tool invocation: {e}")
        return {"final_answer": "Error: Failed to process the weather query with the provided tools."}