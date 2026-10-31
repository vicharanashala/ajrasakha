# ============================================================
# IndicOCR — Dockerfile
# install.sh installs to SYSTEM Python, not a venv
# ============================================================

# ---- Build stage ----
FROM python:3.11-slim AS builder

WORKDIR /app

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

WORKDIR /tmp/indic-ocr

# Run install.sh - it installs to SYSTEM Python
RUN chmod +x install.sh && bash install.sh --extras all-ocr

# Download model weights to cache
RUN --mount=type=secret,id=hf_token \
    export HF_TOKEN=$(cat /run/secrets/hf_token) && \
    python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr')"

# ---- Runtime stage ----
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ARG HF_TOKEN

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    CUDA_VISIBLE_DEVICES=0 \
    HF_HOME=/root/.cache/huggingface \
    PYTHONPATH=/tmp/indic-ocr

WORKDIR /app

# Install Python 3.11 from deadsnakes PPA + all packages install.sh needs
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-dev python3.11-distutils \
        python3.11-venv libpython3.11 libgomp1 \
        curl git git-lfs \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Install the same packages in runtime
RUN --mount=type=secret,id=hf_token \
    export HF_TOKEN=$(cat /run/secrets/hf_token) && \
    python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir huggingface_hub && \
    /opt/venv/bin/pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    /opt/venv/bin/pip install --no-cache-dir -e . || true

# Copy model repo
COPY --from=builder /tmp/indic-ocr /tmp/indic-ocr

# Pre-downloaded model weights
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Copy server
COPY server.py /app/server.py

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -sf http://localhost:8000/health || exit 1

CMD ["/opt/venv/bin/python", "/app/server.py"]