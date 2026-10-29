FROM python:3.12-slim

WORKDIR /app/ajrasakha/tools/golden

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY ajrasakha/tools/golden/requirements.txt /app/ajrasakha/tools/golden/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY ajrasakha/tools/golden /app/ajrasakha/tools/golden

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/ajrasakha/tools/golden

EXPOSE 8005

CMD ["uvicorn", "golden_api:app", "--host", "0.0.0.0", "--port", "8005"]
