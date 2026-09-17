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

# Install PostgreSQL 18 client and cron
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libpq5 \
    gnupg \
    cron \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && ln -sf /usr/lib/postgresql/18/bin/pg_dump /usr/local/bin/pg_dump \
    && rm -rf /var/lib/apt/lists/*

# Setup cron for daily backup at 2 AM IST
RUN echo 'SHELL=/bin/bash' >> /etc/crontab \
    && echo 'PATH=/usr/local/bin:/usr/bin:/bin' >> /etc/crontab \
    && echo '0 2 * * * root cd /app && IS_BACKUP=true python3 -m ajrasakha.agents.backup_to_gcs >> /var/log/backup.log 2>&1' >> /etc/crontab \
    && mkdir -p /var/run /var/log \
    && chmod 777 /var/run /var/log

# Create start.sh before switching to non-root user
RUN echo '#!/bin/bash\ncron\n/app/.venv/bin/aegra serve' > /start.sh && chmod +x /start.sh


COPY README.md ./
COPY --from=builder /app/.venv /app/.venv
COPY aegra.json .
COPY ajrasakha/ ./ajrasakha/

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/ajrasakha:$PYTHONPATH"

EXPOSE 2026

CMD ["/start.sh"]
