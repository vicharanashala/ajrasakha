import json
from typing import List, Any

from langgraph.graph.state import CompiledStateGraph

from .graph import stream_graph_events, make_chunk
from ..models import Message
from langchain_core.messages import HumanMessage, AIMessage

async def streaming_api_response(graph, initial_state):
    async for chunk in stream_graph_events(graph, initial_state):
        yield f"data: {json.dumps(chunk)}\n\n"

    # Create a final empty AIMessage chunk for the stop signal
    from langchain_core.messages import AIMessageChunk
    final_chunk = AIMessageChunk(content="")
    yield f"data: {json.dumps(make_chunk(final_chunk, finish_reason='stop'))}\n\n"
    yield "data: [DONE]\n\n"


# Request Models

def convert_to_langchain(messages: List[Message]):
    langchain_messages = []
    for message in messages:
        if message.role == "user":
            langchain_messages.append(HumanMessage(content=message.content))
        elif message.role == "assistant":
            langchain_messages.append(AIMessage(content=message.content))
        else:
            langchain_messages.append(HumanMessage(content=message.content))
    return langchain_messages


async def agent_response(messages: List[Message], graph: CompiledStateGraph[Any, Any, Any, Any]):
    langchain_messages = convert_to_langchain(messages)
    initial_state = {
        "messages": langchain_messages,
        "latitude": None,
        "longitude": None,
    }
    async for chunk in streaming_api_response(graph, initial_state):
        yield chunk

