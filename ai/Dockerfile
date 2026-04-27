FROM python:3.12-slim-bookworm AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Create non-root user for runtime
RUN addgroup --system app && adduser --system --ingroup app app

# -----------------------------
# Builder stage
# -----------------------------
FROM base AS builder

COPY --from=ghcr.io/astral-sh/uv:0.10.0 /uv /bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cached layer)
COPY README.md ./
COPY pyproject.toml ./
COPY uv.loc[k] ./
RUN uv sync --no-dev --no-install-project --compile-bytecode



# Copy source and install project
COPY ajrasakha/ ./ajrasakha/
RUN uv sync --no-dev --compile-bytecode
RUN uv pip install aegra-cli
RUN ls /app/.venv/bin/aegra

# -----------------------------
# Runtime stage
# -----------------------------
FROM base AS final

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*


COPY README.md ./
COPY --from=builder /app/.venv /app/.venv
COPY aegra.json .
COPY ajrasakha/ ./ajrasakha/

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/ajrasakha:$PYTHONPATH"

EXPOSE 2026

USER app

CMD ["aegra", "serve"]
