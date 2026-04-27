# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DEFAULT_TIMEOUT=1000
ENV POETRY_REQUESTS_TIMEOUT=1000
# Install system dependencies, including ffmpeg for pydub
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    ffmpeg \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install poetry
RUN pip install "poetry>=2.0.0,<3.0.0"

# Set the working directory in the container
WORKDIR /app

# Copy the poetry config files
COPY pyproject.toml poetry.lock ./

# Install dependencies using Poetry
# We use --no-root to only install dependencies, not the app itself
# And --no-interaction to prevent any interactive prompts
RUN poetry config virtualenvs.create false \
    && poetry install --no-root --no-interaction

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application using uvicorn
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
