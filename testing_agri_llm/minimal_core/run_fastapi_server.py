#!/usr/bin/env python3
"""
FastAPI server for bharatgenai/Param-1-2.9B-Instruct model
Uses vLLM's optimized backend for better performance

Usage:
    CUDA_VISIBLE_DEVICES=0 python run_fastapi_server.py
    
    Or with custom port:
    PORT=8064 CUDA_VISIBLE_DEVICES=0 python run_fastapi_server.py
"""

import os
import sys

# Set CUDA device visibility (can be overridden by environment)
if "CUDA_VISIBLE_DEVICES" not in os.environ:
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"

# Disable multiprocessing to avoid subprocess issues
os.environ["VLLM_USE_MULTIPROCESSING"] = "false"

# Register the model BEFORE importing vLLM
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vllm.model_executor.models import ModelRegistry

# Register PARAM-1 with optimized Llama backend
ModelRegistry.register_model(
    "ParamBharatGenForCausalLM",
    "vllm.model_executor.models.llama:LlamaForCausalLM"
)

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
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
    # Support both models - can be set via environment variable
    # Default: AgriParam (finetuned version)
    model_name = os.environ.get("MODEL_NAME", "bharatgenai/AgriParam")
    print("=" * 60)
    print("Loading Model with vLLM Optimized Backend")
    print("=" * 60)
    print(f"Model: {model_name}")
    print(f"CUDA_VISIBLE_DEVICES: {os.environ.get('CUDA_VISIBLE_DEVICES', 'not set')}")
    print(f"Backend: Optimized Llama (vLLM)")
    
    # Set GPU memory utilization (15% by default for KV cache)
    gpu_memory_utilization = float(os.environ.get("GPU_MEMORY_UTILIZATION", "0.15"))
    swap_space = int(os.environ.get("SWAP_SPACE", "4"))
    print(f"GPU Memory Utilization: {gpu_memory_utilization}")
    print(f"Swap Space: {swap_space}GB")
    print("=" * 60)
    
    try:
        print("Initializing vLLM with optimized backend...")
        llm = LLM(
            model=model_name,
            trust_remote_code=True,
            max_model_len=2048,
            dtype="bfloat16",
            enforce_eager=False,  # Use CUDA graphs for better performance
            gpu_memory_utilization=gpu_memory_utilization,
            swap_space=swap_space,
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
    title="PARAM Model Inference Server",
    description="FastAPI server for bharatgenai/AgriParam and bharatgenai/Param-1-2.9B-Instruct models",
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
    model_name = os.environ.get("MODEL_NAME", "bharatgenai/AgriParam")
    return {
        "message": "PARAM Model Inference Server",
        "model": model_name,
        "supported_models": [
            "bharatgenai/AgriParam",
            "bharatgenai/Param-1-2.9B-Instruct"
        ],
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
    model_name = os.environ.get("MODEL_NAME", "bharatgenai/AgriParam")
    return {
        "object": "list",
        "data": [
            {
                "id": model_name,
                "object": "model",
                "created": 0,
                "owned_by": "bharatgenai"
            },
            {
                "id": "bharatgenai/AgriParam",
                "object": "model",
                "created": 0,
                "owned_by": "bharatgenai"
            },
            {
                "id": "bharatgenai/Param-1-2.9B-Instruct",
                "object": "model",
                "created": 0,
                "owned_by": "bharatgenai"
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
        )
        
        if request.stream:
            # Streaming response
            def generate():
                outputs = llm.generate([prompt], sampling_params, use_tqdm=False)
                generated_text = outputs[0].outputs[0].text
                yield f"data: {JSONResponse(content={'choices': [{'delta': {'content': generated_text}, 'finish_reason': 'stop'}]})}\n\n"
            return generate()
        else:
            # Non-streaming response
            outputs = llm.generate([prompt], sampling_params)
            generated_text = outputs[0].outputs[0].text
            
            # Get token counts from vLLM output
            # vLLM outputs have token_ids in the output
            output = outputs[0]
            prompt_tokens = len(output.prompt_token_ids) if hasattr(output, 'prompt_token_ids') and output.prompt_token_ids else 0
            completion_tokens = len(output.outputs[0].token_ids) if hasattr(output.outputs[0], 'token_ids') and output.outputs[0].token_ids else 0
            total_tokens = prompt_tokens + completion_tokens
            
            return {
                "id": "chatcmpl-123",
                "object": "chat.completion",
                "created": 0,
                "model": request.model or os.environ.get("MODEL_NAME", "bharatgenai/AgriParam"),
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
        print(f"Error in chat_completions: {error_detail}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/completions")
async def completions(request: CompletionRequest):
    """
    OpenAI-compatible completions endpoint for non-chat models.
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
        )
        
        if request.stream:
            # Streaming response
            def generate():
                outputs = llm.generate([prompt], sampling_params, use_tqdm=False)
                generated_text = outputs[0].outputs[0].text
                yield f"data: {JSONResponse(content={'choices': [{'text': generated_text, 'finish_reason': 'stop'}]})}\n\n"
            return generate()
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
                "id": "cmpl-123",
                "object": "text_completion",
                "created": 0,
                "model": request.model or os.environ.get("MODEL_NAME", "bharatgenai/AgriParam"),
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
    port = int(os.environ.get("PORT", 8064))
    host = os.environ.get("HOST", "0.0.0.0")
    
    print("\n" + "=" * 60)
    print("PARAM-1 FastAPI Server")
    print("=" * 60)
    print(f"Server will start on: http://{host}:{port}")
    print(f"CUDA_VISIBLE_DEVICES: {os.environ.get('CUDA_VISIBLE_DEVICES', 'not set')}")
    model_name = os.environ.get("MODEL_NAME", "bharatgenai/AgriParam")
    print(f"GPU Memory Utilization: {os.environ.get('GPU_MEMORY_UTILIZATION', '0.15')}")
    print(f"Swap Space: {os.environ.get('SWAP_SPACE', '4')}GB")
    print(f"Backend: vLLM Optimized (Llama)")
    print(f"Model: {model_name}")
    print("=" * 60)
    print("\nEndpoints:")
    print(f"  - Health: http://{host}:{port}/health")
    print(f"  - Models: http://{host}:{port}/v1/models")
    print(f"  - Chat: http://{host}:{port}/v1/chat/completions")
    print(f"  - Completions: http://{host}:{port}/v1/completions")
    print("\nSupported Models:")
    print("  - bharatgenai/AgriParam (default, finetuned)")
    print("  - bharatgenai/Param-1-2.9B-Instruct")
    print("\nTo use a different model, set MODEL_NAME environment variable:")
    print("  MODEL_NAME=bharatgenai/Param-1-2.9B-Instruct python run_fastapi_server.py")
    print("=" * 60 + "\n")
    
    uvicorn.run(app, host=host, port=port)

