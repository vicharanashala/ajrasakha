#!/usr/bin/env bash
# ===============================================
# Dhenu2 vLLM OpenAI-Compatible API Server
# ===============================================

# Configuration
MODEL="KissanAI/Dhenu2-In-Llama3.1-8B-Instruct"
PORT=8063
HOST="0.0.0.0"
GPU_MEMORY_UTILIZATION=0.7
MAX_MODEL_LEN=4096
CUDA_VISIBLE_DEVICES=1
MIG_DEVICE="MIG-3c258235-738f-50c8-8173-6977a3c22ca7"
PYTHON_ENV="${PYTHON_ENV:-/home/aic_u2/Shubhankar/Pop/open_sourced_agri_llm/llm_env/bin/activate}"
source "$PYTHON_ENV"
# Export environment variables
export CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES
export CUDA_MIG_DEVICES=$MIG_DEVICE
export VLLM_USE_MULTIPROCESSING=false
export GPU_MEMORY_UTILIZATION=$GPU_MEMORY_UTILIZATION
export MAX_MODEL_LEN=$MAX_MODEL_LEN

echo "==============================================="
echo "🚀 Starting Dhenu2 vLLM API Server"
echo "Model: $MODEL"
echo "Host:  $HOST"
echo "Port:  $PORT"
echo "GPU:   $CUDA_VISIBLE_DEVICES ($MIG_DEVICE)"
echo "Memory Utilization: $GPU_MEMORY_UTILIZATION"
echo "Context Length:     $MAX_MODEL_LEN"
echo "==============================================="

# Run vLLM’s built-in OpenAI API-compatible server
python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --port "$PORT" \
  --host "$HOST" \
  --gpu-memory-utilization "$GPU_MEMORY_UTILIZATION" \
  --max-model-len "$MAX_MODEL_LEN" \
  --trust-remote-code \
  --dtype auto \
  --enforce-eager false
