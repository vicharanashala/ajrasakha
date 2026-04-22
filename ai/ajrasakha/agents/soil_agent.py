import os
import logging
from typing import Dict, Any
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SoilAgent")

REMOTE_IP = "100.100.108.43"

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")

mcp_client = MultiServerMCPClient({
    "soil_server": {
        "url": f"http://{REMOTE_IP}:9008/mcp",
        "transport": "http"
    }
})

async def run_soil_agent(state: Dict[str, Any]) -> Dict[str, Any]:
    query = state.get("query", "")
    logger.info(f"Received query: '{query}'")
    logger.info(f"Connecting to remote Soil MCP Server at {REMOTE_IP}:9008...")
    
    try:
        tools = await mcp_client.get_tools()
        tool_names = [t.name for t in tools]
        logger.info(f"Successfully loaded {len(tools)} tools: {tool_names}")
    except Exception as e:
        logger.error(f"FATAL: Failed to connect to Soil MCP server at {REMOTE_IP}:9008. Error: {e}")
        return {"final_answer": "System Error: Soil Health data server is currently unreachable. Please check the remote connection."}
    
    sys_msg = (
        "You are an expert agricultural soil health assistant for AjraSakha. "
        "Your job is to provide accurate fertilizer dosage recommendations based on soil test results (N, P, K, OC). "
        "ALWAYS use the provided MCP tools. Never hallucinate IDs or values.\n\n"
        "*** CRITICAL WORKFLOW (YOU MUST FOLLOW THIS EXACT ORDER) ***\n"
        "1. STATE: Call 'get_states' to resolve the state name to a 24-character hex state_id.\n"
        "2. DISTRICT: Call 'get_districts' using the state_id to resolve the district_id.\n"
        "3. CROP: Call 'get_crops' using the state_id to resolve the crop_id.\n"
        "4. DOSAGE: Call 'get_fertilizer_dosage' using the resolved state_id, district_id, crop_id, along with the N (Nitrogen), P (Phosphorus), K (Potassium), and OC (Organic Carbon) values from the user's query.\n\n"
        "Format the final recommendation clearly for a farmer to understand."
    )
    
    agent = create_react_agent(
        model=llm,
        tools=tools,
        state_modifier=sys_msg
    )
    
    logger.info("Executing ReAct agent logic for Soil Health...")
    try:
        response = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
        final_message = response["messages"][-1].content
        
        logger.info("Successfully generated Soil recommendation using MCP Tools.")
        return {"final_answer": final_message}
        
    except Exception as e:
        logger.error(f"Agent execution failed during LLM/Tool invocation: {e}")
        return {"final_answer": "Error: Failed to process the soil health query with the provided tools."}