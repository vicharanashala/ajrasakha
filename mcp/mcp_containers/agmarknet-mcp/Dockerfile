# Build stage
FROM python:3.11-slim as builder

ENV PYTHONUNBUFFERED=1 \
    POETRY_VERSION=2.0.0

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install poetry + export plugin
RUN pip install "poetry==$POETRY_VERSION" poetry-plugin-export

WORKDIR /app

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Export requirements (no dev, no hashes)
RUN poetry export -f requirements.txt --output requirements.txt --without-hashes

# Runtime stage
FROM python:3.11-slim as runner

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install only runtime Python packages
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Change ownership to non-root user
RUN chown -R appuser:appuser /app

USER appuser

# Expose HTTP port
EXPOSE 9004

CMD ["python", "server_agmarknet.py"]
