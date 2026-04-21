import os
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

# Initialize Claude for the GDB Agent
llm = ChatAnthropic(model="claude-3-5-sonnet-20241022")

# Configure the MCP Client to connect to your FastMCP server
# We use MultiServerMCPClient which handles SSE connections smoothly
mcp_client = MultiServerMCPClient({
    "golden_db": {
        "url": "http://100.100.108.43:9005/sse" 
    }
})

async def run_gdb_agent(state):
    """
    Receives state from the Master Orchestrator, dynamically fetches MCP tools,
    runs a ReAct agent to search the Vector DB, and returns the final answer.
    """
    query = state.get("query")
    print(f"\n[GDB Agent] Received query: '{query}'")
    print("[GDB Agent] Connecting to Golden DB Vector Store (MCP)...")
    
    # 1. Fetch tools dynamically from the remote MCP server
    tools = await mcp_client.get_tools()
    print(f"[GDB Agent] Successfully loaded tools: {[t.name for t in tools]}")
    
    # 2. Define the exact persona and rules for this specific agent
    sys_msg = (
        "You are an expert agricultural assistant for AjraSakha. "
        "Your job is to answer farming and crop disease queries. "
        "ALWAYS use the provided MCP tools (like golden_retriever_tool) to search "
        "the database before answering. Do not hallucinate or guess the answer."
    )
    
    # 3. Create a ReAct agent that knows how to use the fetched tools
    agent = create_react_agent(
        model=llm,
        tools=tools,
        state_modifier=sys_msg
    )
    
    # 4. Invoke the agent with the user's query
    response = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
    
    # 5. Extract the final string message from the agent's response array
    final_message = response["messages"][-1].content
    print("[GDB Agent] Successfully generated answer using MCP Tool.")
    
    # 6. Return the final answer back to the Master State
    return {"final_answer": final_message}