FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# LibreOffice makes the PDF a reviewer opens from a citation (sync_library.py)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-writer fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./
COPY checker/llm_client.py checker/run_stats.py ./checker/

# the downloaded DOCX and their PDFs are kept here and rebuilt by the sync when the container starts
ENV GDB_LIBRARY_DATA_DIR=/data

ENV PORT=8080
EXPOSE 8080

# Cloud Run sets PORT; the sync thread starts with the service when POP_API_URL and DRAFT_SYNC_MINUTES are set
CMD ["sh", "-c", "uvicorn draft_api:app --host 0.0.0.0 --port ${PORT}"]
