# ============================================================
# IndicOCR — Dockerfile
# Stage 1: builder (downloads model weights from HuggingFace)
# Stage 2: runtime (lightweight, only what is needed to serve)
#
# IMPORTANT: This model is gated. You need to:
# 1. Accept the license at https://huggingface.co/bodhan-ai/indic-ocr
# 2. Create a HF token at https://huggingface.co/settings/tokens
# 3. Set HF_TOKEN secret in GitHub Actions / environment
# ============================================================

# ---- Build stage ----
FROM python:3.11-slim AS builder

ARG HF_TOKEN

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates git-lfs \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# Configure git to use credentials (for gated repos)
# Create netrc file for git authentication with HF token
RUN printf "machine huggingface.co\nlogin user\npassword %s\n" "$HF_TOKEN" > ~/.netrc && \
    chmod 600 ~/.netrc

# Install uv (faster package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Set HuggingFace token for downloading gated models
# This is used by huggingface_hub for API downloads
ENV HF_TOKEN=${HF_TOKEN}

# Install the model into a venv
# The install.sh script detects CUDA and picks the right wheels automatically.
# We clone the repo so we can run install.sh, then snapshot_download pulls weights.
RUN git clone https://huggingface.co/bodhan-ai/indic-ocr /tmp/indic-ocr && \
    cd /tmp/indic-ocr && \
    uv venv /opt/venv && \
    . /opt/venv/bin/activate && \
    ./install.sh --extras all-ocr

# Snapshot model weights (layout + ocr) — done in the venv so hf_hub is available
RUN . /opt/venv/bin/activate && \
    python -c "from huggingface_hub import snapshot_download; snapshot_download('bodhan-ai/indic-ocr')"

# ---- Runtime stage ----
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-venv libgomp1 \
        curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Copy venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

# Copy the cloned repo (install.sh ran here, needed for the package source)
COPY --from=builder /tmp/indic-ocr /tmp/indic-ocr

# Pre-pull weights into the runtime image so startup doesn't need network
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Copy application files
COPY server.py /app/server.py

# Warm up vLLM engine once at build time so first request is fast.
# Uncomment the following two lines if you want eager warmup (adds ~5 min to build):
# RUN . /opt/venv/bin/activate && \
#     python -c "from bodhan_genai.ocr import IndicOCR; IndicOCR()"

EXPOSE 8000

# Health-check: give the server 90 s to initialise (vLLM engine startup can be slow)
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -sf http://localhost:8000/health || exit 1

CMD ["python", "/app/server.py"]