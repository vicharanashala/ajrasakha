#!/usr/bin/env bash
set -euo pipefail

# ==========================================================
# Launch Param vLLM server via param_vllm_launcher.py
# ==========================================================
# Usage examples:
#   ./run_param_vllm_launcher.sh
#   MODEL_NAME=bharatgenai/AgriParam CUDA_MIG_DEVICES=MIG-... ./run_param_vllm_launcher.sh

MODEL_NAME="${MODEL_NAME:-bharatgenai/AgriParam}"
PORT="${PORT:-8064}"
HOST="${HOST:-0.0.0.0}"
unset CUDA_VISIBLE_DEVICES
export CUDA_VISIBLE_DEVICES=0



# Set CUDA_VISIBLE_DEVICES to the parent GPU index (or leave 0)
CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-0}"
GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.15}"   # tune up if you have more VRAM
DTYPE="${DTYPE:-float16}"
PYTHON_ENV="${PYTHON_ENV:-/home/aic_u2/Shubhankar/Pop/open_sourced_agri_llm/llm_env/bin/activate}"
LAUNCHER_SCRIPT="${LAUNCHER_SCRIPT:-/home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/agri_param/param_vllm_launcher.py}"
LOGFILE="${LOGFILE:-/home/aic_u2/Shubhankar/Pop/param_vllm_launcher.log}"

echo "=========================================================="
echo "🚀 Starting PARAM vLLM Server (launcher)"
echo "Model Name:        $MODEL_NAME"
echo "Host:              $HOST"
echo "Port:              $PORT"
echo "CUDA_VISIBLE_DEVICES: $CUDA_VISIBLE_DEVICES"

echo "Precision:          $DTYPE"
echo "Launcher Script:   $LAUNCHER_SCRIPT"
echo "Logfile:            $LOGFILE"
echo "=========================================================="

# Activate venv
if [ -f "$PYTHON_ENV" ]; then
    # shellcheck disable=SC1090
    source "$PYTHON_ENV"
else
    echo "⚠️ Python env not found at $PYTHON_ENV" >&2
    exit 1
fi

# Export VLLM / CUDA environment variables
export CUDA_VISIBLE_DEVICES
export VLLM_USE_MULTIPROCESSING=false
export GPU_MEMORY_UTILIZATION


# Build the command line
cmd=(
  python "$LAUNCHER_SCRIPT"
  --model "$MODEL_NAME"
  --port "$PORT"
  --host "$HOST"
  --dtype "$DTYPE"
  --gpu-memory-utilization "$GPU_MEMORY_UTILIZATION"
  --max-model-len "${MAX_MODEL_LEN:-2048}"
  --trust-remote-code
)

echo "Launching: ${cmd[*]}"
# Run and tee logs to file
"${cmd[@]}" 2>&1 | tee -a "$LOGFILE"
