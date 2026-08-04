FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY sync.py /app/sync.py
COPY main.py /app/main.py
COPY email_service.py /app/email_service.py

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Cloud Run expects the process to handle SIGTERM
# No EXPOSE needed for batch jobs
# No CMD needed - will be overridden by Cloud Run Job command

ENTRYPOINT ["python", "-u", "main.py"]