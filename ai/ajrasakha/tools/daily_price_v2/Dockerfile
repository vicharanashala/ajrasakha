FROM python:3.12-slim

WORKDIR /app/ajrasakha/tools/daily_price_v2

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY ajrasakha/tools/daily_price_v2/requirements.txt /app/ajrasakha/tools/daily_price_v2/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY ajrasakha/tools/daily_price_v2 /app/ajrasakha/tools/daily_price_v2

ENV PYTHONUNBUFFERED=1

EXPOSE 8006

CMD ["fastmcp", "run", "daily_market_price_v2.py", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8006"]
