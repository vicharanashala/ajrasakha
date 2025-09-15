import asyncio
from collections.abc import AsyncGenerator
import json
from urllib.parse import quote_plus
import httpx
from typing import Optional, List, Union
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from models import ChatCompletionRequest, Message, ThinkingResponseChunk, ContentResponseChunk
from ce.retrievers.basic import BasicRetriever, MongoDBVectorStoreManager, EmbeddingManager

app = FastAPI(title="AjraSakha")

username = quote_plus("")
password = quote_plus("")

MONGODB_URI = f"mongodb+srv://{username}:{password}@staging.1fo96dy.mongodb.net/?retryWrites=true&w=majority&appName=staging"

OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"

embedding_manager = EmbeddingManager()
embedding_manager.setup()

db_manager = MongoDBVectorStoreManager(
    uri=MONGODB_URI
)


    

async def generate_response(request: ChatCompletionRequest):
    yield ThinkingResponseChunk("Processing your request... \n")
    
    vector_store = db_manager.get_vector_store(
        db_name="PoP",
        collection_name="gujarat"
    )
    retriever = BasicRetriever(vector_store=vector_store)

    
    yield ThinkingResponseChunk("Retrieving relavent data... \n")
    nodes = await retriever.retrieve("What is brahmastra?")
    context = retriever.build_context(nodes)
    for part in context:
        yield ThinkingResponseChunk(f"{part}\n\n")
    yield ThinkingResponseChunk("Generating response... \n")
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
