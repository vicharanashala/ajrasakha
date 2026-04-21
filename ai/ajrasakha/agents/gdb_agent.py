import os
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")

mcp_client = MultiServerMCPClient({
    "golden_db": {
        "url": "http://100.100.108.43:9005/sse",
        "transport": "sse"
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
    
    agent = create_react_agent(
        model=llm,
        tools=tools,
        state_modifier=sys_msg
    )
    
    response = await agent.ainvoke({"messages": [HumanMessage(content=query)]})
    
    final_message = response["messages"][-1].content
    print("[GDB Agent] Successfully generated answer using MCP Tool.")
    
    return {"final_answer": final_message}