FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run injects $PORT; 8086 is the default for local use.
EXPOSE 8086
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8086}"]
