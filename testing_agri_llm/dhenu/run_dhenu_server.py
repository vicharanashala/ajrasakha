#!/usr/bin/env python3
"""
FastAPI server for KissanAI/Dhenu2-In-Llama3.1-8B-Instruct model
Uses vLLM's optimized backend for better performance
Uses specific MIG device on CUDA 1

Usage:
    python run_dhenu_server.py
    
    Or with custom port:
    PORT=8063 python run_dhenu_server.py
"""

import os
import sys

# Set CUDA device and MIG device BEFORE importing vLLM
os.environ["CUDA_VISIBLE_DEVICES"] = "1"
os.environ["CUDA_MIG_DEVICES"] = "MIG-3c258235-738f-50c8-8173-6977a3c22ca7"

# Disable multiprocessing to avoid subprocess issues
os.environ["VLLM_USE_MULTIPROCESSING"] = "false"

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import json
from vllm import LLM, SamplingParams
import uvicorn
import traceback
from contextlib import asynccontextmanager

# Global variables for vLLM model
llm = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load vLLM model on startup
    global llm
    model_name = "KissanAI/Dhenu2-In-Llama3.1-8B-Instruct"
    
    print("=" * 60)
    print("Loading Dhenu2 Model with vLLM Optimized Backend")
    print("=" * 60)
    print(f"Model: {model_name}")
    print(f"CUDA_VISIBLE_DEVICES: {os.environ.get('CUDA_VISIBLE_DEVICES', 'not set')}")
    print(f"CUDA_MIG_DEVICES: {os.environ.get('CUDA_MIG_DEVICES', 'not set')}")
    print(f"Backend: vLLM")
    
    # Set GPU memory utilization
    gpu_memory_utilization = float(os.environ.get("GPU_MEMORY_UTILIZATION", "0.7"))
    # max_model_len = int(os.environ.get("MAX_MODEL_LEN", "512"))
    max_model_len = 2048
    print(f"GPU Memory Utilization: {gpu_memory_utilization}")
    print(f"Max Model Length: {max_model_len}")
    print("=" * 60)
    
    try:
        print("Initializing vLLM with optimized backend...")
        llm = LLM(
            model=model_name,
            trust_remote_code=True,
            max_model_len=max_model_len,
            dtype="auto",
            enforce_eager=False,  # Use CUDA graphs for better performance
            gpu_memory_utilization=gpu_memory_utilization,
        )
        print("✓ Model loaded successfully with vLLM optimized backend!")
        print("=" * 60)
    except Exception as e:
        print(f"✗ Error loading model: {e}")
        traceback.print_exc()
        raise
    
    yield
    
    # Cleanup on shutdown
    print("\nShutting down...")
    llm = None

app = FastAPI(
    title="Dhenu2 Model Inference Server",
    description="FastAPI server for KissanAI/Dhenu2-In-Llama3.1-8B-Instruct model",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0
    stream: Optional[bool] = False

class CompletionRequest(BaseModel):
    model: str
    prompt: str
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0
    stream: Optional[bool] = False
    stop: Optional[List[str]] = None

@app.get("/")
async def root():
    return {
        "message": "Dhenu2 Model Inference Server",
        "model": "KissanAI/Dhenu2-In-Llama3.1-8B-Instruct",
        "status": "running"
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model_loaded": llm is not None,
        "backend": "vLLM Optimized"
    }

@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": "KissanAI/Dhenu2-In-Llama3.1-8B-Instruct",
                "object": "model",
                "created": 0,
                "owned_by": "KissanAI"
            }
        ]
    }

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    global llm
    
    if llm is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Format messages as prompt
        prompt_parts = []
        for msg in request.messages:
            if msg.role == "system":
                prompt_parts.append(f"System: {msg.content}")
            elif msg.role == "user":
                prompt_parts.append(f"User: {msg.content}")
            elif msg.role == "assistant":
                prompt_parts.append(f"Assistant: {msg.content}")
        
        prompt = "\n".join(prompt_parts) + "\nAssistant:"
        
        # Use vLLM for generation
        sampling_params = SamplingParams(
            temperature=request.temperature,
            top_p=request.top_p,
            max_tokens=request.max_tokens,
            repetition_penalty=1.1,
        )
        
        if request.stream:
            # Generate once and stream the response in chunks to mimic token streaming
            outputs = llm.generate([prompt], sampling_params, use_tqdm=False)
            generated_text = outputs[0].outputs[0].text

            async def token_stream():
                request_id = "chatcmpl-dhenu2-stream"
                chunk_size = 20
                try:
                    for i in range(0, len(generated_text), chunk_size):
                        delta_text = generated_text[i : i + chunk_size]
                        if not delta_text:
                            continue
                        chunk = {
                            "id": request_id,
                            "object": "chat.completion.chunk",
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {"content": delta_text},
                                    "finish_reason": None,
                                }
                            ],
                            "model": request.model,
                        }
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        await asyncio.sleep(0)
                    finished_chunk = {
                        "id": request_id,
                        "object": "chat.completion.chunk",
                        "choices": [
                            {
                                "index": 0,
                                "delta": {},
                                "finish_reason": "stop",
                            }
                        ],
                        "model": request.model,
                    }
                    yield f"data: {json.dumps(finished_chunk, ensure_ascii=False)}\n\n"
                finally:
                    yield "data: [DONE]\n\n"
                    await asyncio.sleep(0.05)

            return StreamingResponse(
                token_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                    "Transfer-Encoding": "chunked",
                },
            )
        else:
            # Non-streaming response
            outputs = llm.generate([prompt], sampling_params)
            generated_text = outputs[0].outputs[0].text
            
            # Get token counts from vLLM output
            output = outputs[0]
            prompt_tokens = len(output.prompt_token_ids) if hasattr(output, 'prompt_token_ids') and output.prompt_token_ids else 0
            completion_tokens = len(output.outputs[0].token_ids) if hasattr(output.outputs[0], 'token_ids') and output.outputs[0].token_ids else 0
            total_tokens = prompt_tokens + completion_tokens
            
            return {
                "id": "chatcmpl-dhenu2",
                "object": "chat.completion",
                "created": 0,
                "model": "KissanAI/Dhenu2-In-Llama3.1-8B-Instruct",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": generated_text
                    },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens
                }
            }
    except Exception as e:
        error_detail = f"{str(e)}\n\n{traceback.format_exc()}"
        # print(f"Error in chat_completions: {error_detail}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/completions")
