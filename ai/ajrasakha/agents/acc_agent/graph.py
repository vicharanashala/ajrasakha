import os
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from ajrasakha.agents.acc_agent.state import AccAgentState
from ajrasakha.agents.acc_agent.nodes import extract_node, planner_node, tool_execution_node, assembler_node

def should_interrupt(state: AccAgentState) -> bool:
    """Always interrupt after extract for human verification."""
    return True

def build_graph():
    builder = StateGraph(AccAgentState)
    
    builder.add_node("extract", extract_node)
    builder.add_node("planner", planner_node)
    builder.add_node("tool_execution", tool_execution_node)
    builder.add_node("assembler", assembler_node)
    
    builder.add_edge(START, "extract")
    
    # Add conditional edge from extract that checks verified_by_human
    # If not verified, go to a pause state (but we handle this via interrupt_after)
    # If verified, continue to planner
    def route_after_extract(state: AccAgentState):
        if not state.get("verified_by_human"):
            # This will trigger interrupt in production
            return "__interrupt__"
        return "planner"
    
    builder.add_conditional_edges(
        "extract",
        route_after_extract,
        {
            "planner": "planner",
            "__interrupt__": END  # This creates the HITL pause point
        }
    )
    
    builder.add_edge("planner", "tool_execution")
    builder.add_edge("tool_execution", "assembler")
    builder.add_edge("assembler", END)
    
    # Use MemorySaver for local development only
    checkpointer = MemorySaver()
    graph = builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["planner"]  # Interrupt before planner to allow human verification
    )
    
    return graph

acc_graph = build_graph()
