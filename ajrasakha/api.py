import asyncio
from collections.abc import AsyncGenerator
import json
from urllib.parse import quote_plus
import httpx
from typing import Optional, List, Union
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pydantic.json_schema import JsonSchemaValue
from helpers import ollama_generate
from models import ChatCompletionRequest, Message, ThinkingResponseChunk, ContentResponseChunk
from ce.retrievers.basic import BasicRetriever, MongoDBVectorStoreManager, EmbeddingManager
from llama_index.core.indices.property_graph import SchemaLLMPathExtractor
from llama_index.core import Document
from llama_index.core.indices.property_graph import PropertyGraphIndex
from ollama import AsyncClient
import pymongo

from constants import COLLECTION_POP, COLLECTION_QA
from functions import get_retriever

app = FastAPI(title="AjraSakha")

OLLAMA_MODEL_1 = "qwen3:1.7b"
OLLAMA_MODEL_2 = "deepseek-r1:70b"

username = quote_plus("agriai")
password = quote_plus("agriai1224")

MONGODB_URI = f"mongodb+srv://{username}:{password}@staging.1fo96dy.mongodb.net/?retryWrites=true&w=majority&appName=staging"

OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"
ollama_client = AsyncClient(host="http://100.100.108.13:11434")

client: pymongo.MongoClient = pymongo.MongoClient(MONGODB_URI)

retriever_qa = get_retriever(client=client, collection_name=COLLECTION_QA, similarity_top_k=3)
retriever_pop = get_retriever(client=client, collection_name=COLLECTION_POP, similarity_top_k=10)



async def generate_response(request: ChatCompletionRequest):


    
    total_content = ""
    async for chunk in ollama_generate(prompt=request.messages[-1].content, context=total_content, model=OLLAMA_MODEL_1):
        yield chunk
    
    yield ContentResponseChunk("", final_chunk=True)
        

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
