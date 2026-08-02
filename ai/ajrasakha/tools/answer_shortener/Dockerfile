FROM python:3.12-slim

WORKDIR /app/ajrasakha/tools/answer_shortener

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/ajrasakha/tools/answer_shortener

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY ajrasakha/tools/answer_shortener/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ajrasakha/tools/answer_shortener .

EXPOSE 8007

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8007"]