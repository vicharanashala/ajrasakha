FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    POETRY_VERSION=2.0.0

# Set working directory
WORKDIR /app

# Install system dependencies
# Added ffmpeg because pydub (used in api.py for audio duration) requires it
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        build-essential \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install poetry
RUN pip install "poetry==$POETRY_VERSION"

# Copy pyproject.toml and poetry.lock
COPY pyproject.toml poetry.lock ./

# Install dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --no-root

# Copy application code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Run the application via uvicorn
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
