import os
import logging
from typing import Dict, Any
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("GDBAgent")

REMOTE_IP = "100.100.108.44"

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")

mcp_client = MultiServerMCPClient({
    "golden_db": {
        "url": f"http://{REMOTE_IP}:9005/mcp",
        "transport": "http"
    }
})

async def run_gdb_agent(state: Dict[str, Any]) -> Dict[str, Any]:
    query = state.get("query", "")
    logger.info(f"Received query: '{query}'")
    logger.info(f"Connecting to remote GDB MCP Server at {REMOTE_IP}:9005/mcp...")
    
    try:
        tools = await mcp_client.get_tools()
        tool_names = [t.name for t in tools]
        logger.info(f"Successfully loaded {len(tools)} tools: {tool_names}")
    except Exception as e:
        logger.error(f"FATAL: Failed to connect to GDB MCP server at {REMOTE_IP}. Error: {e}")
        return {"final_answer": "System Error: Golden DB server is currently unreachable. Please check if Port 9005 is active."}
    
    sys_msg = (
        "You are an expert agricultural assistant for AjraSakha. "
        "Your job is to answer farming and crop disease queries. "
        "ALWAYS use the provided MCP tools (like golden_retriever_tool) to search "
        "the database before answering. Do not hallucinate or guess the answer."
    )
    
    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=sys_msg
    )
    
    logger.info("Executing ReAct agent logic for GDB...")
    try:
        response = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
        final_message = response["messages"][-1].content
        
        logger.info("Successfully generated GDB data using MCP Tools.")
        return {"final_answer": final_message}
        
    except Exception as e:
        logger.error(f"Agent execution failed during LLM/Tool invocation: {e}")
        return {"final_answer": "Error: Failed to process the GDB query with the provided tools."}