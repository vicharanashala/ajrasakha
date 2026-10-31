# ============================================================
# IndicOCR — Dockerfile
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

# Install uv for fast venv creation
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Create venv with uv --link-mode=copy for cross-image compatibility
RUN /root/.local/bin/uv venv /opt/venv --python 3.11 --link-mode=copy

# Install all packages in venv using uv pip
# Use extra-index-url so PyTorch comes from PyTorch index, rest from PyPI
RUN /root/.local/bin/uv pip install --no-cache \
    --python /opt/venv \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    huggingface_hub torch torchvision transformers accelerate pillow

# Download model weights to cache (huggingface_hub already installed)
RUN --mount=type=secret,id=hf_token \
    export HF_TOKEN=$(cat /run/secrets/hf_token) && \
    /opt/venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr')" || \
    python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr')"

# ---- Runtime stage ----
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    CUDA_VISIBLE_DEVICES=0 \
    HF_HOME=/root/.cache/huggingface \
    PYTHONPATH=/tmp/indic-ocr

WORKDIR /app

# Copy entire venv from builder (has ALL packages)
COPY --from=builder /opt/venv /opt/venv

# Copy model repo
COPY --from=builder /tmp/indic-ocr /tmp/indic-ocr

# Copy pre-downloaded model weights
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Copy server
COPY server.py /app/server.py

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -sf http://localhost:8000/health || exit 1

CMD ["/opt/venv/bin/python", "/app/server.py"]