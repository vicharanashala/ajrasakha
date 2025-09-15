import json
from typing import AsyncIterable, AsyncIterator, List, TypeVar

import httpx
from models import ContentResponseChunk, Message, ThinkingResponseChunk


OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"

T = TypeVar("T")



async def stream_string(string:str, thinking=False):
    for chunk in string.split(" "):
        if(thinking):
            yield ThinkingResponseChunk(chunk+" ")
        else:
            yield ContentResponseChunk(chunk+" ")
            
        
async def achain(*gens: AsyncIterable[T]) -> AsyncIterator[T]:
    '''
    Chain multiple async generators into a single async generator.
    Example: StreamingResponse(
            achain(stream_string("This is a test of the emergency broadcast system. This is only a test.", thinking=True), stream_string("This is the actual response from the assistant.", thinking=False)),
            media_type="application/x-ndjson"
        )
    '''
    # run each async generator to completion, in order
    for g in gens:
        async for item in g:
            yield item

async def forward_ollama_stream(messages: List[Message], model: str, title_prompt_present: bool):
    payload = {
        "model": model,
        "messages": [{"role": m.role, "content": m.content} for m in messages],
        "stream": True,
        "think": not title_prompt_present
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", OLLAMA_API_URL, json=payload) as resp:
            async for line in resp.aiter_lines():
                if line:
                    # Ollama might send JSON lines, forward them as NDJSON
                    
                    # Simple response tweak
                    data = json.loads(line)
                    data['message']['content'] = data['message']['content']
                    new_line = json.dumps(data)
                    yield f"{new_line}\n"
                    

async def ollama_generate(prompt: str, context: str, model: str):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant that helps people find agriculture related information."},
            {"role": "user", "content": f"According to this contest: {context}\n please answer this question {prompt}"}
        ],
        "stream": True,
        "think": True
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", OLLAMA_API_URL, json=payload) as resp:
            async for line in resp.aiter_lines():
                if line:
                    # Ollama might send JSON lines, forward them as NDJSON
                    
                    # Simple response tweak
                    data = json.loads(line)
                    msg = data.get('message')
                    done = data.get('done')
                    if isinstance(msg, dict):
                        thinking = msg.get("thinking", None)
                        content  = msg.get("content", "")
                    else:
                        thinking = None
                    
                    if thinking:
                        yield ThinkingResponseChunk(thinking)
                    if content:
                        if done:
                            yield ContentResponseChunk(content, final_chunk=True)
                        yield ContentResponseChunk(content)