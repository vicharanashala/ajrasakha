FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install python dependencies first (better layer caching)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the server code
COPY graph.py /app/graph.py
COPY values.py /app/values.py

EXPOSE 9010

CMD ["python", "/app/graph.py"]
