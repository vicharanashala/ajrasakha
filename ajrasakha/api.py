import asyncio
import json
import httpx
from typing import Optional, List
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="OpenAI-compatible API")

class Message(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "mock-gpt-model"
    messages: List[Message]
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.1
    stream: Optional[bool] = False

OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"

async def forward_ollama_stream(messages: List[Message], model: str, max_tokens: int, temperature: float):
    payload = {
        "model": model,
        "messages": [{"role": m.role, "content": m.content} for m in messages],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", OLLAMA_API_URL, json=payload) as resp:
            async for line in resp.aiter_lines():
                if line:
                    # Ollama might send JSON lines, forward them as NDJSON
                    
                    # Simple response tweak
                    data = json.loads(line)
                    data['message']['content'] = data['message']['content'] + " TWEAK"
                    new_line = json.dumps(data)
                    yield f"{new_line}\n"

@app.post("/api/chat/")
async def chat_completions(request: ChatCompletionRequest):
    if not request.messages:
        return {"error": "No messages provided"}

    if request.stream:
        return StreamingResponse(
            forward_ollama_stream(
                messages=request.messages,
                model="qwen3:1.7b",
                max_tokens=request.max_tokens,
                temperature=request.temperature
            ),
            media_type="application/x-ndjson"
        )
    else:
        async with httpx.AsyncClient(timeout=None) as client:
            payload = {
                "model": request.model,
                "messages": [{"role": m.role, "content": m.content} for m in request.messages],
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
                "stream": False
            }
            resp = await client.post(OLLAMA_API_URL, json=payload)
            return resp.json()
