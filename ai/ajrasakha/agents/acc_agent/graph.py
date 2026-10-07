from langgraph.graph import StateGraph, START, END

from ajrasakha.agents.acc_agent.state import AccAgentState
from ajrasakha.agents.acc_agent.nodes import extract_node, planner_node, tool_execution_node, assembler_node

# Fields that should be reset when a new transcript is submitted to ensure
# fresh tool results and answers. This prevents stale data from a previous
# query leaking into a new one.
_ACC_TOOL_RESULT_FIELDS = frozenset({
    "selected_tools",
    "gdb_response",
    "weather_response",
    "market_response",
    "schemes_response",
    "query_tool_responses",
    "final_answers",
    "final_answer",
})


def route_after_extraction(state: AccAgentState):
    """Farmer-only runs must never continue into answer-generation tools."""
    if state.get("extraction_type") == "farmer_details":
        return "end"
    return "planner"


def build_graph():
    builder = StateGraph(AccAgentState)
    
    # Add nodes
    builder.add_node("extract", extract_node)
    builder.add_node("planner", planner_node)
    builder.add_node("tool_execution", tool_execution_node)
    builder.add_node("assembler", assembler_node)
    
    # Add edges
    builder.add_edge(START, "extract")
    builder.add_conditional_edges(
        "extract",
        route_after_extraction,
        {
            "planner": "planner",
            "end": END,
        },
    )
    builder.add_edge("planner", "tool_execution")
    builder.add_edge("tool_execution", "assembler")
    builder.add_edge("assembler", END)
    
    graph = builder.compile(
        interrupt_after=["extract"]
    )
    
    return graph


def _create_fresh_graph():
    """Create a new graph instance with cleared state.
    
    Call this when starting a new transcript to ensure no stale tool
    results or query data bleeds through from a previous run.
    """
    return build_graph()


acc_graph = build_graph()
