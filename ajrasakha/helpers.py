import json
from typing import AsyncIterable, AsyncIterator, List, TypeVar

import httpx
from models import (
    ContentResponseChunk,
    ThinkingResponseChunk,
    KnowledgeGraphNodes,
    get_id,
)
from llama_index.core.schema import NodeWithScore, MetadataMode, TextNode

from constants import SYSTEM_PROMPT_AGRI_EXPERT, CITATION_QA_TEMPLATE
import logging

logger = logging.getLogger("myapp")

OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"

T = TypeVar("T")


def truncate(text: str, max_len: int = 300) -> str:
    """Helper to truncate long text safely."""
    return text if len(text) <= max_len else text[:max_len].rstrip() + "..."


async def stream_string(string: str, thinking=False):
    for chunk in string.split(" "):
        if thinking:
            yield ThinkingResponseChunk(chunk + " ")
        else:
            yield ContentResponseChunk(chunk + " ")


async def achain(*gens: AsyncIterable[T]) -> AsyncIterator[T]:
    """
    Chain multiple async generators into a single async generator.
    Example: StreamingResponse(
            achain(stream_string("This is a test of the emergency broadcast system. This is only a test.", thinking=True), stream_string("This is the actual response from the assistant.", thinking=False)),
            media_type="application/x-ndjson"
        )
    """
    # run each async generator to completion, in order
    for g in gens:
        async for item in g:
            yield item

    payload = {
        "model": model,
        "messages": [{"role": m.role, "content": m.content} for m in messages],
        "stream": True,
        "think": not title_prompt_present,
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", OLLAMA_API_URL, json=payload) as resp:
            async for line in resp.aiter_lines():
                if line:
                    # Ollama might send JSON lines, forward them as NDJSON

                    # Simple response tweak
                    data = json.loads(line)
                    data["message"]["content"] = data["message"]["content"]
                    new_line = json.dumps(data)
                    yield f"{new_line}\n"


async def ollama_generate(
    prompt: str,
    context: List[dict[str, str]],
    model: str,
    retrieved_data: str | None,
    SYSTEM_PROMPT: str = SYSTEM_PROMPT_AGRI_EXPERT,
):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            *context,
            (
                {"role": "user", "content": f"{prompt}"}
                if retrieved_data == None
                else {
                    "role": "user",
                    "content": f"CONTEXT: {retrieved_data} \n\n\n QUESTION: {prompt}",
                }
            ),
        ],
        "stream": True,
        "think": True,
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", OLLAMA_API_URL, json=payload) as resp:
            async for line in resp.aiter_lines():
                if line:
                    data = json.loads(line)
                    msg = data.get("message")
                    done = data.get("done")
                    if isinstance(msg, dict):
                        thinking = msg.get("thinking", None)
                        content = msg.get("content", "")
                    else:
                        thinking = None
                    if thinking:
                        yield ThinkingResponseChunk(thinking)
                    if content:
                        if done:
                            yield ContentResponseChunk(content, final_chunk=True)
                        yield ContentResponseChunk(content)


async def citations_refine(
    question: str, context: List[dict[str, str]], nodes: List[TextNode], model: str
):
    logger.info("Entered citations")

    context_str = ""
    for index in range(len(nodes)):
        node = nodes[index]
        source_str = f"Source {index+1}: \n{node.text}\n"
        context_str += source_str
    

    if nodes:
        user_prompt = f"""
Please provide an answer based solely on the provided sources. 
When referencing information from a source, "
cite the appropriate source(s) using their corresponding numbers.
Every answer should include at least one source citation.
Only cite a source when you are explicitly referencing it.
If none of the sources are helpful, you should indicate that.
For example:\n
Source 1:\n
The sky is red in the evening and blue in the morning.\n
Source 2:\n
Water is wet when the sky is red.\n
Query: When is water wet?\n
Answer: Water will be wet when the sky is red [2], 
which occurs in the evening [1].\n
Now it's your turn. 
        
Below are several numbered sources of information:
            \n------\n
            {context_str}
            \n------\n
            Query: {question}\n
            Answer: 
            """
    else:
        logger.info("Did not select sources....")
        user_prompt = question

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": CITATION_QA_TEMPLATE},
            *context,
            (
                {
                    "role": "user",
                    "content": f"{user_prompt}",
                }
            ),
        ],
        "stream": True,
        "think": True,
    }
    
    logger.info(str(payload))

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", OLLAMA_API_URL, json=payload) as resp:
            async for line in resp.aiter_lines():
                if line:
                    data = json.loads(line)
                    msg = data.get("message")
                    done = data.get("done")
                    if isinstance(msg, dict):
                        thinking = msg.get("thinking", None)
                        content = msg.get("content", "")
                    else:
                        thinking = None
                    if thinking:
                        yield ThinkingResponseChunk(thinking)
                    if content:
                        if done:
                            yield ContentResponseChunk(content)
                        yield ContentResponseChunk(content)


def to_mermaid(nodes: List[KnowledgeGraphNodes]) -> str:
    # Mermaid syntax starts with graph direction (TD = top-down)
    lines = ["graph TD"]
    for node in nodes:
        # Each edge: start -->|relation| end
        lines.append(
            f'    {get_id(node.start_node)}["{node.start_node}"] -->|{node.relation_node}| {get_id(node.end_node)}["{node.end_node}"]'
        )
    return "\n".join(lines)
