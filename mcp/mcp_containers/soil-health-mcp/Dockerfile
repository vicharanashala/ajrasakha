# Build stage
FROM python:3.11-slim as builder

ENV PYTHONUNBUFFERED=1 \
    POETRY_VERSION=2.0.0 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install poetry
RUN pip install "poetry==$POETRY_VERSION" poetry-plugin-export

WORKDIR /app

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Generate requirements.txt directly instead of using virtualenvs, 
# or build a virtualenv out of poetry. Here we export requirements.
RUN poetry export -f requirements.txt --output requirements.txt --without-hashes

# Runtime stage
FROM python:3.11-slim as runner

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Create a non-root user and group
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install only runtime dependencies
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Change ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port (if HTTP/FastMCP)
EXPOSE 9005

CMD ["python", "server.py"]
