FROM mcr.microsoft.com/playwright/python:v1.55.0-jammy

WORKDIR /app

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Ensure working directories exist
RUN mkdir -p downloads extracted_tables

CMD ["python3", "pipeline.py", "--state", "Punjab", "--all"]
