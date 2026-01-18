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


# Request Models
class Message(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class FunctionDefinition(BaseModel):
    name: str
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


class Tool(BaseModel):
    type: Literal["function"]
    function: FunctionDefinition


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[Message]
    tools: Optional[List[Tool]] = None
    tool_choice: Optional[Union[str, Dict[str, Any]]] = None
    temperature: Optional[float] = 1.0
    max_tokens: Optional[int] = None
    stream: Optional[bool] = False
    thinking: Optional[Dict[str, Any]] = None  # Extended thinking support


# Response Models
class ToolCall(BaseModel):
    id: str
    type: Literal["function"]
    function: Dict[str, Any]


class ThinkingBlock(BaseModel):
    type: Literal["thinking"]
    thinking: str


class Choice(BaseModel):
    index: int
    message: Message
    finish_reason: Optional[str] = None
    thinking: Optional[str] = None  # For thinking content


class Usage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Choice]
    usage: Usage


# Predefined responses database
PREDEFINED_RESPONSES = {
    "weather": {
        "thinking": "The user is asking about weather. I should use the get_weather tool to fetch this information.",
        "tool_calls": [
            {
                "id": "call_abc123",
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "arguments": json.dumps({"location": "San Francisco", "unit": "celsius"})
                }
            }
        ]
    },
    "calculate": {
        "thinking": "This requires mathematical calculation. I'll use the calculator tool.",
        "tool_calls": [
            {
                "id": "call_calc456",
                "type": "function",
                "function": {
                    "name": "calculate",
                    "arguments": json.dumps({"expression": "2 + 2"})
                }
            }
        ]
    },
    "default": {
        "thinking": "Let me process this request and formulate a helpful response.",
        "content": "I'm a mock API. I can help you with weather queries, calculations, or general conversation!"
    }
}


def detect_intent(messages: List[Message]) -> str:
    """Simple intent detection based on message content"""
    last_user_message = next((m for m in reversed(messages) if m.role == "user"), None)
    if not last_user_message or not last_user_message.content:
        return "default"

    content_lower = last_user_message.content.lower()
    if "weather" in content_lower:
        return "weather"
    elif any(word in content_lower for word in ["calculate", "math", "compute"]):
        return "calculate"
    return "default"


def create_streaming_response(response_data: Dict[str, Any], include_thinking: bool = False):
    """Generate SSE streaming response"""

    async def generate():
        chunk_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"

        # Stream thinking if requested
        if include_thinking and "thinking" in response_data:
            thinking_chunk = {
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": response_data.get("model", "gpt-4"),
                "choices": [{
                    "index": 0,
                    "delta": {"role": "assistant", "thinking": response_data["thinking"]},
                    "finish_reason": None
                }]
            }
            yield f"data: {json.dumps(thinking_chunk)}\n\n"
            await asyncio.sleep(0.1)

        # Stream tool calls or content
        if "tool_calls" in response_data:
            for tool_call in response_data["tool_calls"]:
                tool_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": response_data.get("model", "gpt-4"),
                    "choices": [{
                        "index": 0,
                        "delta": {"tool_calls": [tool_call]},
                        "finish_reason": None
                    }]
                }
                yield f"data: {json.dumps(tool_chunk)}\n\n"

        if "content" in response_data:
            # Stream content in chunks
            content = response_data["content"]
            for i in range(0, len(content), 10):
                chunk = content[i:i + 10]
                content_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": response_data.get("model", "gpt-4"),
                    "choices": [{
                        "index": 0,
                        "delta": {"content": chunk},
                        "finish_reason": None
                    }]
                }
                yield f"data: {json.dumps(content_chunk)}\n\n"
                await asyncio.sleep(0.05)

        # Final chunk
        final_chunk = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": response_data.get("model", "gpt-4"),
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": "stop" if "content" in response_data else "tool_calls"
            }]
        }
        yield f"data: {json.dumps(final_chunk)}\n\n"
        yield "data: [DONE]\n\n"

    return generate()


@app.post("/v1/chat/completions")
@app.post("/chat/completions")  # LibreChat uses this path
async def chat_completions(request: ChatCompletionRequest):
    """Main chat completions endpoint"""

    # Detect intent and get predefined response
    intent = detect_intent(request.messages)
    response_template = PREDEFINED_RESPONSES.get(intent, PREDEFINED_RESPONSES["default"])

    # Build response data
    response_data = {
        "model": request.model,
        **response_template
    }

    # Handle streaming
    if request.stream:
        import asyncio
        include_thinking = request.thinking is not None and request.thinking.get("type") == "enabled"
        return StreamingResponse(
            create_streaming_response(response_data, include_thinking),
            media_type="text/event-stream"
        )

    # Non-streaming response
    message_dict = {"role": "assistant"}

    if "tool_calls" in response_data:
        message_dict["tool_calls"] = response_data["tool_calls"]
        message_dict["content"] = None
        finish_reason = "tool_calls"
    else:
        message_dict["content"] = response_data.get("content", "")
        finish_reason = "stop"

    choice = Choice(
        index=0,
        message=Message(**message_dict),
        finish_reason=finish_reason,
        thinking=response_data.get("thinking") if request.thinking else None
    )

    return ChatCompletionResponse(
        id=f"chatcmpl-{uuid.uuid4().hex}",
        created=int(time.time()),
        model=request.model,
        choices=[choice],
        usage=Usage(
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150
        )
    )


@app.get("/v1/models")
async def list_models():
    """List available models"""
    return {
        "object": "list",
        "data": [
            {
                "id": "openai/gpt-oss-120b",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "openai"
            }
        ]
    }


@app.get("/v1/models/{model_id}")
async def get_model(model_id: str):
    """Get specific model details"""
    return {
        "id": model_id,
        "object": "model",
        "created": int(time.time()),
        "owned_by": "openai"
    }


@app.get("/openai/v1/assistants")
async def list_assistants(limit: int = 100, order: str = "desc"):
    """LibreChat checks for assistants - return empty list"""
    return {
        "object": "list",
        "data": [],
        "first_id": None,
        "last_id": None,
        "has_more": False
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)