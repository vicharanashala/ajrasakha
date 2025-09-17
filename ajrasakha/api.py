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
from helpers import boolean_field_checker, ollama_generate, question_releavancy_verifier
from models import ChatCompletionRequest, Message, ThinkingResponseChunk, ContentResponseChunk
from ce.retrievers.basic import BasicRetriever, MongoDBVectorStoreManager, EmbeddingManager
from llama_index.core.indices.property_graph import SchemaLLMPathExtractor
from llama_index.core import Document
from llama_index.core.indices.property_graph import PropertyGraphIndex
from ollama import AsyncClient
import pymongo

from functions import process_nodes_qa, process_nodes_pop, render_pop_markdown, render_qa_markdown

from constants import COLLECTION_POP, COLLECTION_QA, LLM_MODEL_MAIN, LLM_MODEL_FALL_BACK, SYSTEM_PROMPT_QUESTION_RELEVANCY, SYSTEM_PROMPT_RETRIEVE_ANALYSER, SYSTEM_PROMPT_POP_REFERENCE_ANALYSER
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
    """
    Generate a response by checking if the user's question is relevant to Indian agriculture
    and whether retrieval from the knowledge base is required.
    """

    messages = request.messages
    question = messages[-1].content

    # Build context from all messages except the system (0) and latest user question (-1)
    context = [
        {"role": msg.role, "content": msg.content}
        for msg in messages[1:-1]
    ]

    # Case: only 2 messages → first relevant message always requires retrieval
    should_retrieve: bool | None = True if len(messages) == 2 else None

    yield ThinkingResponseChunk("Verifying prompt...")
    # Step 1: Check relevancy
    is_relevant = await boolean_field_checker(
        prompt=question,
        context=context,
        system_prompt=SYSTEM_PROMPT_QUESTION_RELEVANCY,
        llm_model=LLM_MODEL_MAIN,
        field="relevant",
    )

    if not is_relevant:
        # If irrelevant → no retrieval
        should_retrieve = False
        yield ThinkingResponseChunk("Invalid Prompt.\n")
    else:
        yield ThinkingResponseChunk("Valid Prompt.\n")
        # Step 2: Check retrieval only if not first message
        if should_retrieve is None:
            yield ThinkingResponseChunk("Understanding any data to be retrieved...\n")
            should_retrieve = await boolean_field_checker(
                prompt=question,
                context=context,
                system_prompt=SYSTEM_PROMPT_RETRIEVE_ANALYSER,
                llm_model=LLM_MODEL_MAIN,
                field="retrieve",
            )
    
    pop_reference_required = await boolean_field_checker(
        prompt=question,
        context=context,
        system_prompt=SYSTEM_PROMPT_POP_REFERENCE_ANALYSER,
        llm_model=LLM_MODEL_MAIN,
        field="pop_reference"
    )
    
    if(pop_reference_required):
        yield ThinkingResponseChunk("Retrieving data from PoP Dataset...\n")
        nodes_pop = await retriever_pop.aretrieve(question)
        processed_nodes_pop = await process_nodes_pop(nodes_pop)
        display_nodes_pop = await render_pop_markdown(processed_nodes_pop, truncate=True)
        context_nodes_pop = await render_pop_markdown(processed_nodes_pop,truncate=False)
        yield ThinkingResponseChunk(display_nodes_pop)
        yield ThinkingResponseChunk("\nData retrieved.\n")
        

    if(is_relevant and should_retrieve):
        yield ThinkingResponseChunk("Retrieving data from annam.ai GOLDEN Dataset...\n")
        nodes_qa = await retriever_qa.aretrieve(question)
        processed_nodes_qa = await process_nodes_qa(nodes_qa)
        display_nodes_qa = await render_qa_markdown(processed_nodes_qa, truncate=True)
        context_nodes_qa = await render_qa_markdown(processed_nodes_qa,truncate=False)
        yield ThinkingResponseChunk(display_nodes_qa)
        yield ThinkingResponseChunk("\nData retrieved.\n")
        
    elif(is_relevant and not should_retrieve):
        yield ThinkingResponseChunk("Relevant data is already present.\n")
        
    
    async for chunk in ollama_generate(context=context, prompt=question, model=LLM_MODEL_MAIN, retrieved_data=context_nodes_qa if (is_relevant and should_retrieve) else None):
        yield chunk
    
    yield ContentResponseChunk("",final_chunk=True)


        

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