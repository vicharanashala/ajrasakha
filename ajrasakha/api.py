from urllib.parse import quote_plus
import httpx
from typing import List
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from helpers import ollama_generate
from models import (
    ChatCompletionRequest,
    ContextQuestionAnswerPair,
    ContextRequest,
    QuestionAnswerResponse,
    ThinkingResponseChunk,
    ContentResponseChunk,
)
from llama_index.llms.ollama import Ollama
from llama_index.core import Settings
from constants import CITATION_QA_TEMPLATE, CITATION_REFINE_TEMPLATE, DB_SELECTOR_PROMPT
from ollama import AsyncClient
import pymongo
from llama_index.core.selectors import LLMSingleSelector
import logging
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
import csv
from pathlib import Path
import csv
from pathlib import Path
from functions import (
    process_nodes_for_citations,
    process_nodes_qa,
    process_nodes_pop,
    render_citations,
    render_metadata_table,
    render_pop_markdown,
    render_qa_markdown,
    process_nodes_graph,
    render_graph_markdown,
)
from constants import (
    COLLECTION_POP,
    COLLECTION_QA,
    EMBEDDING_MODEL,
    LLM_MODEL_MAIN,
    LLM_MODEL_FALL_BACK,
    MONGODB_URI,
)
from functions import get_retriever, get_graph_retriever
from llama_index.core.tools import ToolMetadata
from llama_index.core.response_synthesizers import (
    ResponseMode,
    get_response_synthesizer,
)
from helpers import citations_refine
from llama_index.core.query_engine import CitationQueryEngine, BaseQueryEngine
from numpy import dot
from numpy.linalg import norm



logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
LOG_FILE = Path("rag_eval_log.csv")

if not LOG_FILE.exists():
    with open(LOG_FILE, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["question", "answer", "context", "retrieval_time_sec"])

app = FastAPI(title="AjraSakha")
llm = Ollama(
    model=LLM_MODEL_MAIN, base_url="http://100.100.108.13:11434", request_timeout=120
)
Settings.llm = llm
Settings.embed_model = HuggingFaceEmbedding(
    model_name=EMBEDDING_MODEL, cache_folder="./hf_cache", trust_remote_code=True
)

OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"
ollama_client = AsyncClient(host="http://100.100.108.13:11434")

client: pymongo.MongoClient = pymongo.MongoClient(MONGODB_URI)

retriever_qa = get_retriever(
    client=client, collection_name=COLLECTION_QA, similarity_top_k=4
)
retriever_pop = get_retriever(
    client=client, collection_name=COLLECTION_POP, similarity_top_k=10
)
retriever_graph = get_graph_retriever()

tools = [
    ToolMetadata(
        name="qa_tool",
        description="Answer direct Q&A over curated agricultural documents.",
    ),
    ToolMetadata(
        name="pop_tool",
        description="Answer questions based Package of Practices or pop",
    ),
    ToolMetadata(
        name="graph_tool",
        description="Answer long complicated, analytical and causal/relationship queries.",
    ),
    ToolMetadata(
        name="irrelevant",
        description="Use this if the query is a off-topic question, or question asking for summary.",
    ),
]

selector = LLMSingleSelector.from_defaults(
    prompt_template_str=DB_SELECTOR_PROMPT, llm=llm
)


async def generate_response(request: ChatCompletionRequest):
    messages = request.messages
    question = messages[-1].content
    user_embedding = Settings.embed_model.get_text_embedding(question.lower())
    best_match = None
    best_answer = None
    best_score = 0.95

    context = [{"role": msg.role, "content": msg.content} for msg in messages[1:-1]]

    yield ThinkingResponseChunk("Verifying Question and Selecting Source....\n")
    selector_result = await selector.aselect(tools, query=question)
    selection = selector_result.selections[0]
    retriever = None
    match selection.index:
        case 0:
            retriever = retriever_qa
            node_processor = process_nodes_qa
            renderer = render_qa_markdown
            yield ThinkingResponseChunk("Using Golden QA Vector Store for retrieval.\n")
        case 1:
            retriever = retriever_pop
            node_processor = process_nodes_pop
            renderer = render_pop_markdown
            yield ThinkingResponseChunk("Using PoP Vector Store for retrieval.\n")
        case 2:
            retriever = retriever_graph
            node_processor = process_nodes_graph
            renderer = render_graph_markdown
            yield ThinkingResponseChunk("Using Knowledge Graph for retrieval.\n")
        case 3:
            retriever = None
            node_processor = None
            renderer = None

    if retriever:
        nodes = await retriever.aretrieve(question)
        processed_nodes = await node_processor(nodes)
        display_nodes = await renderer(processed_nodes, should_truncate=True)
        context_nodes = await renderer(processed_nodes, should_truncate=False)
        yield ThinkingResponseChunk(display_nodes)
        new_nodes = await process_nodes_for_citations(nodes) 
    
    if(selection.index == 0):
        for qa_pair in processed_nodes:
            # Check similarity with given question using embedding.
            ref_embedding = Settings.embed_model.get_text_embedding(qa_pair.question.lower())
            score = dot(user_embedding, ref_embedding) / (norm(user_embedding) * norm(ref_embedding))
            yield ThinkingResponseChunk("Score: " + str(score))
            if score > best_score:
                best_score = score
                best_match = qa_pair.question
                best_answer = qa_pair.answer
    
    if selection.index == 0 and best_match != None:
        yield ContentResponseChunk(best_answer)
    else:
        async for chunk in citations_refine(new_nodes, question, LLM_MODEL_MAIN):
            yield chunk

        yield ContentResponseChunk("\n #### References: \n")
        yield ContentResponseChunk(await render_metadata_table(new_nodes))
        yield ContentResponseChunk("\n")
        yield ContentResponseChunk(await render_citations(new_nodes))
    
    # if retriever:
    #     retrieved_context = context_nodes
    # else:
    #     retrieved_context = None


    
    # async for chunk in ollama_generate(
    #     context=context,
    #     prompt=question,
    #     model=LLM_MODEL_MAIN,
    #     retrieved_data=retrieved_context,
    # ):
    #     yield chunk

    yield ContentResponseChunk("", final_chunk=True)


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
            agri_specialist=item.meta_data.agri_specialist,
        )
        for item in processed_nodes_qa
    ]

    return response


@app.post("/api/chat/")
async def chat_completions(request: ChatCompletionRequest):
    title_prompt_present = False

    for message in request.messages:
        if (
            "Provide a concise, 5-word-or-less title for the conversation, using title case conventions. Only return the title itself."
            in message.content
        ):
            title_prompt_present = True
            break

    if not request.messages:
        return {"error": "No messages provided"}

    if request.stream:
        if not title_prompt_present:
            return StreamingResponse(
                generate_response(request), media_type="application/x-ndjson"
            )
        else:
            return StreamingResponse(
                ollama_generate(
                    context=[
                        {"role": m.role, "content": m.content}
                        for m in request.messages[:-1]
                    ],
                    prompt=request.messages[-1].content,
                    model=LLM_MODEL_FALL_BACK,
                    retrieved_data=None,
                ),
                media_type="application/x-ndjson",
            )
    else:
        async with httpx.AsyncClient(timeout=None) as client:
            payload = {
                "model": request.model,
                "messages": [
                    {"role": m.role, "content": m.content} for m in request.messages
                ],
                "stream": False,
            }
            resp = await client.post(OLLAMA_API_URL, json=payload)
            return resp.json()
