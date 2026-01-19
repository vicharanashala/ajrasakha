from typing import TypedDict, Optional, List

from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.callbacks.manager import (
            adispatch_custom_event,
        )

from langchain_qwq import ChatQwen

class AgentState(TypedDict):
    messages: List[BaseMessage]
    latitude: Optional[float]
    longitude: Optional[float]


llm = ChatQwen(
    model="Qwen/Qwen3-30B-A3B",
    temperature=0,
    streaming=True,
    api_key="fdsfa",
    base_url="http://100.100.108.100:8081/v1",
)


async def chatbot_node(state: AgentState, config: RunnableConfig):
    messages = state["messages"]
    user_msg = messages[-1].content

    await adispatch_custom_event(
        name='ajrasakha',
        data={"info": "custom event data"},
        config=config,
    )
    response = await llm.ainvoke(user_msg)

    return {
        "messages": messages + [response]
    }


builder = StateGraph(AgentState)
builder.add_node("chatbot", chatbot_node)
builder.set_entry_point("chatbot")
builder.set_finish_point("chatbot")

graph = builder.compile()


import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal, Union
import json
import time
import uuid
import asyncio
from datetime import datetime

app = FastAPI(title="Chat Completions API Mock")
from fastapi import HTTPException
from starlette.responses import StreamingResponse
from typing import Literal, Dict, Any
from pydantic import BaseModel
import json
import time
import uuid
from langchain_core.messages import HumanMessage, AIMessage

initial_state = {
    "messages": [HumanMessage(content="Hi!")],
    "latitude": None,
    "longitude": None,
}

event_types_to_keep = {"on_chat_model_start", "on_chat_model_stream", 'on_custom_event'}


async def filter_events(event_stream):
    async for event in event_stream:
        if not event_types_to_keep or event.get("event") in event_types_to_keep:
            yield {
                "event": event["event"],
                "data": event.get("data"),
            }


chunk_id = f"chatcmpl-{uuid.uuid4().hex}"
created = int(time.time())
model = "openai/gpt-oss-120b"


def make_chunk(ai_message_chunk, finish_reason=None):
    """
    Create a chunk from AIMessage, automatically detecting reasoning content

    Args:
        ai_message_chunk: AIMessage chunk from LangChain
        finish_reason: Optional finish reason for final chunk
    """
    delta = {}

    # Check for reasoning content in additional_kwargs
    reasoning_content = ai_message_chunk.additional_kwargs.get("reasoning_content")

    if reasoning_content is not None and ai_message_chunk.content == '':
        # This is a reasoning chunk
        delta = {"reasoning_content": reasoning_content}
    else:
        # This is a content chunk
        delta = {"content": ai_message_chunk.content}

    return {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{
            "index": 0,
            "delta": delta,
            "logprobs": None,
            "finish_reason": finish_reason
        }]
    }


async def stream_graph_events(graph, initial_state):
    async for event in filter_events(
            graph.astream_events(initial_state, version="v2")
    ):
        if event.get("event") == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            yield make_chunk(chunk)


async def streaming_api_response(graph, initial_state):
    async for chunk in stream_graph_events(graph, initial_state):
        yield f"data: {json.dumps(chunk)}\n\n"

    # Create a final empty AIMessage chunk for the stop signal
    from langchain_core.messages import AIMessageChunk
    final_chunk = AIMessageChunk(content="")
    yield f"data: {json.dumps(make_chunk(final_chunk, finish_reason='stop'))}\n\n"
    yield "data: [DONE]\n\n"


# Request Models
class Message(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[Message]
    temperature: Optional[float] = 1.0
    max_tokens: Optional[int] = None
    stream: Optional[bool] = False
    thinking: Optional[Dict[str, Any]] = None  # Extended thinking support


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


async def agent_response(messages: List[Message]):
    langchain_messages = convert_to_langchain(messages)
    initial_state = {
        "messages": langchain_messages,
        "latitude": None,
        "longitude": None,
    }
    async for chunk in streaming_api_response(graph, initial_state):
        yield chunk


@app.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    if request.messages and request.stream:
        return StreamingResponse(
            agent_response(
                messages=request.messages,
            ), media_type="application/x-ndjson"
        )
    else:
        return HTTPException(status_code=400, detail="No messages provided")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

