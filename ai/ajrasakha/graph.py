from typing import TypedDict, Optional, List
import json

from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, ReasoningContentBlock
from langchain_core.prompts import ChatPromptTemplate

from langgraph.graph import StateGraph
from typing import TypedDict, List
from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    messages: List[BaseMessage]
    latitude: Optional[float]
    longitude: Optional[float]


llm = ChatOpenAI(
    model='Qwen/Qwen3-1.7B',
    temperature=0,
    streaming=True,
    api_key='fdsfa',
    base_url='http://100.100.108.27:8012/v1'
)


def chatbot_node(state: AgentState):
    messages = state["messages"]
    response = llm.invoke(messages)

    messages = {
        "messages": messages + [response]
    }
    print(messages, flush=True)
    return messages


builder = StateGraph(AgentState)
builder.add_node("chatbot", chatbot_node)
builder.set_entry_point("chatbot")
builder.set_finish_point("chatbot")

app= builder.compile()
