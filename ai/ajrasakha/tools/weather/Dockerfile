FROM python:3.12-slim

WORKDIR /app/ajrasakha/tools/weather

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY ajrasakha/tools/weather/requirements.txt /app/ajrasakha/tools/weather/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY ajrasakha/tools/weather /app/ajrasakha/tools/weather

ENV PYTHONUNBUFFERED=1

EXPOSE 8007

CMD ["fastmcp", "run", "weather_tools2.py", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8007"]
