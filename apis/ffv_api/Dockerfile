# slim python image - small image, no extra OS stuff we don't need
FROM python:3.10-slim

# don't write .pyc files, and print logs straight away instead of buffering
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# build context is the repo root (not this directory) - this service needs to
# reach ai/ajrasakha/ffv/scripts/generate_ffvs.py, which lives outside apis/,
# so every COPY path below is repo-root-relative

# copy just requirements first so Docker can cache this layer
COPY apis/ffv_api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# now copy the app code, plus the existing FFV generation script we reuse -
# main.py looks for it in this exact "ffv_scripts" folder next to itself
COPY apis/ffv_api/main.py .
COPY ai/ajrasakha/ffv/scripts/generate_ffvs.py ./ffv_scripts/generate_ffvs.py

EXPOSE 8003

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]
