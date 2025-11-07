# Minimal Core - PARAM Model Registration

This folder contains **ONLY** the essential file needed to run PARAM models with vLLM.

## File

**`run_fastapi_server.py`** - All-in-one FastAPI server that:
1. Registers the model with vLLM (built-in registration)
2. Loads the model with vLLM optimized backend
3. Serves the model via FastAPI with OpenAI-compatible API



**You don't need separate registration files** because the registration is done inline before vLLM is imported.

## Usage

### Run with AgriParam (finetuned):
```bash
cd minimal_core
CUDA_VISIBLE_DEVICES=0 python run_fastapi_server.py
```

### Run with Param-1-2.9B-Instruct:
```bash
cd minimal_core
MODEL_NAME=bharatgenai/Param-1-2.9B-Instruct CUDA_VISIBLE_DEVICES=0 python run_fastapi_server.py
```

## Environment Variables

- **`MODEL_NAME`** - Model to use (default: `bharatgenai/AgriParam`)
- **`CUDA_VISIBLE_DEVICES`** - GPU to use (default: `0`)
- **`GPU_MEMORY_UTILIZATION`** - Memory fraction (default: `0.15`)
- **`SWAP_SPACE`** - Swap space in GB (default: `4`)
- **`PORT`** - Server port (default: `8064`)

## API Endpoints

- `/health` - Health check
- `/v1/models` - List models
- `/v1/chat/completions` - Chat completions
- `/v1/completions` - Text completions

## Test

```bash
curl http://localhost:8064/health
```

```bash
curl -X POST http://localhost:8064/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bharatgenai/AgriParam",
    "prompt": "What is agriculture?",
    "max_tokens": 150
  }'
```



