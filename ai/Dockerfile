# =============================================================================
# AjraSakha LangGraph API - Docker image with Tailscale support
# =============================================================================
# This Dockerfile adds Tailscale integration to enable the LangGraph API to
# communicate with internal services (100.100.x.x) on the tailnet.
#
# Key features:
# - Tailscale userspace networking with SOCKS5 proxy
# - s6-overlay for process supervision (tailscale + langgraph as separate services)
# - Waits for Tailscale to be ready before starting the LangGraph API
#
# Build args (set during docker build):
#   TAILSCALE_AUTHKEY  - Auth key (tskey-auth-...) from Tailscale admin console
#                        Note: This is set at build time and CAN be overridden
#                        at runtime by Cloud Run env vars (runtime takes precedence)
#
# Runtime environment variables:
#   TS_HOSTNAME        - Optional hostname for this instance (default: ajrasakha-langgraph)
#   TS_DERP_REGION     - Optional DERP region to lock to (default: auto)
#   SKIP_TAILSCALE_STATUS - Set to "true" to skip Tailscale checks (for local dev)
# =============================================================================

ARG TAILSCALE_AUTHKEY

FROM python:3.12-slim-bookworm AS base

ENV TAILSCALE_AUTHKEY=${TAILSCALE_AUTHKEY}

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Create non-root user for runtime
RUN addgroup --system app && adduser --system --ingroup app app

# -------------------------------------------------------------------
# Install s6-overlay for process supervision
# -------------------------------------------------------------------
ARG S6_OVERLAY_VERSION=3.2.3.0
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    xz-utils \
    bash \
    && curl -sL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz -o /tmp/s6-overlay-noarch.tar.xz \
    && tar -C / -Jxf /tmp/s6-overlay-noarch.tar.xz \
    && curl -sL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz -o /tmp/s6-overlay-x86_64.tar.xz \
    && tar -C / -Jxf /tmp/s6-overlay-x86_64.tar.xz \
    && rm -rf /tmp/s6-overlay-*.tar.xz \
    && mkdir -p /etc/services.d/tailscale /etc/services.d/langgraph

# -------------------------------------------------------------------
# Install Tailscale (for tailnet mesh networking)
# -------------------------------------------------------------------
RUN apt-get install -y --no-install-recommends gnupg \
    && curl -fsSL https://pkgs.tailscale.com/stable/tailscale_1.76.6_amd64.tgz | tar -xz -C /tmp \
    && cp /tmp/tailscale_1.76.6_amd64/tailscaled /usr/local/bin/ \
    && cp /tmp/tailscale_1.76.6_amd64/tailscale /usr/local/bin/ \
    && rm -rf /tmp/tailscale_* \
    && mkdir -p /var/run/tailscale /var/lib/tailscale /var/cache/tailscale \
    && apt-get remove -y gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

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

# Install PostgreSQL 18 client
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libpq5 \
    gnupg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && ln -sf /usr/lib/postgresql/18/bin/pg_dump /usr/local/bin/pg_dump \
    && rm -rf /var/lib/apt/lists/*

# Copy s6 service scripts
COPY s6-scripts/tailscale-run /etc/services.d/tailscale/run
COPY s6-scripts/langgraph-run /etc/services.d/langgraph/run
COPY s6-scripts/wait-for-socks5.py /app/s6-scripts/wait-for-socks5.py

# Make scripts executable
RUN chmod +x /etc/services.d/tailscale/run /etc/services.d/langgraph/run /app/s6-scripts/wait-for-socks5.py

# Copy README
COPY README.md ./

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application code
COPY aegra.json .
COPY ajrasakha/ ./ajrasakha/

# Create logs directory
RUN mkdir -p /app/logs

# Environment variables
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/ajrasakha:$PYTHONPATH" \
    # Default Tailscale hostname - can be overridden at runtime
    TS_HOSTNAME=ajrasakha-langgraph

EXPOSE 2026

# Use s6-overlay init binary as entrypoint
ENTRYPOINT ["/init"]

# Default command (overridden by s6 services)
CMD []