FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run injects its own $PORT and requires the container to listen on
# it, overriding whatever is exposed here; 8005 stays the default for
# local/Render use where nothing sets $PORT.
EXPOSE 8005

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8005}"]
