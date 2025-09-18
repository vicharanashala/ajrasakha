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
from helpers import boolean_field_checker, ollama_generate
from models import ChatCompletionRequest, ContextQuestionAnswerPair, Message, ThinkingResponseChunk, ContentResponseChunk
from ce.retrievers.basic import BasicRetriever, MongoDBVectorStoreManager, EmbeddingManager
from llama_index.core.indices.property_graph import SchemaLLMPathExtractor
from llama_index.core import Document
from llama_index.core.indices.property_graph import PropertyGraphIndex
from llama_index.llms.ollama import Ollama
from llama_index.core import Settings
from constants import DB_SELECTOR_PROMPT
from ollama import AsyncClient
import pymongo
import logging
logging.basicConfig(
    level=logging.INFO,  # could be DEBUG, INFO, WARNING, ERROR
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
import pandas as pd
import csv
import time
from pathlib import Path
LOG_FILE = Path("rag_eval_log.csv")

# Create file with header if it doesn’t exist
if not LOG_FILE.exists():
    with open(LOG_FILE, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["question", "answer", "context", "retrieval_time_sec"])


import csv
import time
from pathlib import Path

from functions import process_nodes_qa, process_nodes_pop, render_pop_markdown, render_qa_markdown, process_nodes_graph, render_graph_markdown

from constants import COLLECTION_POP, COLLECTION_QA, EMBEDDING_MODEL, LLM_MODEL_MAIN, LLM_MODEL_FALL_BACK, SYSTEM_PROMPT_QUESTION_RELEVANCY, SYSTEM_PROMPT_RETRIEVE_ANALYSER, SYSTEM_PROMPT_POP_REFERENCE_ANALYSER
from functions import get_retriever, get_graph_retriever
from llama_index.core.tools import ToolMetadata

app = FastAPI(title="AjraSakha")

llm = Ollama(model=LLM_MODEL_MAIN, base_url="http://100.100.108.13:11434", request_timeout=120)
Settings.llm = llm
Settings.embed_model = HuggingFaceEmbedding(model_name=EMBEDDING_MODEL, cache_folder="./hf_cache", trust_remote_code=True)

username = quote_plus("agriai")
password = quote_plus("agriai1224")

MONGODB_URI = f"mongodb+srv://{username}:{password}@staging.1fo96dy.mongodb.net/?retryWrites=true&w=majority&appName=staging"

OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"
ollama_client = AsyncClient(host="http://100.100.108.13:11434")

client: pymongo.MongoClient = pymongo.MongoClient(MONGODB_URI)


retriever_qa = get_retriever(client=client, collection_name=COLLECTION_QA, similarity_top_k=4)
retriever_pop = get_retriever(client=client, collection_name=COLLECTION_POP, similarity_top_k=10)
retriever_graph = get_graph_retriever()

from llama_index.core.retrievers import RouterRetriever
from llama_index.core.selectors import PydanticMultiSelector, PydanticSingleSelector, LLMSingleSelector
from llama_index.core.tools import RetrieverTool


# --- wrap retrievers as tools ---
qa_tool = RetrieverTool.from_defaults(
    retriever=retriever_qa,
    description="Useful for Q&A over curated QA documents.",
    name="qa_vectorstore",
)

pop_tool = RetrieverTool.from_defaults(
    retriever=retriever_pop,
    description="Useful for retrieving insights from the population dataset.",
    name="pop_vectorstore",
)

graph_tool = RetrieverTool.from_defaults(
    retriever=retriever_graph,
    description="Useful for retrieving relationships and knowledge graph queries.",
    name="neo4j_graph",
)

tools = [
    ToolMetadata(
        name="qa_tool",
        description="Answer direct Q&A over curated agricultural documents."
    ),
    ToolMetadata(
        name="graph_tool",
        description="Answer long complicated, analytical and causal/relationship queries."
    ),
    ToolMetadata(
        name="graph_tool",
        description="Answer causal/relationship queries."
    ),
    ToolMetadata(
        name="irrelevant",
        description="Use this if the query is a off-topic question, or question asking for summary."
    )
]


selector = LLMSingleSelector.from_defaults(prompt_template_str=DB_SELECTOR_PROMPT, llm=llm)



async def generate_response_graph(request: ChatCompletionRequest):
    messages = request.messages
    question = messages[-1].content

    # Build context from all messages except the system (0) and latest user question (-1)
    context = [
        {"role": msg.role, "content": msg.content}
        for msg in messages[1:-1]
    ]
    
    selector_result = await selector.aselect(tools, query=question)
    selection = selector_result.selections[0]
    retriever = None
    match selection.index:
        case 0:
            retriever=retriever_qa
            node_processor=process_nodes_qa
            renderer=render_qa_markdown
        case 1:
            retriever=retriever_pop
            node_processor=process_nodes_pop
            renderer=render_pop_markdown
        case 2:
            retriever=retriever_graph
            node_processor=process_nodes_graph
            renderer=render_graph_markdown
        case 3:
            retriever=None
            node_processor=None
            renderer=None
    

    # Case: only 2 messages → first relevant message always requires retrieval
    should_retrieve: bool | None = True if len(messages) == 2 else None

    is_relevant = False
    async for chunk in boolean_field_checker(prompt=question, context=context, system_prompt=SYSTEM_PROMPT_QUESTION_RELEVANCY, llm_model=LLM_MODEL_MAIN, field="relevant"):

        if isinstance(chunk, ThinkingResponseChunk):
            yield chunk
        elif isinstance(chunk, bool):
            is_relevant = chunk

    if not is_relevant:
        # If irrelevant → no retrieval
        should_retrieve = False
        yield ThinkingResponseChunk("Invalid Prompt.\n")
    else:
        yield ThinkingResponseChunk("Valid Prompt.\n")
        # Step 2: Check retrieval only if not first message
        if should_retrieve is None:
            should_retrieve = False
            yield ThinkingResponseChunk("Starting check for seeing if retrieval is required...")
            async for chunk in boolean_field_checker(prompt=question, context=context, system_prompt=SYSTEM_PROMPT_RETRIEVE_ANALYSER, llm_model=LLM_MODEL_MAIN, field="retrieve"):
                if isinstance(chunk, ThinkingResponseChunk):
                    yield chunk
                elif isinstance(chunk, bool):
                    should_retrieve = chunk
    
        
    if(is_relevant and should_retrieve):
        start_time = time.time()
        nodes_graph = await retriever_graph.aretrieve(question)
        retrieval_time = time.time() - start_time
        processed_nodes_graph = await process_nodes_graph(nodes_graph)
        display_nodes_graph = await render_graph_markdown(processed_nodes_graph)
        context_nodes_graph = display_nodes_graph
        yield ThinkingResponseChunk(display_nodes_graph)
        
    elif(is_relevant and not should_retrieve):
        yield ThinkingResponseChunk("Relevant data is already present.\n")
        
    
    if((is_relevant and should_retrieve)):
        retrieved_context = context_nodes_graph

    async for chunk in ollama_generate(context=context, prompt=question, model=LLM_MODEL_MAIN, retrieved_data=retrieved_context):
        yield chunk

    
    yield ContentResponseChunk("",final_chunk=True)

async def generate_response(request: ChatCompletionRequest):
    """
    Generate a response by checking if the user's question is relevant to Indian agriculture
    and whether retrieval from the knowledge base is required.
    """

    # messages = request.messages
    # question = messages[-1].content

    # # Build context from all messages except the system (0) and latest user question (-1)
    # context = [
    #     {"role": msg.role, "content": msg.content}
    #     for msg in messages[1:-1]
    # ]

    # # Case: only 2 messages → first relevant message always requires retrieval
    # should_retrieve: bool | None = True if len(messages) == 2 else None

    # is_relevant = False
    # async for chunk in boolean_field_checker(prompt=question, context=context, system_prompt=SYSTEM_PROMPT_QUESTION_RELEVANCY, llm_model=LLM_MODEL_MAIN, field="relevant"):

    #     if isinstance(chunk, ThinkingResponseChunk):
    #         yield chunk
    #     elif isinstance(chunk, bool):
    #         is_relevant = chunk

    # if not is_relevant:
    #     # If irrelevant → no retrieval
    #     should_retrieve = False
    #     yield ThinkingResponseChunk("Invalid Prompt.\n")
    # else:
    #     yield ThinkingResponseChunk("Valid Prompt.\n")
    #     # Step 2: Check retrieval only if not first message
    #     if should_retrieve is None:
    #         should_retrieve = False
    #         yield ThinkingResponseChunk("Starting check for seeing if retrieval is required...")
    #         async for chunk in boolean_field_checker(prompt=question, context=context, system_prompt=SYSTEM_PROMPT_RETRIEVE_ANALYSER, llm_model=LLM_MODEL_MAIN, field="retrieve"):
    #             if isinstance(chunk, ThinkingResponseChunk):
    #                 yield chunk
    #             elif isinstance(chunk, bool):
    #                 should_retrieve = chunk
    
    # pop_reference_required = False
    
    # if(is_relevant):
    #     async for chunk in boolean_field_checker(prompt=question, context=context, system_prompt=SYSTEM_PROMPT_POP_REFERENCE_ANALYSER, llm_model=LLM_MODEL_MAIN, field="pop_reference"):
    #         if isinstance(chunk, ThinkingResponseChunk):
    #             yield chunk
    #         elif isinstance(chunk, bool):
    #             pop_reference_required = chunk
    
    # if(pop_reference_required):
    #     start_time = time.time()
    #     nodes_pop = await retriever_pop.aretrieve(question)
    #     retrieval_time = time.time() - start_time
    #     processed_nodes_pop = await process_nodes_pop(nodes_pop)
    #     display_nodes_pop = await render_pop_markdown(processed_nodes_pop, truncate=True)
    #     context_nodes_pop = await render_pop_markdown(processed_nodes_pop,truncate=False)
    #     yield ThinkingResponseChunk(display_nodes_pop)
    #     yield ThinkingResponseChunk("\nData retrieved.\n")
    # else:
    #     pass

        
    # if(is_relevant and should_retrieve and not pop_reference_required):
    #     start_time = time.time()
    #     nodes_qa = await retriever_qa.aretrieve(question)
    #     retrieval_time = time.time() - start_time
    #     processed_nodes_qa = await process_nodes_qa(nodes_qa)
    #     display_nodes_qa = await render_qa_markdown(processed_nodes_qa, truncate=True)
    #     context_nodes_qa = await render_qa_markdown(processed_nodes_qa,truncate=False)
    #     yield ThinkingResponseChunk(display_nodes_qa)
        
    # elif(is_relevant and not should_retrieve):
    #     yield ThinkingResponseChunk("Relevant data is already present.\n")
        
    
    # if((is_relevant and should_retrieve) or (is_relevant and pop_reference_required) or (pop_reference_required)):
    #     if pop_reference_required:
    #         retrieved_context = context_nodes_pop
    #     else:
    #         retrieved_context = context_nodes_qa
    # else:
    #     retrieved_context = None

    # answer_collector: List[any] = []

    # async for chunk in ollama_generate(context=context, prompt=question, model=LLM_MODEL_MAIN, retrieved_data=retrieved_context):
    #     if (isinstance(chunk, ContentResponseChunk)):
    #         answer_collector.append(chunk.text)
    #     yield chunk
    # final_answer = "".join(answer_collector).strip()
    
    # with open(LOG_FILE, mode="a", newline="", encoding="utf-8") as f:
    #     writer = csv.writer(f)
    #     writer.writerow([
    #         question,
    #         final_answer,
    #         (retrieved_context if retrieved_context else "None"),
    #         round(retrieval_time, 3)
    #     ])

    
    yield ContentResponseChunk("",final_chunk=True)

class ContextRequest(BaseModel):
    context: str

class QuestionAnswerResponse(BaseModel):
    question: str
    answer: str
    agri_specialist: str


@app.post("/questions/", response_model=List[QuestionAnswerResponse])
async def get_questions(request: ContextRequest):
    # retrieve context nodes
    nodes = await retriever_qa.aretrieve(request.context)
    
    # process into ContextQuestionAnswerPair list
    processed_nodes_qa: List[ContextQuestionAnswerPair] = await process_nodes_qa(nodes)

    # filter only needed fields
    response = [
        QuestionAnswerResponse(
            question=item.question,
            answer=item.answer,
            agri_specialist=item.meta_data.agri_specialist
        )
        for item in processed_nodes_qa
    ]
    
    return response


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
        if(not title_prompt_present):
            return StreamingResponse(
                generate_response_graph(request),
                media_type="application/x-ndjson"
            )
        else:
            return StreamingResponse(
                ollama_generate(
                    context=[{"role": m.role, "content": m.content} for m in request.messages[:-1]],
                    prompt=request.messages[-1].content,
                    model=LLM_MODEL_FALL_BACK,
                    retrieved_data=None
                ),
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