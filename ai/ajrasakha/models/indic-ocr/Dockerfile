# ============================================================
# IndicOCR — Dockerfile (vLLM on CUDA 12)
# ============================================================

# ---- Build stage: fetch the gated model repo (code + weights) ----
FROM python:3.11-slim AS builder

RUN pip install --no-cache-dir huggingface_hub

# Download repo using BuildKit secret
RUN --mount=type=secret,id=hf_token \
    export HF_TOKEN=$(cat /run/secrets/hf_token) && \
    python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr', local_dir='/tmp/indic-ocr')"

# ---- Runtime stage ----
# The target GPU VM's driver supports CUDA 12.7 (torch reports "found version 12070"), and a CUDA 13
# build fails on it with "NVIDIA driver on your system is too old". vLLM 0.32.0 is the last release
# with a CUDA 12 build (0.33 is CUDA 13 only), and a 12.9 build runs on a 12.7 driver through
# NVIDIA's minor version compatibility. Do not bump this tag until the driver is upgraded.
#
# This official image already has matching vllm, torch (cu129) and torchvision, plus transformers,
# fastapi, uvicorn and pillow. Do not pip install torch or vllm on top of it.
FROM vllm/vllm-openai:v0.32.0-cu129

ENV PYTHONUNBUFFERED=1 \
    CUDA_VISIBLE_DEVICES=0 \
    PYTHONPATH=/tmp/indic-ocr \
    VLLM_WORKER_MULTIPROC_METHOD=spawn

WORKDIR /app

# Copy model repo
COPY --from=builder /tmp/indic-ocr /tmp/indic-ocr

# Copy server
COPY server.py vllm_recognizer.py /app/

# Fail the build, not the deployment, if the image stops providing what the server needs.
RUN command -v curl \
    && python3 -c "import fastapi, uvicorn, python_multipart, PIL, torch, torchvision, transformers, vllm; \
assert torch.version.cuda.startswith('12.'), f'expected a CUDA 12 torch, got {torch.version.cuda}'; \
print('torch', torch.__version__, 'cuda', torch.version.cuda, 'vllm', vllm.__version__, 'transformers', transformers.__version__)"

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -sf http://localhost:8000/health || exit 1

# The base image's entrypoint is `vllm serve`.
ENTRYPOINT []
CMD ["python3", "/app/server.py"]
