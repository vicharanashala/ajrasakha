FROM python:3.12-slim

WORKDIR /app

# TLS roots for calling embedding endpoint over HTTP(S)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install python deps for Golden tool
COPY ajrasakha/tools/golden/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy only the Golden tool code (self-contained)
COPY ajrasakha/tools/golden /app/ajrasakha/tools/golden

ENV PYTHONUNBUFFERED=1

EXPOSE 8005

CMD ["python", "-m", "fastmcp", "run", "ajrasakha/tools/golden/golden_rag_tool.py", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8005"]
