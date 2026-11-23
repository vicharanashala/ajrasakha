# Use an official Python runtime as a parent image
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x scripts/start.sh

# No Tailscale image/binaries needed anymore - Gemini's public API is
# directly reachable over HTTPS, unlike the old self-hosted MiniMax
# model's tailnet-only address.

# Cloud Run injects its own $PORT (default 8080) and requires the
# container to listen on it; 8004 stays the default for local/Render use
# where nothing sets $PORT (see scripts/start.sh).
EXPOSE 8004

CMD ["sh", "scripts/start.sh"]
