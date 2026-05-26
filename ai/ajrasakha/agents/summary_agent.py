from typing import Annotated, Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class SummaryState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    summary: str


class SummaryOutputState(TypedDict):
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


def _render_message(message: Any) -> str:
    if isinstance(message, BaseMessage):
        role = message.type
        content = message.content
        return f"{role}: {content}"

    if isinstance(message, dict):
        role = str(message.get("role", "user")).strip()
        content = message.get("content", "")
        return f"{role}: {content}"

    return f"user: {message}"


async def summarize_history(state: SummaryState) -> dict:
    from ajrasakha.agents.config import SANITIZER_MODEL
    llm = ChatAnthropic(model=SANITIZER_MODEL)
    thread_messages = list(state.get("messages", []))
    rendered_messages: list[str] = []

    for message in thread_messages:
        rendered_messages.append(_render_message(message))

    thread_text = "\n".join(rendered_messages).strip()
    if not thread_text:
        return {"summary": "No prior conversation available to summarize."}

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

    if isinstance(response, AIMessage):
        content = response.content
        if isinstance(content, str):
            summary = content.strip()
        elif isinstance(content, list):
            summary = " ".join(
                part.get("text", str(part)) if isinstance(part, dict) else str(part)
                for part in content
            ).strip()
        else:
            summary = str(content).strip()
    else:
        summary = str(response).strip()

    # Some hosted runtimes can occasionally surface empty/list-like payloads.
    # Keep output contract stable by ensuring a real text summary is always returned.
    if summary in {"", "[]", "None", "null"}:
        words = thread_text.split()
        trimmed = " ".join(words[:110]).strip()
        summary = (
            "Farmer conversation context: "
            + trimmed
        )

    return {"summary": summary}


builder = StateGraph(SummaryState, output=SummaryOutputState)
builder.add_node("summarize", summarize_history)
builder.add_edge(START, "summarize")
builder.add_edge("summarize", END)

graph = builder.compile()
