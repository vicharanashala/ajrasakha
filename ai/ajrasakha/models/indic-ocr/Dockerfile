# syntax=docker/dockerfile:1
# ============================================================
# IndicOCR — Dockerfile
# Multi-stage build: builder installs everything into /opt/venv,
# runtime copies it. Both stages share the same base so the venv's
# interpreter path (/usr/bin/python3.11) is identical in each.
#
# The HuggingFace token is passed as a BuildKit secret (id=hf_token),
# never as ARG/ENV, so it is not stored in any image layer or cache.
# ============================================================

# ---- Base stage: CUDA runtime + Python 3.11 ----
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/root/.cache/huggingface

# Install Python 3.11 from deadsnakes PPA
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-dev python3.11-distutils \
        python3.11-venv libpython3.11 libgomp1 \
        curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# ---- Build stage ----
FROM base AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        git git-lfs build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# Create the venv first so everything below installs into it
RUN python3.11 -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

RUN pip install --no-cache-dir --upgrade pip

# Server dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt huggingface_hub

# Clone and install the model package. The token is only used for the clone;
# the remote URL is reset afterwards so it is not left in .git/config (the
# repo is copied into the runtime image).
RUN --mount=type=secret,id=hf_token,required=true \
    HF_TOKEN="$(cat /run/secrets/hf_token)" && \
    git clone "https://user:${HF_TOKEN}@huggingface.co/bodhan-ai/indic-ocr" /tmp/indic-ocr && \
    cd /tmp/indic-ocr && \
    git remote set-url origin https://huggingface.co/bodhan-ai/indic-ocr && \
    chmod +x install.sh && \
    ./install.sh --extras all-ocr

# Download model weights
RUN --mount=type=secret,id=hf_token,required=true \
    HF_TOKEN="$(cat /run/secrets/hf_token)" \
    python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr')"

# ---- Runtime stage ----
FROM base AS runtime

ENV CUDA_VISIBLE_DEVICES=0 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

# Copy venv from builder
COPY --from=builder /opt/venv /opt/venv

# Copy model repo (bodhan_genai package; server.py adds it to sys.path)
COPY --from=builder /tmp/indic-ocr /tmp/indic-ocr

# Pre-downloaded model weights
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Copy server
COPY server.py /app/server.py

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -sf http://localhost:8000/health || exit 1

CMD ["python", "/app/server.py"]
