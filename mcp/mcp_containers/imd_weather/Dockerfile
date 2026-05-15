FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl bash \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY service.py common.py api_app.py mcp_app.py server.py run.sh ./
RUN chmod +x run.sh

EXPOSE 9004 9005

CMD ["./run.sh"]
