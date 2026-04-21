import os
import logging
from typing import Dict, Any
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("MarketAgent")

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")

mcp_client = MultiServerMCPClient({
    "enam_server": {
        "url": f"http://100.100.108.44:9002/sse",
        "transport": "sse"
    },
    "agmarknet_server": {
        "url": f"http://100.100.108.44:9006/sse",
        "transport": "sse"
    }
})

async def run_market_agent(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Receives state from the Master Orchestrator, dynamically fetches Market MCP tools
    from remote Docker servers, runs a ReAct agent, and returns the final answer.
    """
    query = state.get("query", "")
    logger.info(f"Received query: '{query}'")
    logger.info(f"Connecting to remote MCP Servers at {REMOTE_IP} (Ports 9002 & 9006)...")
    
    try:
        tools = await mcp_client.get_tools()
        tool_names = [t.name for t in tools]
        logger.info(f"Successfully loaded {len(tools)} tools: {tool_names}")
    except Exception as e:
        logger.error(f"FATAL: Failed to connect to MCP servers at {REMOTE_IP}. Error: {e}")
        return {"final_answer": "System Error: Market data servers are currently unreachable. Please check the remote connection."}
    
    sys_msg = (
        "You are an expert agricultural market assistant for AjraSakha. "
        "Your job is to provide accurate commodity prices, arrivals, and mandi data.\n\n"
        "*** CRITICAL DATA FETCHING WORKFLOW ***\n"
        "1. PRIMARY SOURCE (Agmarknet): You MUST always try to fetch data using the Agmarknet tools FIRST.\n"
        "2. FALLBACK SOURCE (eNAM): IF AND ONLY IF Agmarknet tools return no data, fail, or lack the specific mandi/commodity, you should fallback to using eNAM tools.\n\n"
        "IMPORTANT: Before fetching trade data, use the relevant tools to resolve the State Name to a State ID, and the APMC/Mandi Name "
        "to an APMC ID. Never hallucinate prices or IDs."
    )
    
    agent = create_react_agent(
        model=llm,
        tools=tools,
        state_modifier=sys_msg
    )
    
    logger.info("Executing ReAct agent logic with Primary/Fallback routing...")
    try:
        response = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
        final_message = response["messages"][-1].content
        
        logger.info("Successfully generated market data using MCP Tools.")
        return {"final_answer": final_message}
        
    except Exception as e:
        logger.error(f"Agent execution failed during LLM/Tool invocation: {e}")
        return {"final_answer": "Error: Failed to process the market query with the provided tools."}