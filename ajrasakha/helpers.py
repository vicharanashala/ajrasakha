import json
from typing import AsyncIterable, AsyncIterator, List, TypeVar

import httpx
from models import ContentResponseChunk, Message, ThinkingResponseChunk

from constants import SYSTEM_PROMPT_AGRI_EXPERT, SYSTEM_PROMPT_QUESTION_RELEVANCY, SYSTEM_PROMPT_CONTEXT_VERIFIER, LLM_MODEL_MAIN, LLM_MODEL_FALL_BACK, LLM_STRUCTURED_MODEL
import logging

logger = logging.getLogger("myapp")  

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


async def boolean_field_checker(prompt: str, context: List[dict[str, str]], system_prompt: str, llm_model: str, field: str):
    """
    Generic helper function to check a boolean field ('relevant' or 'retrieve')
    using an LLM with structured JSON output.

    Args:
        prompt (str): The user query/question.
        context (str): The available context to answer from.
        system_prompt (str): The system prompt guiding the model's behavior.
        field (str): The expected boolean field in the JSON output.

    Returns:
        bool: The value of the requested field, defaults to False if invalid.
    """
    
    logger = logging.getLogger("myapp.boolean_field_checker")
    unstructured_response = ""
    payload_unstructured = {
        "model": llm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            *context,
            {"role": "user", "content": f"QUESTION: {prompt}"}
        ],
        "stream": True,
        "think": True,
    }

    
    payload_structured = {
        "model": LLM_STRUCTURED_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            *context,
            {"role": "user", "content": f"QUESTION: {unstructured_response}"}
        ],
        "stream": False,
        "think": True,
        "format": {
            "type": "object",
            "properties": {
                field: {"type": "boolean"}
            },
            "required": [field]
        }
    }
    

    logger.info(f"Starting boolean_field_checker for field={field}")
    

    content_all=""
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", OLLAMA_API_URL, json=payload_unstructured) as resp:
            logger.info("Sent request to Ollama for unstructured response")
            async for line in resp.aiter_lines():
                if line:
                    data = json.loads(line)
                    msg = data.get('message')
                    done = data.get('done')
                    if isinstance(msg, dict):
                        thinking = msg.get("thinking", None)
                        content  = msg.get("content", "")
                    else:
                        thinking = None
                    unstructured_response += thinking if thinking else content
                

                if thinking:
                    yield ThinkingResponseChunk(thinking)   
                else:
                    content_all += content
    
    try:
        parsed_content=json.loads(content_all)
        value = parsed_content.get(field, False)
        yield value
    except json.JSONDecodeError:
        # TODO: Ask another llm again
        yield False
        
    logger.info(f"Response completed by LLM, this is the content{content_all}")
    
    # async with httpx.AsyncClient(timeout=None) as client:
    #     resp = await client.post(OLLAMA_API_URL, json=payload_structured)
    #     logger.info("Sent request to Ollama for structured response")
    #     data = resp.json()
    #     logger.info(str(data))
    #     content_raw = data.get("message", {}).get("content", "{}")

    #     try:
    #         content = json.loads(content_raw)
    #         logger.info(content)
    #     except json.JSONDecodeError:
    #         yield False

    #     value = content.get(field, False)
    #     if not isinstance(value, bool):
    #         yield False
    #         print(field, False)
    #     print(field, value)
    #     yield value      
    

async def ollama_generate(prompt: str, context: List[dict[str, str]], model: str, retrieved_data: str | None):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT_AGRI_EXPERT},
            *context,
            {"role": "user", "content": f"{prompt}"} if retrieved_data == None else {"role": "user", "content": f"CONTEXT: {retrieved_data} \n\n\n QUESTION: {prompt}"}
        ],
        "stream": True,
        "think": True,
    }

    logger.info(str(payload))
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
              
                        
# 1. Check if question is relavant to the field
# 2. If relavent then proceed
# 3. If not relavent then return "I am sorry I can only answer questions related to agriculture"


# 3. Check if question is a follow up question or not
# 4. If follow up question then use the chat history to answer the question
# 5. If not a follow up question then answer the question directly