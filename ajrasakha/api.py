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

from ollama import AsyncClient

app = FastAPI(title="AjraSakha")

OLLAMA_MODEL_1 = "qwen3:1.7b"
OLLAMA_MODEL_2 = "deepseek-r1:70b"

username = quote_plus("agriai")
password = quote_plus("agriai1224")

MONGODB_URI = f"mongodb+srv://{username}:{password}@staging.1fo96dy.mongodb.net/?retryWrites=true&w=majority&appName=staging"

OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"
ollama_client = AsyncClient(host="http://100.100.108.13:11434")


embedding_manager = EmbeddingManager()
embedding_manager.setup()

db_manager = MongoDBVectorStoreManager(
    uri=MONGODB_URI
)


LOCATION_PROMPT = """
Extract the location details from the messages and return ONLY a JSON object in this format:
Rules:
    - Output strictly valid JSON (no markdown, no comments, no extra text).
    - If unsure about a field, set it to null. 
"""

location_schema: JsonSchemaValue = {
    "type": "object",
    "properties": {
        "country": {"type": ["string", "null"]},
        "state": {"type": ["string", "null"]},
        "city": {"type": ["string", "null"]},
        "district": {"type": ["string", "null"]},
    },
    "required": ["country", "state", "city", "district"],
    "additionalProperties": False,
}

class LocationDetails(BaseModel):
    country: Optional[str] = Field(None, description="Country name")
    state: Optional[str] = Field(None, description="State/Province/Region")
    city: Optional[str] = Field(None, description="City or town")
    district: Optional[str] = Field(None, description="District within the city")


databases = {
    "PoP": {
        "collections": ["gujarat"]
    },
    "PoPGenric": {
        "collections": ["genric"]
    },
    "annam_golden_dataset": {
        "collections": ["kcc_revised"]
    }
}


def filter_user_message(messages: List[Message]):
    final_string=""
    for msg in [msg.content for msg in messages if msg.role != "user"]:
        final_string+=msg+"\n"
    return final_string

    

async def generate_response(request: ChatCompletionRequest):
    
    yield ThinkingResponseChunk("Retrieving from Annam.ai Golden Dataset...\n")
    yield ThinkingResponseChunk("Currently Offline.\n")



    vector_store = db_manager.get_vector_store(
        db_name="PoP",
        collection_name="gujarat"
    )
    retriever = BasicRetriever(vector_store=vector_store)

    yield ThinkingResponseChunk("Retrieving from PoP... \n")
    yield ThinkingResponseChunk(f"request: {request.messages[-1].content}\n")
    
    nodes = await retriever.retrieve(request.messages[-1].content)
    context = retriever.build_context(nodes)
    
    # Construct markdown table for context
    yield ThinkingResponseChunk("Context retrieved:\n")
    yield ThinkingResponseChunk("| Rank | Source | Score | Text |\n")
    yield ThinkingResponseChunk("|------|--------|-------|------|\n")
    for part in context: # each part consists of rank, score, source, text
        yield ThinkingResponseChunk(f"| {part['rank']} | {part['source']} | {part['score']} | {part['text']} |\n")
    yield ThinkingResponseChunk("\n")
    yield ThinkingResponseChunk("Generating response... \n")
    
    total_content = "\n".join([part['text'] for part in context])
    async for chunk in ollama_generate(prompt=request.messages[-1].content, context=total_content, model=OLLAMA_MODEL_1):
        yield chunk
    
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
