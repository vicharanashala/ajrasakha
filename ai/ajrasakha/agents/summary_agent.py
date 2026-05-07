from typing import Annotated

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from ajrasakha.agents.config import CLAUDE_MODEL


class SummaryState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    summary: str


SUMMARY_SYSTEM_PROMPT = """
You are a summarization assistant for an agricultural support system.
Given a farmer conversation thread, produce a concise summary in about 100 words.
Focus on:
- Farmer profile and context (crop, location, season if available)
- Current status/problem and what has already been tried
- Recommended actions or decisions already provided
- Pending questions or unresolved follow-ups

Keep it factual, compact, and easy for another assistant to continue from.
Do not include markdown formatting.
""".strip()


async def summarize_node(state: SummaryState) -> dict:
    llm = ChatAnthropic(model=CLAUDE_MODEL)
    thread_messages = list(state.get("messages", []))
    rendered_messages: list[str] = []
    for message in thread_messages:
        role = getattr(message, "type", message.__class__.__name__)
        content = getattr(message, "content", "")
        rendered_messages.append(f"{role}: {content}")
    thread_text = "\n".join(rendered_messages).strip()

    response = await llm.ainvoke(
        [
            SystemMessage(content=SUMMARY_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    "Summarize the following thread in approximately 100 words:\n\n"
                    f"{thread_text}"
                )
            ),
        ]
    )

    content = response.content if isinstance(response, AIMessage) else str(response)
    return {"summary": str(content).strip()}


builder = StateGraph(SummaryState)
builder.add_node("summarize", summarize_node)
builder.add_edge(START, "summarize")
builder.add_edge("summarize", END)

graph = builder.compile()
