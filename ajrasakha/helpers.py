import json
from typing import AsyncIterable, AsyncIterator, List, TypeVar

import httpx
from models import ContentResponseChunk, Message, ThinkingResponseChunk

from constants import SYSTEM_PROMPT_AGRI_EXPERT, SYSTEM_PROMPT_QUESTION_RELEVANCY, SYSTEM_PROMPT_CONTEXT_VERIFIER, LLM_MODEL_MAIN, LLM_MODEL_FALL_BACK


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


async def boolean_field_checker(prompt: str, context: List[dict[str, str]], system_prompt: str, llm_model: str, field: str) -> bool:
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
    payload = {
        "model": llm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            *context,
            {"role": "user", "content": f"QUESTION: {prompt}"}
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

    async with httpx.AsyncClient(timeout=None) as client:
        resp = await client.post(OLLAMA_API_URL, json=payload)
        data = resp.json()
        content_raw = data.get("message", {}).get("content", "{}")

        try:
            content = json.loads(content_raw)
        except json.JSONDecodeError:
            return False

        value = content.get(field, False)
        if not isinstance(value, bool):
            return False
        return value
                    

async def question_releavancy_verifier(prompt: str, context: str):
    payload = {
        "model": LLM_MODEL_FALL_BACK,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT_QUESTION_RELEVANCY},
            {"role": "user", "content": f"CONTEXT: {context}\n AND \n QUESTION: {prompt} \n\n Answer in JSON format only with field relevant as either true or false."}
        ],
        "stream": False,
        "think": True,
        "format": {
            "type": "object",
            "properties": {
                "relevant" : {
                    "type": "boolean",
                }
            },
            "required": ["relevant"]
        }
    }
    async with httpx.AsyncClient(timeout=None) as client:
        resp = await client.post(OLLAMA_API_URL, json=payload)
        data = resp.json()
        content_raw = data.get('message', {}).get('content', '{}')
        content = json.loads(content_raw)
        relevant = content.get('relevant', False)
        if not isinstance(relevant, bool):
            return False
        return relevant
              
              

async def ollama_generate(prompt: str, context: List[dict[str, str]], model: str, retrieved_data: str | None ):
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