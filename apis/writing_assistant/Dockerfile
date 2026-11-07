# Use an official Python runtime as a parent image
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x scripts/start.sh

# -------------------------
# Tailscale (optional - see scripts/start.sh. Mirrors backend/Dockerfile.app's
# same pattern, so both services agree on how the tailnet gets reached.)
# -------------------------
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /app/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /app/tailscale

RUN mkdir -p \
    /var/run/tailscale \
    /var/cache/tailscale \
    /var/lib/tailscale

# Cloud Run injects its own $PORT (default 8080) and requires the
# container to listen on it; 8004 stays the default for local/Render use
# where nothing sets $PORT (see scripts/start.sh).
EXPOSE 8004

CMD ["sh", "scripts/start.sh"]
