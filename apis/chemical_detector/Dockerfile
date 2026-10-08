# slim python image - small image, no extra OS stuff we don't need
FROM python:3.10-slim

# don't write .pyc files, and print logs straight away instead of buffering
# (buffered logs would otherwise show up late/out of order in Render's log viewer)
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# copy just requirements first so Docker can cache this layer - it only
# re-installs packages when requirements.txt actually changes, not on every
# code edit, which makes rebuilds faster
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# now copy the actual app code
COPY . .

# the port the app listens on inside the container
EXPOSE 8002

# start the API
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
