#!/usr/bin/env python3
"""
Launcher that registers Param model into vLLM's ModelRegistry
and then runs vLLM's OpenAI-compatible API server as a module.
This avoids trying to import a missing `main` symbol.
"""

import runpy
import sys
from pathlib import Path

# --- Optional: adjust sys.path so local code is importable (if needed) ---
HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

# --- Register Param model mapping to Llama backend so vLLM can load it ---
try:
    from vllm.model_executor.models import ModelRegistry
    ModelRegistry.register_model(
        "ParamBharatGenForCausalLM",
        "vllm.model_executor.models.llama:LlamaForCausalLM"
    )
    print("✅ Registered ParamBharatGenForCausalLM -> LlamaForCausalLM")
except Exception as e:
    print(f"⚠️ Model registration warning: {e}", file=sys.stderr)

# --- Execute the vllm entrypoint module as __main__ (same as python -m ...) ---
if __name__ == "__main__":
    runpy.run_module("vllm.entrypoints.openai.api_server", run_name="__main__")
