FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt ./

# Upgrade pip to avoid dependency resolution issues
RUN pip3 install --upgrade pip setuptools wheel

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application code
COPY review_search_mcp.py ./
COPY README.md ./

# Create model cache directory
RUN mkdir -p /app/model_cache

# Expose port
EXPOSE 9012

# Run the application
CMD ["python3", "review_search_mcp.py"]
