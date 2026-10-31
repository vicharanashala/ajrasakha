# ============================================================
# IndicOCR — Dockerfile (Simple: no venv, system Python)
# ============================================================

# ---- Build stage ----
FROM python:3.11-slim AS builder

WORKDIR /tmp/indic-ocr

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates git-lfs build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# Download repo using BuildKit secret
RUN --mount=type=secret,id=hf_token \
    export HF_TOKEN=$(cat /run/secrets/hf_token) && \
    pip install huggingface_hub && \
    python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr', local_dir='/tmp/indic-ocr')"

# Install packages - PyTorch from special index, rest from PyPI
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir transformers accelerate pillow huggingface_hub

# Download model weights
RUN --mount=type=secret,id=hf_token \
    export HF_TOKEN=$(cat /run/secrets/hf_token) && \
    python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr')"

# ---- Runtime stage ----
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    CUDA_VISIBLE_DEVICES=0 \
    HF_HOME=/root/.cache/huggingface \
    PYTHONPATH=/tmp/indic-ocr

WORKDIR /app

# Install Python 3.11 from deadsnakes PPA + pip
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-dev python3.11-distutils python3.11-venv \
        curl git git-lfs \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && python3.11 -m ensurepip --upgrade

# Copy model repo
COPY --from=builder /tmp/indic-ocr /tmp/indic-ocr

# Copy pre-downloaded model weights
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Install packages in runtime (same as builder)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir transformers accelerate pillow huggingface_hub

# Copy server
COPY server.py /app/server.py

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -sf http://localhost:8000/health || exit 1

CMD ["python", "/app/server.py"]