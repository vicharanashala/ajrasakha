FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY whatsapp-bot/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY whatsapp-bot/ ./whatsapp-bot/
COPY shared/ ./shared/

ENV PYTHONPATH=/app

EXPOSE 5000

CMD ["python", "whatsapp-bot/app.py"]