async def completions(request: CompletionRequest):
    """
    OpenAI-compatible completions endpoint.
    Uses vLLM's optimized backend.
    """
    global llm
    
    if llm is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Use the prompt directly
        prompt = request.prompt
        
        # Use vLLM for generation
        sampling_params = SamplingParams(
            temperature=request.temperature,
            top_p=request.top_p,
            max_tokens=request.max_tokens,
            stop=request.stop if request.stop else None,
            repetition_penalty=1.1,
        )
        
        if request.stream:
            # Generate once and stream the response in chunks to mimic token streaming
            outputs = llm.generate([prompt], sampling_params, use_tqdm=False)
            generated_text = outputs[0].outputs[0].text

            async def token_stream():
                request_id = "cmpl-dhenu2-stream"
                chunk_size = 20
                try:
                    for i in range(0, len(generated_text), chunk_size):
                        delta_text = generated_text[i : i + chunk_size]
                        if not delta_text:
                            continue
                        chunk = {
                            "id": request_id,
                            "object": "text_completion.chunk",
                            "choices": [
                                {
                                    "index": 0,
                                    "text": delta_text,
                                    "finish_reason": None,
                                }
                            ],
                            "model": request.model,
                        }
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        await asyncio.sleep(0)
                    finished_chunk = {
                        "id": request_id,
                        "object": "text_completion.chunk",
                        "choices": [
                            {
                                "index": 0,
                                "text": "",
                                "finish_reason": "stop",
                            }
                        ],
                        "model": request.model,
                    }
                    yield f"data: {json.dumps(finished_chunk, ensure_ascii=False)}\n\n"
                finally:
                    yield "data: [DONE]\n\n"
                    await asyncio.sleep(0.05)

            return StreamingResponse(
                token_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                    "Transfer-Encoding": "chunked",
                },
            )
        else:
            # Non-streaming response
            outputs = llm.generate([prompt], sampling_params)
            generated_text = outputs[0].outputs[0].text
            
            # Get token counts from vLLM output
            output = outputs[0]
            prompt_tokens = len(output.prompt_token_ids) if hasattr(output, 'prompt_token_ids') and output.prompt_token_ids else 0
            completion_tokens = len(output.outputs[0].token_ids) if hasattr(output.outputs[0], 'token_ids') and output.outputs[0].token_ids else 0
            total_tokens = prompt_tokens + completion_tokens
            
            return {
                "id": "cmpl-dhenu2",
                "object": "text_completion",
                "created": 0,
                "model": "KissanAI/Dhenu2-In-Llama3.1-8B-Instruct",
                "choices": [{
                    "text": generated_text,
                    "index": 0,
                    "logprobs": None,
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens
                }
            }
    except Exception as e:
        error_detail = f"{str(e)}\n\n{traceback.format_exc()}"
        print(f"Error in completions: {error_detail}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8063))
    host = os.environ.get("HOST", "0.0.0.0")
    
    print("\n" + "=" * 60)
    print("Dhenu2 FastAPI Server")
    print("=" * 60)
    print(f"Server will start on: http://{host}:{port}")
    print(f"CUDA_VISIBLE_DEVICES: {os.environ.get('CUDA_VISIBLE_DEVICES', 'not set')}")
    print(f"CUDA_MIG_DEVICES: {os.environ.get('CUDA_MIG_DEVICES', 'not set')}")
    print(f"GPU Memory Utilization: {os.environ.get('GPU_MEMORY_UTILIZATION', '0.2')}")
    print(f"Max Model Length: {os.environ.get('MAX_MODEL_LEN', '1024')}")
    print(f"Backend: vLLM Optimized")
    print(f"Model: KissanAI/Dhenu2-In-Llama3.1-8B-Instruct")
    print("=" * 60)
    print("\nEndpoints:")
    print(f"  - Health: http://{host}:{port}/health")
    print(f"  - Models: http://{host}:{port}/v1/models")
    print(f"  - Chat: http://{host}:{port}/v1/chat/completions")
    print(f"  - Completions: http://{host}:{port}/v1/completions")
    print("=" * 60 + "\n")
    
    uvicorn.run(app, host=host, port=port)

