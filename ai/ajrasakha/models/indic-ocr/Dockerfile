# ============================================================
# IndicOCR — Dockerfile
# ============================================================

ARG HF_TOKEN

# ---- Build stage ----
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates git-lfs build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# Set HF token
ENV HF_TOKEN=${HF_TOKEN}

# Clone the repo using huggingface_hub
RUN pip install huggingface_hub && \
    huggingface-cli download bodhan-ai/indic-ocr --local-dir /tmp/indic-ocr --local-dir-use-symlinks False

# Copy install.sh and run it with venv python
COPY --from=builder /tmp/indic-ocr /tmp/indic-ocr
WORKDIR /tmp/indic-ocr

# Create venv and install into it
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    chmod +x install.sh && \
    /opt/venv/bin/python install.sh --extras all-ocr

# Download model weights into venv
RUN /opt/venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr')"

# ---- Runtime stage ----
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ARG HF_TOKEN

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    CUDA_VISIBLE_DEVICES=0 \
    HF_HOME=/root/.cache/huggingface

WORKDIR /app

# Install Python 3.11 from deadsnakes PPA
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-dev python3.11-distutils \
        python3.11-venv libpython3.11 libgomp1 \
        curl git git-lfs \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Copy venv from builder
COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"

# Copy model repo
COPY --from=builder /tmp/indic-ocr /tmp/indic-ocr

# Pre-downloaded model weights
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Set PYTHONPATH
ENV PYTHONPATH=/tmp/indic-ocr:$PYTHONPATH

# Copy server
COPY server.py /app/server.py

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -sf http://localhost:8000/health || exit 1

CMD ["/opt/venv/bin/python", "/app/server.py"]