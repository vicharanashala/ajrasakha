FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x scripts/start.sh

# -------------------------
# Tailscale (optional - see scripts/start.sh. Ported from
# apis/writing_assistant/Dockerfile's same pattern, so both services agree
# on how the self-hosted MiniMax-M2.7 tailnet host gets reached.)
# -------------------------
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /app/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /app/tailscale

RUN mkdir -p \
    /var/run/tailscale \
    /var/cache/tailscale \
    /var/lib/tailscale

# Cloud Run injects its own $PORT and requires the container to listen on
# it, overriding whatever is exposed here; 8005 stays the default for
# local/Render use where nothing sets $PORT (see scripts/start.sh).
EXPOSE 8005

CMD ["sh", "scripts/start.sh"]
