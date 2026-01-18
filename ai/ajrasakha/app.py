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
    "greeting": {
        "thinking": "The user is greeting me. I should respond warmly and offer assistance.",
        "content": "Hello! How can I help you today?"
    },
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
    "code": {
        "thinking": "The user wants help with coding. Let me provide a helpful code example.",
        "content": "Sure! I can help you with coding. What programming language are you working with?"
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

    # Check for greetings
    if any(word in content_lower for word in ["hello", "hi", "hey", "greetings"]):
        return "greeting"

    # Check for weather
    if "weather" in content_lower:
        return "weather"

    # Check for calculations
    if any(word in content_lower for word in ["calculate", "math", "compute", "solve"]):
        return "calculate"

    # Check for coding
    if any(word in content_lower for word in ["code", "program", "function", "script", "debug"]):
        return "code"

    return "default"


def create_streaming_response(response_data: Dict[str, Any], include_thinking: bool = True):
    """Generate SSE streaming response in vLLM/Qwen format"""

    async def generate():
        chunk_id = f"chatcmpl-{uuid.uuid4().hex}"
        created = int(time.time())
        model = response_data.get("model", "openai/gpt-oss-120b")

        # First chunk with role and reasoning_content: null
        first_chunk = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {"role": "assistant", "content": "", "reasoning_content": None},
                "logprobs": None,
                "finish_reason": None
            }],
            "prompt_token_ids": None
        }
        yield f"data: {json.dumps(first_chunk)}\n\n"
        await asyncio.sleep(0.01)

        # Stream reasoning (thinking) if present
        if "thinking" in response_data:
            reasoning_text = response_data["thinking"]
            # Split by words for more natural streaming
            words = reasoning_text.split()
            for word in words:
                reasoning_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {"reasoning": word if word == words[0] else f" {word}",
                                  "reasoning_content": word if word == words[0] else f" {word}"},
                        "logprobs": None,
                        "finish_reason": None,
                        "token_ids": None
                    }]
                }
                yield f"data: {json.dumps(reasoning_chunk)}\n\n"
                await asyncio.sleep(0.02)

        # Stream content if present
        if "content" in response_data:
            content = response_data["content"]
            # First send newline separators (like vLLM does)
            separator_chunk = {
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": {"content": "\n\n", "reasoning_content": None},
                    "logprobs": None,
                    "finish_reason": None,
                    "token_ids": None
                }]
            }
            yield f"data: {json.dumps(separator_chunk)}\n\n"
            await asyncio.sleep(0.01)

            # Stream content by words
            words = content.split()
            for i, word in enumerate(words):
                content_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {"content": word if i == 0 else f" {word}", "reasoning_content": None},
                        "logprobs": None,
                        "finish_reason": None,
                        "token_ids": None
                    }]
                }
                yield f"data: {json.dumps(content_chunk)}\n\n"
                await asyncio.sleep(0.03)

        # Stream tool calls if present
        if "tool_calls" in response_data:
            for tool_call in response_data["tool_calls"]:
                tool_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {"tool_calls": [tool_call], "reasoning_content": None},
                        "logprobs": None,
                        "finish_reason": None,
                        "token_ids": None
                    }]
                }
                yield f"data: {json.dumps(tool_chunk)}\n\n"

        # Final chunk with finish_reason
        final_chunk = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {"content": "", "reasoning_content": None},
                "logprobs": None,
                "finish_reason": "stop" if "content" in response_data else "tool_calls",
                "stop_reason": None,
                "token_ids": None
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
        # ALWAYS include thinking, regardless of request parameter
        return StreamingResponse(
            create_streaming_response(response_data, include_thinking=True),
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
        thinking=response_data.get("thinking")  # ALWAYS include thinking
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