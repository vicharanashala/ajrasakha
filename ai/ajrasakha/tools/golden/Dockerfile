FROM python:3.12-slim

# Build context should be ajrasakha/ai (parent of ajrasakha package)
# Build with: docker build -f ajrasakha/tools/golden/Dockerfile -t golden-api .
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY ajrasakha/tools/golden/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the entire ajrasakha package so imports like "from ajrasakha.tools.golden..." work
COPY ajrasakha /app/ajrasakha

# Copy Tailscale startup script
COPY ajrasakha/tools/golden/scripts/tailscale-start.sh /usr/local/bin/tailscale-start.sh
RUN chmod +x /usr/local/bin/tailscale-start.sh

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8005

# Entry point runs Tailscale setup, then executes the CMD
ENTRYPOINT ["/usr/local/bin/tailscale-start.sh"]
CMD ["uvicorn", "ajrasakha.tools.golden.golden_api:app", "--host", "0.0.0.0", "--port", "8005"]
