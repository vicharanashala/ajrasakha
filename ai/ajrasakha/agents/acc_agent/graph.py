from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from ajrasakha.agents.acc_agent.state import AccAgentState
from ajrasakha.agents.acc_agent.nodes import extract_node, planner_node, tool_execution_node, assembler_node

def build_graph():
    builder = StateGraph(AccAgentState)
    
    # Add nodes
    builder.add_node("extract", extract_node)
    builder.add_node("planner", planner_node)
    builder.add_node("tool_execution", tool_execution_node)
    builder.add_node("assembler", assembler_node)
    
    # Add edges
    builder.add_edge(START, "extract")
    builder.add_edge("extract", "planner")
    builder.add_edge("planner", "tool_execution")
    builder.add_edge("tool_execution", "assembler")
    builder.add_edge("assembler", END)
    
    graph = builder.compile(
        interrupt_after=["extract"]
    )
    
    return graph

acc_graph = build_graph()
