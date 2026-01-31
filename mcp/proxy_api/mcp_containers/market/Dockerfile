# Use a light Alpine base image
FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Install build dependencies mostly for aiohttp and others if wheels are missing
# minimal build deps: gcc, musl-dev, etc.
RUN apk add --no-cache \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 9022

# Command to run the application
CMD ["python", "market_mcp.py"]
