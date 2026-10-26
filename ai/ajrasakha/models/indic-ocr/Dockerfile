# ============================================================
# IndicOCR — Dockerfile
# Multi-stage build that downloads model weights at build time
# so the runtime image is self-contained.
#
# IMPORTANT: This model is gated. You need to:
# 1. Accept the license at https://huggingface.co/bodhan-ai/indic-ocr
# 2. Create a HF token at https://huggingface.co/settings/tokens
# 3. Set HF_TOKEN secret in GitHub Actions
# ============================================================

# ---- Build stage ----
FROM python:3.11-slim AS builder

ARG HF_TOKEN

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates git-lfs build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# Create netrc for HuggingFace authentication
RUN printf "machine huggingface.co\nlogin user\npassword %s\n" "$HF_TOKEN" > ~/.netrc && \
    chmod 600 ~/.netrc

# Set HF token env var
ENV HF_TOKEN=${HF_TOKEN}

# Clone and install the model package
RUN git clone https://huggingface.co/bodhan-ai/indic-ocr /tmp/indic-ocr && \
    cd /tmp/indic-ocr && \
    chmod +x install.sh && \
    ./install.sh --extras all-ocr

# Download model weights
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr')"

# ---- Runtime stage ----
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 libgomp1 curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Copy Python packages from builder (site-packages)
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy model repo (bodhan_genai package)
COPY --from=builder /tmp/indic-ocr /app/bodhan_genai

# Pre-downloaded model weights
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Set HF_HOME for the model
ENV HF_HOME=/root/.cache/huggingface
ENV PYTHONPATH=/app/bodhan_genai:$PYTHONPATH

# Copy server
COPY server.py /app/server.py

EXPOSE 8000

# Health check - model takes ~2-3 min to load
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -sf http://localhost:8000/health || exit 1

CMD ["python", "/app/server.py"]