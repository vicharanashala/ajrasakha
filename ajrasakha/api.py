import asyncio
from collections.abc import AsyncGenerator
import json
import httpx
from typing import Optional, List, Union
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from models import ChatCompletionRequest, Message, ThinkingResponseChunk, ContentResponseChunk

app = FastAPI(title="OpenAI-compatible API")


OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"


async def generate_response(request: ChatCompletionRequest):
    yield ThinkingResponseChunk("Processing your request... \n")
    for message in request.messages:
        yield ThinkingResponseChunk(f"Received message from {message.role}: {message.content}\n")
    yield ContentResponseChunk("Here is the response from the assistant.\n", final_chunk=True)
        

@app.post("/api/chat/")
async def chat_completions(request: ChatCompletionRequest):
    title_prompt_present = False
    
    for message in request.messages:
        if "Provide a concise, 5-word-or-less title for the conversation, using title case conventions. Only return the title itself." in message.content:
            title_prompt_present = True
            break
    
    if not request.messages:
        return {"error": "No messages provided"}

    if request.stream:
        return StreamingResponse(
            generate_response(request),
            media_type="application/x-ndjson"
        )
    else:
        async with httpx.AsyncClient(timeout=None) as client:
            payload = {
                "model": request.model,
                "messages": [{"role": m.role, "content": m.content} for m in request.messages],
                "stream": False
            }
            resp = await client.post(OLLAMA_API_URL, json=payload)
            return resp.json()
