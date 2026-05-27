# ── Build stage ────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install build tools needed for some pymongo/dateutil wheels
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install dependencies in isolation — keeps runtime image clean
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runner

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Create a non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy installed packages from builder (no pip / build tools in runtime)
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY mandi_server.py .

# Transfer ownership to non-root user
RUN chown -R appuser:appuser /app

USER appuser

# Mandi MCP server listens on 9010 by default (override via MANDI_MCP_PORT)
EXPOSE 9010

# Transport and bind address are controlled entirely by environment variables:
#   MANDI_MCP_TRANSPORT  (default: streamable-http)
#   MANDI_MCP_HOST       (default: 0.0.0.0)
#   MANDI_MCP_PORT       (default: 9010)
#   MANDI_MCP_MOUNT_PATH (default: /)
#   MONGO_URI            (required)
CMD ["python", "mandi_server.py"]
