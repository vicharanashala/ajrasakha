import time
import uuid
from typing import Any

from langgraph.graph.state import CompiledStateGraph


async def filter_events(event_stream):
    event_types_to_keep = {"on_chat_model_start", "on_chat_model_stream", 'on_custom_event'}
    async for event in event_stream:
        if not event_types_to_keep or event.get("event") in event_types_to_keep:
            yield {
                "event": event["event"],
                "data": event.get("data"),
            }

def make_chunk(ai_message_chunk, finish_reason=None):
    """
    Create a chunk from AIMessage, automatically detecting reasoning content

    Args:
        ai_message_chunk: AIMessage chunk from LangChain
        finish_reason: Optional finish reason for final chunk
    """
    delta = {}
    chunk_id = f"chatcmpl-{uuid.uuid4().hex}"
    created = int(time.time())
    model = "openai/gpt-oss-120b"

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

async def stream_graph_events(graph: CompiledStateGraph[Any, Any, Any, Any], initial_state: Any):
    async for event in filter_events(
            graph.astream_events(initial_state, version="v2")
    ):
        if event.get("event") == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            yield make_chunk(chunk)

