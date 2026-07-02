# Use python 3.11 slim (Debian) instead of Alpine because we need 
# support for Data Science libraries (torch, numpy) used by langchain-huggingface
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
# gcc/g++ are often needed for building some python extensions
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install dependencies
# Using --no-cache-dir to keep image size smaller
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
# This matches the directory structure where local imports are relative
COPY . .

# Expose the port
EXPOSE 9023

# Run the MCP server
CMD ["python", "agriculture_mcp.py"]
